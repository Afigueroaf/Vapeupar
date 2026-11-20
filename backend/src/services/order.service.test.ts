import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryStockRepository } from '../repositories/in-memory-stock.repository.js';
import { InMemoryOrderRepository } from '../repositories/in-memory-order.repository.js';
import {
  DATA_POLICY_VERSION, PublicOrderBody, PublicOrderBodySchema, normalizeColombianMobile
} from '../schemas/order.schema.js';
import { Actor, EXPIRED_REASON, OrderError, OrderService, REFERENCE_PATTERN, generateReference } from './order.service.js';

const MANGO = '019299a4-0000-7000-8000-0000000000a1';
const UVA = '019299a4-0000-7000-8000-0000000000a2';
const GRAY = '019299a4-0000-7000-8000-0000000000a3';
const RETIRED = '019299a4-0000-7000-8000-0000000000a4';
const DRAFT = '019299a4-0000-7000-8000-0000000000a5';
const MISSING = '019299a4-0000-7000-8000-0000000000ff';

const OWNER: Actor = { userId: 'user-owner', role: 'owner' };
const OPERATOR: Actor = { userId: 'user-operator', role: 'operator' };

const CUSTOMER = { name: 'Ana  Pérez ', phone: '300 123 4567', neighborhood: 'Novalito' };

let stock: InMemoryStockRepository;
let orders: InMemoryOrderRepository;
let service: OrderService;
let clock: Date;
let keySeq = 0;

function body(overrides: Partial<Record<keyof PublicOrderBody, unknown>> = {}): PublicOrderBody {
  return PublicOrderBodySchema.parse({
    submissionKey: `019299a4-0000-7000-8000-${String(++keySeq).padStart(12, '0')}`,
    customer: CUSTOMER,
    consent: { accepted: true, policyVersion: DATA_POLICY_VERSION },
    lines: [{ variantId: MANGO, quantity: 2 }, { variantId: GRAY, quantity: 1 }],
    ...overrides
  });
}

async function expectOrderError(promise: Promise<unknown>, code: OrderError['code']): Promise<OrderError> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(OrderError);
  expect((caught as OrderError).code).toBe(code);
  return caught as OrderError;
}

async function submitted(input = body()): Promise<string> {
  const { reference } = await service.submit(input);
  return orders.all.find(o => o.reference === reference)!.id;
}

const stockOf = (variantId: string) => stock.variant(variantId)!.stockCache;

beforeEach(() => {
  clock = new Date('2026-11-20T15:00:00Z');
  const now = () => new Date(clock);
  stock = new InMemoryStockRepository(now);
  stock.addVariant({ id: MANGO, name: 'Mango Ice', productId: 'eco-3', productName: 'LifePod ECO 3', stockCache: 5 });
  stock.addVariant({ id: UVA, name: 'Uva', productId: 'eco-3', productName: 'LifePod ECO 3', stockCache: 1 });
  stock.addVariant({ id: GRAY, name: 'Space Gray', productId: 'one', productName: 'LifePod ONE', stockCache: 3 });
  stock.addVariant({ id: RETIRED, name: 'Retirado', productId: 'eco-3', productName: 'LifePod ECO 3', stockCache: 9, active: false });
  stock.addVariant({ id: DRAFT, name: 'Nuevo', productId: 'fit', productName: 'LifePod FIT', stockCache: 9 });
  orders = new InMemoryOrderRepository(stock, now);
  orders.setProduct('eco-3', { price: 45000, published: true });
  orders.setProduct('one', { price: 120000, published: true });
  orders.setProduct('fit', { price: 60000, published: false });
  service = new OrderService(orders, { now });
});

