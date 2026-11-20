import { beforeEach, describe, expect, it } from 'vitest';
import { COUNT_COLUMNS, CountSupplier, CountVariant, UTF8_BOM, parseCsv } from '../catalog/initial-count.js';
import { InMemoryStockRepository } from '../repositories/in-memory-stock.repository.js';
import { InMemoryUserRepository } from '../repositories/in-memory-user.repository.js';
import { InitialCountError, InitialCountService, InitialCountSource } from './initial-count.service.js';
import { StockService } from './stock.service.js';

const OWNER = { id: 'u-owner', email: 'dueno@vapeupar.co', role: 'owner' as const, active: true };
const OPERATOR = { id: 'u-op', email: 'operador@vapeupar.co', role: 'operator' as const, active: true };
const RETIRED = { id: 'u-old', email: 'antiguo@vapeupar.co', role: 'owner' as const, active: false };
const SUPPLIERS: CountSupplier[] = [{ id: 's-norte', name: 'Distribuidora Norte', active: true }];

type Seed = Omit<CountVariant, 'stockCache'>;
const SEED: Seed[] = [
  { id: 'v-mango', slug: 'mango-ice', name: 'Mango Ice', active: true, sortOrder: 0, productSlug: 'lifepod-eco-3', productName: 'ECO 3', brandName: 'LifePod' },
  { id: 'v-menta', slug: 'menta', name: 'Menta', active: true, sortOrder: 1, productSlug: 'lifepod-eco-3', productName: 'ECO 3', brandName: 'LifePod' },
  { id: 'v-blue', slug: 'electric-blue', name: 'Electric Blue', active: true, sortOrder: 0, productSlug: 'lifepod-one', productName: 'ONE', brandName: 'LifePod' },
  { id: 'v-off', slug: 'retirada', name: 'Retirada', active: false, sortOrder: 9, productSlug: 'lifepod-one', productName: 'ONE', brandName: 'LifePod' }
];

let stockRepo: InMemoryStockRepository;
let stock: StockService;
let service: InitialCountService;

/** El catálogo lee el stock del mismo repositorio en memoria, como la base real. */
function sourceFor(repo: InMemoryStockRepository): InitialCountSource {
  return {
    listVariants: async () => Promise.all(SEED.map(async v => ({ ...v, stockCache: (await repo.getStockCache(v.id)) ?? 0 }))),
    listSuppliers: async () => SUPPLIERS
  };
}

beforeEach(() => {
  stockRepo = new InMemoryStockRepository();
  for (const v of SEED) stockRepo.addVariant({ id: v.id, name: v.name, productId: v.productSlug, productName: v.productName, active: v.active });
  stock = new StockService(stockRepo);
  service = new InitialCountService(sourceFor(stockRepo), stockRepo, stock, new InMemoryUserRepository([OWNER, OPERATOR, RETIRED]));
});

/** Rellena la planilla exportada como lo haría el dueño en Excel: cantidad, costo y proveedor por variantId. */
async function filledTemplate(fill: Record<string, [string, string?, string?]>): Promise<string> {
  const { csv } = await service.exportTemplate();
  const records = parseCsv(csv).records.map(r => r.fields);
  const lines = records.map((fields, i) => {
    if (i === 0) return fields.join(';');
    const [cantidad, costo = '', proveedor = ''] = fill[fields[0]] ?? ['0'];
    return [...fields.slice(0, 7), cantidad, costo, proveedor].join(';');
  });
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}

const run = (csvText: string, apply: boolean, batch = '2026-11', userEmail = OWNER.email) =>
  service.importCount({ csvText, batch, userEmail, apply });

describe('InitialCountService.exportTemplate', () => {
  it('una fila por variante activa con el stock actual, y nada más', async () => {
    await stock.recordMovement({ variantId: 'v-blue', type: 'inbound', quantity: 3, userId: OWNER.id, operationKey: 'previo-0001' });
    const { csv, rows } = await service.exportTemplate();
    expect(rows).toBe(3);
    const records = parseCsv(csv).records.map(r => r.fields);
    expect(records[0]).toEqual([...COUNT_COLUMNS]);
    expect(records.slice(1).map(r => [r[0], r[6], r[7], r[8]])).toEqual([
      ['v-mango', '0', '', ''], ['v-menta', '0', '', ''], ['v-blue', '3', '', '']
    ]);
  });
});

