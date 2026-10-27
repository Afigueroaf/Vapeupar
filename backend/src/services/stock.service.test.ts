import { beforeEach, describe, it, expect } from 'vitest';
import { StockError, StockService, RecordMovementInput } from './stock.service.js';
import { InMemoryStockRepository } from '../repositories/in-memory-stock.repository.js';

const VARIANT = 'var-mango-ice';
const USER = 'user-owner';

let repo: InMemoryStockRepository;
let service: StockService;
let clock: Date;
let keySeq = 0;

function movement(overrides: Partial<RecordMovementInput>): RecordMovementInput {
  return { variantId: VARIANT, type: 'inbound', quantity: 1, userId: USER, operationKey: `op-test-${++keySeq}`, ...overrides };
}

async function expectStockError(promise: Promise<unknown>, code: StockError['code']): Promise<void> {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof StockError && e.code === code);
}

beforeEach(() => {
  clock = new Date('2026-10-01T12:00:00Z');
  repo = new InMemoryStockRepository(() => new Date(clock));
  repo.addVariant({ id: VARIANT, name: 'Mango Ice', productId: 'eco-3', productName: 'LifePod ECO 3' });
  service = new StockService(repo);
});

describe('StockService.recordMovement: signo por tipo', () => {
  it('inbound suma', async () => {
    const r = await service.recordMovement(movement({ type: 'inbound', quantity: 50, unitCost: 21000, supplierId: 'sup-1' }));
    expect(r.movement.quantity).toBe(50);
    expect(r.stock).toBe(50);
    expect(r.replayed).toBe(false);
  });

  it('sale resta', async () => {
    await service.recordMovement(movement({ quantity: 10 }));
    const r = await service.recordMovement(movement({ type: 'sale', quantity: 3 }));
    expect(r.movement.quantity).toBe(-3);
    expect(r.stock).toBe(7);
  });

  it('shrinkage resta', async () => {
    await service.recordMovement(movement({ quantity: 10 }));
    const r = await service.recordMovement(movement({ type: 'shrinkage', quantity: 2, reason: 'Llegó roto' }));
    expect(r.movement.quantity).toBe(-2);
    expect(r.stock).toBe(8);
  });

  it('return suma', async () => {
    const r = await service.recordMovement(movement({ type: 'return', quantity: 1 }));
    expect(r.movement.quantity).toBe(1);
    expect(r.stock).toBe(1);
  });

  it('adjustment respeta el signo dado, en ambos sentidos', async () => {
    await service.recordMovement(movement({ quantity: 10 }));
    const down = await service.recordMovement(movement({ type: 'adjustment', quantity: -4, reason: 'Conteo físico' }));
    expect(down.movement.quantity).toBe(-4);
    const up = await service.recordMovement(movement({ type: 'adjustment', quantity: 2, reason: 'Conteo físico' }));
    expect(up.stock).toBe(8);
  });

  it('rechaza cantidad negativa en tipos con signo propio, y cero en cualquiera', async () => {
    await expectStockError(service.recordMovement(movement({ type: 'sale', quantity: -3 })), 'VALIDATION');
    await expectStockError(service.recordMovement(movement({ type: 'inbound', quantity: 0 })), 'VALIDATION');
    await expectStockError(service.recordMovement(movement({ type: 'adjustment', quantity: 0, reason: 'x' })), 'VALIDATION');
    await expectStockError(service.recordMovement(movement({ quantity: 1.5 })), 'VALIDATION');
  });
});

describe('StockService.recordMovement: reglas', () => {
  it('rechaza un ajuste sin motivo, también si el motivo es solo espacios', async () => {
    await expectStockError(service.recordMovement(movement({ type: 'adjustment', quantity: -1 })), 'VALIDATION');
    await expectStockError(service.recordMovement(movement({ type: 'adjustment', quantity: -1, reason: '   ' })), 'VALIDATION');
    expect(repo.movements).toHaveLength(0);
  });

  it('no deja el stock en negativo salvo con un ajuste', async () => {
    await service.recordMovement(movement({ quantity: 2 }));
    await expectStockError(service.recordMovement(movement({ type: 'sale', quantity: 3 })), 'INSUFFICIENT_STOCK');
    await expectStockError(service.recordMovement(movement({ type: 'shrinkage', quantity: 3 })), 'INSUFFICIENT_STOCK');
    const r = await service.recordMovement(movement({ type: 'adjustment', quantity: -3, reason: 'Faltante en conteo' }));
    expect(r.stock).toBe(-1);
  });

  it('proveedor y costo unitario solo en ingresos', async () => {
    await service.recordMovement(movement({ quantity: 5 }));
    await expectStockError(service.recordMovement(movement({ type: 'sale', quantity: 1, unitCost: 100 })), 'VALIDATION');
    await expectStockError(service.recordMovement(movement({ type: 'return', quantity: 1, supplierId: 'sup-1' })), 'VALIDATION');
  });

  it('rechaza una variante inexistente', async () => {
    await expectStockError(service.recordMovement(movement({ variantId: 'no-existe' })), 'NOT_FOUND');
  });

  it('escribe la auditoría con el antes y el después', async () => {
    await service.recordMovement(movement({ quantity: 10 }));
    const r = await service.recordMovement(movement({ type: 'sale', quantity: 4 }));
    expect(repo.audits).toHaveLength(2);
    expect(repo.audits[1]).toEqual({
      userId: USER,
      entity: 'variant',
      entityId: VARIANT,
      action: 'stock.sale',
      before: { stock: 10 },
      after: { stock: 6, movementId: r.movement.id, quantity: -4 }
    });
  });

  it('un fallo a mitad de transacción no deja movimiento, caché ni auditoría', async () => {
    const failing = new InMemoryStockRepository();
    failing.addVariant({ id: VARIANT, name: 'Mango Ice', productId: 'eco-3', productName: 'LifePod ECO 3' });
    const original = failing.transaction.bind(failing);
    failing.transaction = work => original(tx => work({
      ...tx,
      audit: { write: async () => { throw new Error('auditoría caída'); } }
    }));
    await expect(new StockService(failing).recordMovement(movement({ quantity: 5 }))).rejects.toThrow('auditoría caída');
    expect(failing.movements).toHaveLength(0);
    expect(await failing.getStockCache(VARIANT)).toBe(0);
  });
});