describe('PublicOrderBodySchema', () => {
  it('normaliza el celular colombiano', () => {
    expect(normalizeColombianMobile('300 123 4567')).toBe('+573001234567');
    expect(normalizeColombianMobile('+57 (300) 123-4567')).toBe('+573001234567');
    expect(normalizeColombianMobile('573001234567')).toBe('+573001234567');
    expect(normalizeColombianMobile('6015551234')).toBeUndefined();
    expect(normalizeColombianMobile('30012345')).toBeUndefined();
  });

  it('limpia los espacios del nombre y del barrio', () => {
    expect(body().customer).toEqual({ name: 'Ana Pérez', phone: '+573001234567', neighborhood: 'Novalito' });
  });

  it('rechaza el precio y cualquier otro campo de más, en todos los niveles', () => {
    const base = { submissionKey: '019299a4-0000-7000-8000-000000000001', customer: CUSTOMER,
      consent: { accepted: true, policyVersion: DATA_POLICY_VERSION }, lines: [{ variantId: MANGO, quantity: 1 }] };
    expect(PublicOrderBodySchema.safeParse(base).success).toBe(true);
    expect(PublicOrderBodySchema.safeParse({ ...base, subtotal: 1 }).success).toBe(false);
    expect(PublicOrderBodySchema.safeParse({ ...base, lines: [{ variantId: MANGO, quantity: 1, price: 1 }] }).success).toBe(false);
    expect(PublicOrderBodySchema.safeParse({ ...base, customer: { ...CUSTOMER, cedula: '123' } }).success).toBe(false);
  });

  it('exige la autorización con la versión vigente de la política', () => {
    expect(() => body({ consent: { accepted: false, policyVersion: DATA_POLICY_VERSION } })).toThrow();
    expect(() => body({ consent: { accepted: true, policyVersion: 'otra' } })).toThrow();
    expect(() => body({ consent: undefined })).toThrow();
  });

  it('rechaza líneas repetidas, cantidades fuera de rango y nombres con marcas', () => {
    expect(() => body({ lines: [{ variantId: MANGO, quantity: 1 }, { variantId: MANGO, quantity: 2 }] })).toThrow();
    expect(() => body({ lines: [{ variantId: MANGO, quantity: 11 }] })).toThrow();
    expect(() => body({ lines: [] })).toThrow();
    expect(() => body({ customer: { ...CUSTOMER, name: '<script>' } })).toThrow();
    expect(() => body({ customer: { ...CUSTOMER, neighborhood: 'A' } })).toThrow();
  });
});

describe('generateReference', () => {
  it('genera VP- y seis caracteres del alfabeto sin ambigüedades', () => {
    for (let i = 0; i < 200; i++) expect(generateReference()).toMatch(REFERENCE_PATTERN);
  });
});

