import {
  CountPlan,
  CountSupplier,
  CountVariant,
  CsvError,
  ExistingCountMovement,
  buildCountTemplate,
  countReason,
  isValidBatch,
  operationKeyFor,
  parseCsv,
  planInitialCount
} from '../catalog/initial-count.js';
import { StockRepository } from '../repositories/stock.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { StockError, StockService } from './stock.service.js';

/**
 * Exporta la planilla del conteo físico inicial y la importa como movimientos
 * de stock (item `carga-datos-reales`). No escribe nada por su cuenta: cada
 * movimiento pasa por `StockService.recordMovement`, que bloquea la variante,
 * aplica la idempotencia por `operationKey` y deja la fila en `AuditLog`.
 */

/** Lectura del catálogo que necesita el conteo. */
export interface InitialCountSource {
  /** Todas las variantes, activas e inactivas, con su línea y marca. */
  listVariants(): Promise<CountVariant[]>;
  listSuppliers(): Promise<CountSupplier[]>;
}

/** Algo impide planificar o aplicar: usuario, lote, archivo o cambio durante la importación. */
export class InitialCountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InitialCountError';
  }
}

export interface AppliedRow {
  row: number;
  ref: string;
  stock: number;
  replayed: boolean;
}

export interface ImportResult {
  plan: CountPlan;
  /** `false` en el dry-run o si el plan tiene errores. */
  applied: boolean;
  results: AppliedRow[];
}

export interface ImportOptions {
  csvText: string;
  batch: string;
  userEmail: string;
  /** Sin `apply` solo se planifica: no se escribe nada. */
  apply: boolean;
}

export class InitialCountService {
  constructor(
    private readonly source: InitialCountSource,
    private readonly stockRepository: StockRepository,
    private readonly stock: StockService,
    private readonly users: UserRepository
  ) {}

  public async exportTemplate(): Promise<{ csv: string; rows: number }> {
    return buildCountTemplate(await this.source.listVariants());
  }

  /** El movimiento queda firmado por este usuario: tiene que ser un owner activo. */
  private async resolveOwner(email: string): Promise<string> {
    const normalized = email.trim().toLowerCase();
    const user = normalized ? await this.users.findByEmail(normalized) : undefined;
    if (!user) throw new InitialCountError(`No hay ningún usuario con el correo "${email}"`);
    if (!user.active) throw new InitialCountError(`El usuario ${user.email} está desactivado`);
    if (user.role !== 'owner') throw new InitialCountError(`El usuario ${user.email} no es owner (rol ${user.role})`);
    return user.id;
  }

  /** Movimientos de este lote que ya están en el libro, con el disponible tras cada uno. */
  private async existingMovements(variants: CountVariant[], batch: string): Promise<Map<string, ExistingCountMovement>> {
    const found = new Map<string, ExistingCountMovement>();
    for (const variant of variants) {
      const key = operationKeyFor(batch, variant.productSlug, variant.slug);
      const movements = await this.stockRepository.listMovements(variant.id, {});
      let balance = 0;
      for (const m of movements) {
        balance += m.quantity;
        if (m.operationKey === key) {
          found.set(key, { movementId: m.id, type: m.type, balanceAfter: balance, unitCost: m.unitCost, supplierId: m.supplierId });
          break;
        }
      }
    }
    return found;
  }

  public async importCount(options: ImportOptions): Promise<ImportResult> {
    if (!isValidBatch(options.batch)) {
      throw new InitialCountError(`--batch "${options.batch}" no es válido: letras, números, punto, guion o guion bajo, hasta 40`);
    }
    const userId = await this.resolveOwner(options.userEmail);

    let records;
    try {
      records = parseCsv(options.csvText).records;
    } catch (error) {
      if (error instanceof CsvError) throw new InitialCountError(`La planilla no es un CSV válido: ${error.message}`);
      throw error;
    }

    const [variants, suppliers] = await Promise.all([this.source.listVariants(), this.source.listSuppliers()]);
    const existing = await this.existingMovements(variants, options.batch);
    const plan = planInitialCount({ records, variants, suppliers, batch: options.batch, existing });

    if (!options.apply || !plan.canApply) return { plan, applied: false, results: [] };

    const results: AppliedRow[] = [];
    for (const row of plan.rows) {
      const { action, variant } = row;
      if (action.kind !== 'inbound' && action.kind !== 'adjustment') continue;
      const ref = `${variant.productSlug}/${variant.slug}`;
      const done = `${results.length} movimiento(s) ya aplicados; repetir con el mismo --batch continúa sin duplicarlos`;

      // El ajuste se calculó contra este stock: si cambió (una venta en medio),
      // registrarlo dejaría un disponible distinto del contado.
      const current = await this.stockRepository.getStockCache(variant.id);
      if (current !== row.stockBefore) {
        throw new InitialCountError(
          `Fila ${row.row} (${ref}): el stock cambió durante la importación (${row.stockBefore} → ${current}). ${done}`
        );
      }

      try {
        const result = await this.stock.recordMovement({
          variantId: variant.id,
          type: action.kind,
          quantity: action.quantity,
          reason: countReason(options.batch),
          supplierId: action.kind === 'inbound' ? action.supplierId ?? undefined : undefined,
          unitCost: action.kind === 'inbound' ? action.unitCost : undefined,
          userId,
          operationKey: row.operationKey
        });
        results.push({ row: row.row, ref, stock: result.stock, replayed: result.replayed });
      } catch (error) {
        if (error instanceof StockError) {
          throw new InitialCountError(`Fila ${row.row} (${ref}): ${error.code} ${error.message}. ${done}`);
        }
        throw error;
      }
    }
    return { plan, applied: true, results };
  }
}