describe('StockService.recordMovement: idempotencia', () => {
  it('un reintento con la misma operationKey no duplica el ingreso', async () => {
    const input = movement({ quantity: 50, operationKey: 'ingreso-factura-123' });
    const first = await service.recordMovement(input);
    const second = await service.recordMovement(input);
    expect(second.replayed).toBe(true);
    expect(second.movement.id).toBe(first.movement.id);
    expect(second.stock).toBe(50);
    expect(repo.movements).toHaveLength(1);
    expect(repo.audits).toHaveLength(1);
  });

  it('un doble clic concurrente registra un solo movimiento', async () => {
    const input = movement({ quantity: 50, operationKey: 'doble-clic-0001' });
    const results = await Promise.all([service.recordMovement(input), service.recordMovement(input)]);
    expect(results.map(r => r.replayed).sort()).toEqual([false, true]);
    expect(await service.getAvailable(VARIANT)).toBe(50);
  });

  it('rechaza la misma operationKey con otros datos', async () => {
    await service.recordMovement(movement({ quantity: 50, operationKey: 'clave-reusada-1' }));
    await expectStockError(
      service.recordMovement(movement({ quantity: 40, operationKey: 'clave-reusada-1' })),
      'OPERATION_KEY_CONFLICT'
    );
    expect(repo.movements).toHaveLength(1);
  });

  it('rechaza la misma operationKey sobre otra variante', async () => {
    repo.addVariant({ id: 'var-otra', name: 'Otra', productId: 'eco-3', productName: 'LifePod ECO 3' });
    await service.recordMovement(movement({ quantity: 5, operationKey: 'clave-reusada-2' }));
    await expectStockError(
      service.recordMovement(movement({ variantId: 'var-otra', quantity: 5, operationKey: 'clave-reusada-2' })),
      'OPERATION_KEY_CONFLICT'
    );
  });

  it('exige una operationKey de al menos 8 caracteres', async () => {
    await expectStockError(service.recordMovement(movement({ operationKey: 'corta' })), 'VALIDATION');
  });
});

describe('StockService: consultas y reconciliación', () => {
  it('reconcile devuelve stockCache al valor del libro tras corromperlo', async () => {
    await service.recordMovement(movement({ quantity: 10 }));
    await service.recordMovement(movement({ type: 'sale', quantity: 3 }));
    repo.corruptStockCache(VARIANT, 999);

    expect(await service.reconcile(VARIANT)).toEqual({ before: 999, after: 7 });
    expect(await service.getAvailable(VARIANT)).toBe(7);
    expect(repo.audits.at(-1)).toMatchObject({ userId: null, action: 'stock.reconcile', before: { stock: 999 }, after: { stock: 7 } });
  });

  it('reconcile sin descuadre no escribe auditoría', async () => {
    await service.recordMovement(movement({ quantity: 4 }));
    expect(await service.reconcile(VARIANT, USER)).toEqual({ before: 4, after: 4 });
    expect(repo.audits).toHaveLength(1);
  });

  it('kardex con saldo de apertura y saldo corrido en el rango', async () => {
    await service.recordMovement(movement({ quantity: 20 }));            // 1 oct
    clock = new Date('2026-10-05T12:00:00Z');
    await service.recordMovement(movement({ type: 'sale', quantity: 5 })); // 5 oct
    clock = new Date('2026-10-10T12:00:00Z');
    await service.recordMovement(movement({ type: 'sale', quantity: 2 })); // 10 oct

    const kardex = await service.getKardex(VARIANT, {
      from: new Date('2026-10-02T00:00:00Z'),
      to: new Date('2026-10-31T00:00:00Z')
    });
    expect(kardex.openingBalance).toBe(20);
    expect(kardex.entries.map(e => [e.quantity, e.balance])).toEqual([[-5, 15], [-2, 13]]);
    expect(kardex.closingBalance).toBe(13);
  });

  it('kardex rechaza un rango invertido y una variante inexistente', async () => {
    await expectStockError(service.getKardex(VARIANT, { from: new Date('2026-10-10'), to: new Date('2026-10-01') }), 'VALIDATION');
    await expectStockError(service.getKardex('no-existe'), 'NOT_FOUND');
  });

  it('findLowStock lista variantes activas en o bajo el umbral', async () => {
    repo.addVariant({ id: 'var-b', name: 'Banana Ice', productId: 'eco-3', productName: 'LifePod ECO 3', stockCache: 2 });
    repo.addVariant({ id: 'var-c', name: 'Cola', productId: 'eco-3', productName: 'LifePod ECO 3', stockCache: 9 });
    repo.addVariant({ id: 'var-d', name: 'Descontinuada', productId: 'eco-3', productName: 'LifePod ECO 3', active: false });

    const low = await service.findLowStock(5);
    expect(low.map(v => [v.variantId, v.stock])).toEqual([[VARIANT, 0], ['var-b', 2]]);
    await expectStockError(service.findLowStock(-1), 'VALIDATION');
  });
});