describe('OrderService.submit', () => {
  it('crea el pedido con los precios del catálogo, sin tocar el stock', async () => {
    const result = await service.submit(body());
    expect(result).toEqual({ reference: expect.stringMatching(REFERENCE_PATTERN), subtotal: 2 * 45000 + 120000, replayed: false });

    const [order] = orders.all;
    expect(order).toMatchObject({
      status: 'received',
      customer: { name: 'Ana Pérez', phone: '+573001234567', neighborhood: 'Novalito' },
      subtotal: 210000,
      deliveryFee: null,
      total: null,
      consent: { policyVersion: DATA_POLICY_VERSION, purpose: 'pedido', acceptedAt: clock }
    });
    expect(order.lines.map(l => [l.variantId, l.quantity, l.listPrice, l.unitPrice])).toEqual(
      expect.arrayContaining([[MANGO, 2, 45000, null], [GRAY, 1, 120000, null]])
    );
    expect(stock.movements).toHaveLength(0);
    expect(stockOf(MANGO)).toBe(5);
  });

  it('audita la creación sin copiar los datos del cliente', async () => {
    await service.submit(body());
    expect(stock.audits).toHaveLength(1);
    expect(stock.audits[0]).toMatchObject({ userId: null, entity: 'order', action: 'order.create' });
    const audited = JSON.stringify(stock.audits);
    for (const personal of ['Ana', 'Pérez', '300', '1234567', 'Novalito']) expect(audited).not.toContain(personal);
  });

  it('un reintento con la misma clave devuelve el mismo pedido', async () => {
    const input = body();
    const first = await service.submit(input);
    const second = await service.submit(input);
    expect(second).toEqual({ ...first, replayed: true });
    expect(orders.all).toHaveLength(1);
  });

  it('la misma clave con otros productos es un conflicto', async () => {
    const input = body();
    await service.submit(input);
    await expectOrderError(service.submit({ ...input, lines: [{ variantId: MANGO, quantity: 1 }] }), 'CONFLICT');
  });

  it('la misma clave con otros datos del cliente es un conflicto, no se descartan en silencio', async () => {
    const input = body();
    await service.submit(input);
    await expectOrderError(service.submit({ ...input, customer: { ...input.customer, phone: '+573109998877' } }), 'CONFLICT');
    await expectOrderError(service.submit({ ...input, customer: { ...input.customer, neighborhood: 'Centro' } }), 'CONFLICT');
    expect(orders.all).toHaveLength(1);
    expect(orders.all[0].customer?.phone).toBe('+573001234567');
  });

  it('dice qué líneas no se pueden pedir y no crea nada', async () => {
    const error = await expectOrderError(service.submit(body({
      lines: [
        { variantId: MANGO, quantity: 1 },
        { variantId: UVA, quantity: 2 },
        { variantId: RETIRED, quantity: 1 },
        { variantId: DRAFT, quantity: 1 },
        { variantId: MISSING, quantity: 1 }
      ]
    })), 'UNAVAILABLE');
    expect(error.details).toEqual([
      { variantId: UVA, reason: 'insufficient_stock', available: 1 },
      { variantId: RETIRED, reason: 'unavailable' },
      { variantId: DRAFT, reason: 'unavailable' },
      { variantId: MISSING, reason: 'unavailable' }
    ]);
    expect(orders.all).toHaveLength(0);
  });

  it('una línea sin precio no se puede pedir', async () => {
    orders.setProduct('one', { price: null, published: true });
    await expectOrderError(service.submit(body()), 'UNAVAILABLE');
  });

  it('reintenta con otra referencia si la generada ya existe', async () => {
    const refs = ['VP-AAAAAA', 'VP-AAAAAA', 'VP-BBBBBB'];
    service = new OrderService(orders, { now: () => new Date(clock), reference: () => refs.shift()! });
    expect((await service.submit(body())).reference).toBe('VP-AAAAAA');
    expect((await service.submit(body())).reference).toBe('VP-BBBBBB');
    expect(orders.all).toHaveLength(2);
  });
});