describe('InitialCountService.importCount', () => {
  it('dry-run: planifica y no escribe nada', async () => {
    const csv = await filledTemplate({ 'v-mango': ['10', '21.000', 'Distribuidora Norte'], 'v-blue': ['4', '25000'] });
    const result = await run(csv, false);
    expect(result.applied).toBe(false);
    expect(result.plan.canApply).toBe(true);
    expect(result.plan.totals.inbound).toEqual({ rows: 2, units: 14, cost: 310000 });
    expect(stockRepo.movements).toHaveLength(0);
    expect(stockRepo.audits).toHaveLength(0);
  });

  it('apply: registra ingresos y ajustes auditados y firmados por el owner', async () => {
    await stock.recordMovement({ variantId: 'v-blue', type: 'inbound', quantity: 6, userId: OWNER.id, operationKey: 'previo-0001' });
    const csv = await filledTemplate({ 'v-mango': ['10', '21000', 'distribuidora norte'], 'v-blue': ['4'] });
    const result = await run(csv, true);

    expect(result.applied).toBe(true);
    expect(result.results.map(r => [r.ref, r.stock, r.replayed])).toEqual([
      ['lifepod-eco-3/mango-ice', 10, false], ['lifepod-one/electric-blue', 4, false]
    ]);
    const batch = stockRepo.movements.filter(m => m.operationKey.startsWith('conteo-inicial:'));
    expect(batch).toEqual([
      expect.objectContaining({
        variantId: 'v-mango', type: 'inbound', quantity: 10, unitCost: 21000, supplierId: 's-norte', userId: OWNER.id,
        reason: 'Conteo físico inicial 2026-11', operationKey: 'conteo-inicial:2026-11:lifepod-eco-3/mango-ice'
      }),
      expect.objectContaining({
        variantId: 'v-blue', type: 'adjustment', quantity: -2, unitCost: null, supplierId: null, userId: OWNER.id,
        reason: 'Conteo físico inicial 2026-11'
      })
    ]);
    expect(stockRepo.audits.slice(-2).map(a => [a.entityId, a.action, a.userId])).toEqual([
      ['v-mango', 'stock.inbound', OWNER.id], ['v-blue', 'stock.adjustment', OWNER.id]
    ]);
    expect(await stockRepo.getStockCache('v-menta')).toBe(0);
  });

  it('idempotente: repetir el mismo lote no duplica y lo informa como ya registrado', async () => {
    const csv = await filledTemplate({ 'v-mango': ['10', '21000'], 'v-menta': ['2', '21000'] });
    await run(csv, true);
    const movements = stockRepo.movements.length;

    const again = await run(csv, true);
    expect(again.applied).toBe(true);
    expect(again.results).toEqual([]);
    expect(again.plan.totals.replayed).toBe(2);
    expect(again.plan.totals.inbound.rows).toBe(0);
    expect(stockRepo.movements).toHaveLength(movements);
    expect(await stockRepo.getStockCache('v-mango')).toBe(10);
  });

  it('el mismo lote con otros datos es error: la corrección va con un lote nuevo, como ajuste', async () => {
    await run(await filledTemplate({ 'v-mango': ['10', '21000'] }), true);
    const corrected = await filledTemplate({ 'v-mango': ['9', '21000'] });

    const sameBatch = await run(corrected, true);
    expect(sameBatch.applied).toBe(false);
    expect(sameBatch.plan.errors[0].message).toMatch(/--batch nuevo/);

    const newBatch = await run(corrected, true, '2026-11-b');
    expect(newBatch.results).toEqual([expect.objectContaining({ ref: 'lifepod-eco-3/mango-ice', stock: 9 })]);
    expect(stockRepo.movements.at(-1)).toMatchObject({ type: 'adjustment', quantity: -1, reason: 'Conteo físico inicial 2026-11-b' });
  });

  it('con cualquier error no escribe nada, aunque se pida apply', async () => {
    const csv = (await filledTemplate({ 'v-mango': ['10', '21000'], 'v-menta': ['2', '21000', 'Proveedor Fantasma'] }));
    const result = await run(csv, true);
    expect(result.applied).toBe(false);
    expect(result.plan.errors).toEqual([{ row: 3, message: expect.stringMatching(/Proveedor Fantasma/) }]);
    expect(stockRepo.movements).toHaveLength(0);
  });

  it('una variante activa sin fila bloquea el apply', async () => {
    const csv = (await filledTemplate({ 'v-mango': ['10', '21000'] })).split('\r\n').filter(l => !l.startsWith('v-menta')).join('\r\n');
    const result = await run(csv, true);
    expect(result.applied).toBe(false);
    expect(result.plan.missing.map(v => v.id)).toEqual(['v-menta']);
    expect(stockRepo.movements).toHaveLength(0);
  });

  it('exige un owner activo', async () => {
    const csv = await filledTemplate({});
    await expect(run(csv, false, '2026-11', OPERATOR.email)).rejects.toThrow(/no es owner/);
    await expect(run(csv, false, '2026-11', RETIRED.email)).rejects.toThrow(/desactivado/);
    await expect(run(csv, false, '2026-11', 'nadie@x.co')).rejects.toThrow(InitialCountError);
  });

  it('rechaza un lote inválido y un CSV roto', async () => {
    await expect(run(await filledTemplate({}), false, 'lote 1')).rejects.toThrow(/--batch/);
    await expect(run('variantId;cantidad\n"roto', false)).rejects.toThrow(/no es un CSV válido/);
  });

  it('una venta real entre el plan y la escritura detiene la importación bajo el bloqueo, sin perderla', async () => {
    await stock.recordMovement({ variantId: 'v-blue', type: 'inbound', quantity: 6, userId: OWNER.id, operationKey: 'previo-0001' });
    const csv = await filledTemplate({ 'v-mango': ['10', '21000'], 'v-blue': ['4'] });
    // La venta entra justo antes de escribir el ajuste de v-blue, ya planificado contra 6.
    let sold = false;
    const racing: Pick<StockService, 'recordMovement'> = {
      recordMovement: async input => {
        if (input.variantId === 'v-blue' && !sold) {
          sold = true;
          await stock.recordMovement({ variantId: 'v-blue', type: 'sale', quantity: 1, userId: OWNER.id, operationKey: 'venta-whatsapp-1' });
        }
        return stock.recordMovement(input);
      }
    };
    const svc = new InitialCountService(sourceFor(stockRepo), stockRepo, racing, new InMemoryUserRepository([OWNER]));
    await expect(svc.importCount({ csvText: csv, batch: '2026-11', userEmail: OWNER.email, apply: true }))
      .rejects.toThrow(/Fila \d+ \(lifepod-one\/electric-blue\): STOCK_CHANGED .*1 movimiento\(s\) ya aplicados; repetir el mismo --batch continúa/);
    expect(await stockRepo.getStockCache('v-blue')).toBe(5);
    expect(stockRepo.movements.filter(m => m.type === 'adjustment')).toHaveLength(0);
  });

  it('aborta sin escribir si el plan recalculado difiere de la vista previa confirmada', async () => {
    const preview = await run(await filledTemplate({ 'v-mango': ['10', '21000'] }), false);
    const edited = await filledTemplate({ 'v-mango': ['10', '22000'] });
    await expect(service.importCount({ csvText: edited, batch: '2026-11', userEmail: OWNER.email, apply: true, confirmedPlan: preview.plan }))
      .rejects.toThrow(/El plan cambió desde la vista previa/);
    expect(stockRepo.movements).toHaveLength(0);

    const same = await filledTemplate({ 'v-mango': ['10', '21000'] });
    const ok = await service.importCount({ csvText: same, batch: '2026-11', userEmail: OWNER.email, apply: true, confirmedPlan: preview.plan });
    expect(ok.results).toHaveLength(1);
  });

  it('un fallo a mitad deja aplicadas las anteriores y repetir el lote continúa sin duplicar', async () => {
    const csv = await filledTemplate({ 'v-mango': ['10', '21000'], 'v-menta': ['2', '21000'], 'v-blue': ['3', '25000'] });
    let calls = 0;
    const flaky: Pick<StockService, 'recordMovement'> = {
      recordMovement: async input => {
        if (++calls === 2) throw new Error('se cayó el túnel');
        return stock.recordMovement(input);
      }
    };
    const svc = new InitialCountService(sourceFor(stockRepo), stockRepo, flaky, new InMemoryUserRepository([OWNER]));
    await expect(svc.importCount({ csvText: csv, batch: '2026-11', userEmail: OWNER.email, apply: true }))
      .rejects.toThrow(/se cayó el túnel\. 1 movimiento\(s\) ya aplicados; repetir el mismo --batch continúa/);
    expect(stockRepo.movements).toHaveLength(1);

    const resumed = await run(csv, true);
    expect(resumed.plan.totals.replayed).toBe(1);
    expect(resumed.results.map(r => [r.ref, r.stock, r.replayed])).toEqual([
      ['lifepod-eco-3/menta', 2, false], ['lifepod-one/electric-blue', 3, false]
    ]);
    expect(stockRepo.movements).toHaveLength(3);
    expect(await run(csv, true)).toMatchObject({ results: [], plan: { totals: { replayed: 3 } } });
  });

  it('repetir un ajuste sobre stock previo es replay, no un segundo ajuste', async () => {
    await stock.recordMovement({ variantId: 'v-blue', type: 'inbound', quantity: 6, userId: OWNER.id, operationKey: 'previo-0001' });
    const csv = await filledTemplate({ 'v-blue': ['4'] });
    const first = await run(csv, true);
    expect(first.results).toEqual([expect.objectContaining({ ref: 'lifepod-one/electric-blue', stock: 4, replayed: false })]);

    const again = await run(csv, true);
    expect(again.plan.errors).toEqual([]);
    expect(again.plan.rows.find(r => r.variant.id === 'v-blue')?.action.kind).toBe('replayed');
    expect(again.results).toEqual([]);
    expect(stockRepo.movements.filter(m => m.type === 'adjustment')).toHaveLength(1);
    expect(await stockRepo.getStockCache('v-blue')).toBe(4);
  });
});
