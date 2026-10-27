import { randomUUID } from 'node:crypto';
import { AuditRecord } from '../services/audit.service.js';
import { LowStockVariant, StockMovement } from '../types/stock.types.js';
import { DuplicateOperationKeyError, NewStockMovement, StockRepository, StockTransaction } from './stock.repository.js';

interface VariantState {
  id: string;
  name: string;
  productId: string;
  productName: string;
  active: boolean;
  stockCache: number;
}

interface State {
  variants: Map<string, VariantState>;
  movements: StockMovement[];
  audits: AuditRecord[];
}

function clone(state: State): State {
  return {
    variants: new Map([...state.variants].map(([id, v]) => [id, { ...v }])),
    movements: [...state.movements],
    audits: [...state.audits]
  };
}

/**
 * Repositorio en memoria para tests. Reproduce lo que el servicio da por
 * supuesto de la base: las transacciones se ejecutan de una en una (como el
 * bloqueo de fila) y se revierten completas si lanzan.
 */
export class InMemoryStockRepository implements StockRepository {
  private state: State = { variants: new Map(), movements: [], audits: [] };
  private queue: Promise<unknown> = Promise.resolve();

  /** @param now reloj inyectable, para probar rangos de fecha. */
  constructor(private readonly now: () => Date = () => new Date()) {}

  // --- Ayudas de test: preparan o inspeccionan el estado sin pasar por el servicio.

  public addVariant(variant: Omit<VariantState, 'stockCache' | 'active'> & Partial<VariantState>): void {
    this.state.variants.set(variant.id, { active: true, stockCache: 0, ...variant });
  }

  /** Escribe la caché directamente, para simular un descuadre. */
  public corruptStockCache(variantId: string, stockCache: number): void {
    const variant = this.state.variants.get(variantId);
    if (variant) variant.stockCache = stockCache;
  }

  public get movements(): readonly StockMovement[] {
    return this.state.movements;
  }

  public get audits(): readonly AuditRecord[] {
    return this.state.audits;
  }

  // --- StockRepository

  public transaction<T>(work: (tx: StockTransaction) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const draft = clone(this.state);
      const result = await work(this.transactionOps(draft));
      this.state = draft;
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  public async getStockCache(variantId: string): Promise<number | undefined> {
    return this.state.variants.get(variantId)?.stockCache;
  }

  public async sumLedger(variantId: string, before?: Date): Promise<number> {
    return sum(this.state.movements, variantId, before);
  }

  public async listMovements(variantId: string, range: { from?: Date; to?: Date }): Promise<StockMovement[]> {
    return this.state.movements.filter(m =>
      m.variantId === variantId
      && (!range.from || m.createdAt >= range.from)
      && (!range.to || m.createdAt <= range.to));
  }

  public async findLowStock(threshold: number): Promise<LowStockVariant[]> {
    return [...this.state.variants.values()]
      .filter(v => v.active && v.stockCache <= threshold)
      .sort((a, b) => a.stockCache - b.stockCache || a.name.localeCompare(b.name))
      .map(v => ({
        variantId: v.id,
        variantName: v.name,
        productId: v.productId,
        productName: v.productName,
        stock: v.stockCache
      }));
  }

  private transactionOps(draft: State): StockTransaction {
    return {
      lockVariant: async variantId => {
        const variant = draft.variants.get(variantId);
        return variant ? { stockCache: variant.stockCache } : undefined;
      },
      findMovementByKey: async key => draft.movements.find(m => m.operationKey === key),
      insertMovement: async (movement: NewStockMovement) => {
        if (draft.movements.some(m => m.operationKey === movement.operationKey)) {
          throw new DuplicateOperationKeyError(movement.operationKey);
        }
        const row: StockMovement = { ...movement, id: randomUUID(), createdAt: this.now() };
        draft.movements.push(row);
        return row;
      },
      setStockCache: async (variantId, stockCache) => {
        const variant = draft.variants.get(variantId);
        if (!variant) throw new Error(`Variante ${variantId} inexistente`);
        variant.stockCache = stockCache;
      },
      sumLedger: async variantId => sum(draft.movements, variantId),
      audit: {
        write: async record => {
          draft.audits.push(record);
        }
      }
    };
  }
}

function sum(movements: readonly StockMovement[], variantId: string, before?: Date): number {
  return movements
    .filter(m => m.variantId === variantId && (!before || m.createdAt < before))
    .reduce((total, m) => total + m.quantity, 0);
}