describe('OrderService.confirm', () => {
  it('descuenta el stock de todas las líneas con el precio cobrado y la referencia en el lote', async () => {
    const id = await submitted();
    const { order, replayed, stockChanged } = await service.confirm(id, { deliveryFee: 5000 }, OPERATOR);

    expect(replayed).toBe(false);
    expect(stockChanged).toBe(true);
    expect(order).toMatchObject({ status: 'confirmed', deliveryFee: 5000, total: 215000, confirmedAt: clock });
    expect(order.lines.every(l => l.unitPrice === l.listPrice)).toBe(true);
    expect(stockOf(MANGO)).toBe(3);
    expect(stockOf(GRAY)).toBe(2);
    expect(stock.movements.map(m => ({ variantId: m.variantId, type: m.type, quantity: m.quantity, unitPrice: m.unitPrice, lot: m.lot, operationKey: m.operationKey, userId: m.userId })))
      .toEqual(expect.arrayContaining([
        { variantId: MANGO, type: 'sale', quantity: -2, unitPrice: 45000, lot: order.reference, operationKey: `order:${id}:sale:${MANGO}`, userId: OPERATOR.userId },
        { variantId: GRAY, type: 'sale', quantity: -1, unitPrice: 120000, lot: order.reference, operationKey: `order:${id}:sale:${GRAY}`, userId: OPERATOR.userId }
      ]));
    expect(stock.audits.map(a => a.action)).toEqual(['order.create', 'stock.sale', 'stock.sale', 'order.confirm']);
  });

  it('si una línea no tiene stock no registra ninguna y dice cuál', async () => {
    const id = await submitted();
    stock.corruptStockCache(GRAY, 0);
    const error = await expectOrderError(service.confirm(id, { deliveryFee: 5000 }, OWNER), 'INSUFFICIENT_STOCK');
    expect(error.details).toEqual([{ variantId: GRAY, reason: 'insufficient_stock', available: 0 }]);
    expect(error.message).toContain('LifePod ONE Space Gray');
    expect(stock.movements).toHaveLength(0);
    expect(stockOf(MANGO)).toBe(5);
    expect((await service.get(id)).status).toBe('received');
  });

  it('un descuento exige owner', async () => {
    const id = await submitted();
    const lines = [{ variantId: MANGO, unitPrice: 40000 }];
    await expectOrderError(service.confirm(id, { deliveryFee: 0, lines }, OPERATOR), 'FORBIDDEN');
    expect(stock.movements).toHaveLength(0);

    const { order } = await service.confirm(id, { deliveryFee: 0, lines }, OWNER);
    expect(order.lines.find(l => l.variantId === MANGO)!.unitPrice).toBe(40000);
    expect(order.total).toBe(2 * 40000 + 120000);
    expect(stock.movements.find(m => m.variantId === MANGO)!.unitPrice).toBe(40000);
  });

  it('todo o nada: un fallo después del primer movimiento revierte pedido, líneas, stock y auditoría', async () => {
    const id = await submitted();
    const original = orders.transaction.bind(orders);
    orders.transaction = work => original(tx => {
      let calls = 0;
      return work({
        ...tx,
        setLineUnitPrice: async (lineId, price) => {
          // La primera línea ya escribió su venta y su precio; la segunda falla.
          if (++calls === 2) throw new Error('fallo a mitad');
          return tx.setLineUnitPrice(lineId, price);
        }
      });
    });

    await expect(service.confirm(id, { deliveryFee: 5000 }, OPERATOR)).rejects.toThrow('fallo a mitad');
    expect(stock.movements).toHaveLength(0);
    expect(stockOf(MANGO)).toBe(5);
    expect(stockOf(GRAY)).toBe(3);
    const order = await service.get(id);
    expect(order).toMatchObject({ status: 'received', deliveryFee: null });
    expect(order.lines.every(l => l.unitPrice === null)).toBe(true);
    expect(stock.audits.map(a => a.action)).toEqual(['order.create']);
  });

  it('el operator puede repetir el precio de catálogo de forma explícita', async () => {
    const id = await submitted();
    await service.confirm(id, { deliveryFee: 0, lines: [{ variantId: MANGO, unitPrice: 45000 }] }, OPERATOR);
    expect((await service.get(id)).status).toBe('confirmed');
  });

  it('rechaza un precio para una variante que no está en el pedido', async () => {
    const id = await submitted();
    await expectOrderError(service.confirm(id, { deliveryFee: 0, lines: [{ variantId: UVA, unitPrice: 1 }] }, OWNER), 'VALIDATION');
  });

  it('un doble envío no duplica nada; con otros datos es un conflicto', async () => {
    const id = await submitted();
    await service.confirm(id, { deliveryFee: 5000 }, OPERATOR);
    const again = await service.confirm(id, { deliveryFee: 5000 }, OPERATOR);
    expect(again).toMatchObject({ replayed: true, stockChanged: false });
    expect(stock.movements).toHaveLength(2);
    expect(stockOf(MANGO)).toBe(3);
    await expectOrderError(service.confirm(id, { deliveryFee: 7000 }, OPERATOR), 'CONFLICT');
  });

  it('dos confirmaciones a la vez descuentan una sola vez', async () => {
    const id = await submitted();
    const results = await Promise.all([
      service.confirm(id, { deliveryFee: 5000 }, OPERATOR),
      service.confirm(id, { deliveryFee: 5000 }, OPERATOR)
    ]);
    expect(results.map(r => r.replayed).sort()).toEqual([false, true]);
    expect(stock.movements).toHaveLength(2);
  });

  it('no confirma un pedido cancelado ni uno inexistente', async () => {
    const id = await submitted();
    await service.cancel(id, {}, OPERATOR);
    await expectOrderError(service.confirm(id, { deliveryFee: 0 }, OWNER), 'INVALID_STATE');
    await expectOrderError(service.confirm(MISSING, { deliveryFee: 0 }, OWNER), 'NOT_FOUND');
  });
});

describe('OrderService.deliver', () => {
  it('solo desde confirmado, y repetir no cambia nada', async () => {
    const id = await submitted();
    await expectOrderError(service.deliver(id, OPERATOR), 'INVALID_STATE');
    await service.confirm(id, { deliveryFee: 5000 }, OPERATOR);
    const { order } = await service.deliver(id, OPERATOR);
    expect(order).toMatchObject({ status: 'delivered', deliveredAt: clock });
    expect((await service.deliver(id, OPERATOR)).replayed).toBe(true);
    expect(stock.audits.filter(a => a.action === 'order.deliver')).toHaveLength(1);
  });
});

describe('OrderService.cancel', () => {
  it('un pedido recibido se cancela sin tocar el stock', async () => {
    const id = await submitted();
    const result = await service.cancel(id, { reason: 'El cliente ya no lo quiere' }, OPERATOR);
    expect(result).toMatchObject({ replayed: false, stockChanged: false });
    expect(result.order).toMatchObject({ status: 'cancelled', cancelReason: 'El cliente ya no lo quiere', cancelledAt: clock });
    expect(stock.movements).toHaveLength(0);
  });

  it('un pedido confirmado devuelve el stock con movimientos de devolución', async () => {
    const id = await submitted();
    const { order } = await service.confirm(id, { deliveryFee: 5000 }, OPERATOR);
    const result = await service.cancel(id, {}, OPERATOR);
    expect(result.stockChanged).toBe(true);
    expect(stockOf(MANGO)).toBe(5);
    expect(stockOf(GRAY)).toBe(3);
    const returns = stock.movements.filter(m => m.type === 'return');
    expect(returns.map(m => [m.variantId, m.quantity, m.lot, m.operationKey])).toEqual(expect.arrayContaining([
      [MANGO, 2, order.reference, `order:${id}:return:${MANGO}`],
      [GRAY, 1, order.reference, `order:${id}:return:${GRAY}`]
    ]));
    expect((await service.cancel(id, {}, OPERATOR)).replayed).toBe(true);
    expect(stock.movements.filter(m => m.type === 'return')).toHaveLength(2);
  });

  it('no copia el motivo en la auditoría', async () => {
    const id = await submitted();
    await service.cancel(id, { reason: 'Ana cambió de dirección' }, OPERATOR);
    expect(JSON.stringify(stock.audits)).not.toContain('Ana');
  });

  it('un pedido entregado no se cancela', async () => {
    const id = await submitted();
    await service.confirm(id, { deliveryFee: 5000 }, OPERATOR);
    await service.deliver(id, OPERATOR);
    await expectOrderError(service.cancel(id, {}, OWNER), 'INVALID_STATE');
  });
});

describe('OrderService.anonymize', () => {
  it('borra los datos del cliente y el motivo de un pedido cerrado, y conserva la autorización', async () => {
    const id = await submitted();
    await expectOrderError(service.anonymize(id, OWNER), 'INVALID_STATE');
    await service.cancel(id, { reason: 'Llamar a Ana' }, OPERATOR);
    const { order } = await service.anonymize(id, OWNER);
    expect(order).toMatchObject({ customer: null, cancelReason: null, anonymizedAt: clock, status: 'cancelled' });
    expect(order.consent).toMatchObject({ policyVersion: DATA_POLICY_VERSION });
    expect(order.lines).toHaveLength(2);
    expect((await service.anonymize(id, OWNER)).replayed).toBe(true);
    expect(stock.audits.filter(a => a.action === 'order.anonymize')).toHaveLength(1);
  });

  it('un anonimizado ya no aparece al buscar por nombre ni teléfono', async () => {
    const id = await submitted();
    await service.cancel(id, {}, OPERATOR);
    expect((await service.list({ q: 'ana', limit: 20, offset: 0 })).total).toBe(1);
    expect((await service.list({ q: '3001234', limit: 20, offset: 0 })).total).toBe(1);
    await service.anonymize(id, OWNER);
    expect((await service.list({ q: 'ana', limit: 20, offset: 0 })).total).toBe(0);
    expect((await service.list({ q: '3001234', limit: 20, offset: 0 })).total).toBe(0);
  });
});

describe('OrderService.applyRetention', () => {
  it('anonimiza los cerrados vencidos y caduca los recibidos viejos', async () => {
    const oldReceived = await submitted();
    const freshReceived = await submitted();
    const oldDelivered = await submitted(body({ lines: [{ variantId: MANGO, quantity: 1 }] }));
    const recentCancelled = await submitted(body({ lines: [{ variantId: GRAY, quantity: 1 }] }));
    await service.confirm(oldDelivered, { deliveryFee: 0 }, OPERATOR);
    await service.deliver(oldDelivered, OPERATOR);
    await service.cancel(recentCancelled, {}, OPERATOR);

    const day = 24 * 60 * 60 * 1000;
    orders.backdate(oldReceived, { createdAt: new Date(clock.getTime() - 31 * day) });
    orders.backdate(freshReceived, { createdAt: new Date(clock.getTime() - 29 * day) });
    orders.backdate(oldDelivered, { deliveredAt: new Date(clock.getTime() - 366 * day) });
    orders.backdate(recentCancelled, { cancelledAt: new Date(clock.getTime() - 300 * day) });

    expect(await service.applyRetention(OWNER)).toEqual({ cancelled: 1, anonymized: 2 });
    expect(await service.get(oldReceived)).toMatchObject({ status: 'cancelled', customer: null, cancelReason: EXPIRED_REASON });
    expect(await service.get(oldDelivered)).toMatchObject({ status: 'delivered', customer: null });
    expect((await service.get(freshReceived)).customer).not.toBeNull();
    expect((await service.get(recentCancelled)).customer).not.toBeNull();
    // El pedido caducado no tocó el stock; el entregado conserva su venta.
    expect(stock.movements.filter(m => m.type === 'return')).toHaveLength(0);

    expect(await service.applyRetention(OWNER)).toEqual({ cancelled: 0, anonymized: 0 });
  });

  it('no caduca un pedido que se confirmó entre la lista y su transacción', async () => {
    const id = await submitted();
    orders.backdate(id, { createdAt: new Date(clock.getTime() - 31 * 24 * 60 * 60 * 1000) });
    const list = orders.listRetentionCandidates.bind(orders);
    orders.listRetentionCandidates = async cutoffs => {
      const candidates = await list(cutoffs);
      // El operador confirma justo después de que se leyó la lista.
      await service.confirm(id, { deliveryFee: 0 }, OPERATOR);
      return candidates;
    };

    expect(await service.applyRetention(OWNER)).toEqual({ cancelled: 0, anonymized: 0 });
    const order = await service.get(id);
    expect(order.status).toBe('confirmed');
    expect(order.customer).not.toBeNull();
    expect(stock.movements.filter(m => m.type === 'return')).toHaveLength(0);
  });
});

describe('OrderService.list', () => {
  it('filtra por estado y ordena del más reciente al más antiguo', async () => {
    const first = await submitted();
    clock = new Date(clock.getTime() + 60_000);
    const second = await submitted();
    await service.cancel(first, {}, OPERATOR);
    expect((await service.list({ limit: 20, offset: 0 })).rows.map(o => o.id)).toEqual([second, first]);
    expect((await service.list({ status: 'cancelled', limit: 20, offset: 0 })).rows.map(o => o.id)).toEqual([first]);
  });
});
