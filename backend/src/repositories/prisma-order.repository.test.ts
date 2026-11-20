import { describe, expect, it } from 'vitest';
import { OrderRow, toOrder, toUpdateData, toWhere } from './prisma-order.repository.js';

const AT = new Date('2026-11-20T15:00:00Z');

function row(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: '019299a4-0000-7000-8000-0000000000o1',
    reference: 'VP-ABC234',
    status: 'received',
    customerName: 'Ana Pérez',
    customerPhone: '+573001234567',
    customerNeighborhood: 'Novalito',
    subtotal: 90000,
    deliveryFee: null,
    cancelReason: null,
    submissionKey: '019299a4-0000-7000-8000-0000000000k1',
    confirmedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    anonymizedAt: null,
    createdAt: AT,
    updatedAt: AT,
    lines: [{
      id: 'l1', orderId: 'o1', variantId: 'v1', quantity: 2, listPrice: 45000, unitPrice: null,
      productName: 'LifePod ECO 3', variantName: 'Mango Ice'
    }],
    consent: { id: 'c1', orderId: 'o1', policyVersion: 'borrador-2026-11-20', purpose: 'pedido', acceptedAt: AT },
    ...overrides
  };
}

describe('toOrder', () => {
  it('no expone la clave de envío ni identificadores de las tablas hijas', () => {
    const order = toOrder(row());
    expect(order).not.toHaveProperty('submissionKey');
    expect(order.lines[0]).not.toHaveProperty('orderId');
    expect(order.consent).toEqual({ policyVersion: 'borrador-2026-11-20', purpose: 'pedido', acceptedAt: AT });
  });

  it('agrupa los datos del cliente y los deja en nulo si están anonimizados', () => {
    expect(toOrder(row()).customer).toEqual({ name: 'Ana Pérez', phone: '+573001234567', neighborhood: 'Novalito' });
    const anonymized = toOrder(row({ customerName: null, customerPhone: null, customerNeighborhood: null, anonymizedAt: AT }));
    expect(anonymized.customer).toBeNull();
    // Un cliente a medias tampoco se expone.
    expect(toOrder(row({ customerPhone: null })).customer).toBeNull();
  });

  it('calcula el total solo cuando hay precio cobrado y domicilio', () => {
    expect(toOrder(row()).total).toBeNull();
    const confirmed = row({
      status: 'confirmed',
      deliveryFee: 5000,
      lines: [{ ...row().lines[0], unitPrice: 40000 }]
    });
    expect(toOrder(confirmed).total).toBe(85000);
  });
});

describe('toUpdateData', () => {
  it('anonimizar pone a nulo los tres datos del cliente', () => {
    expect(toUpdateData({ customer: null, cancelReason: null, anonymizedAt: AT })).toEqual({
      customerName: null, customerPhone: null, customerNeighborhood: null, cancelReason: null, anonymizedAt: AT
    });
  });

  it('solo escribe lo que trae el patch', () => {
    expect(toUpdateData({ status: 'confirmed', deliveryFee: 0, confirmedAt: AT }))
      .toEqual({ status: 'confirmed', deliveryFee: 0, confirmedAt: AT });
  });
});

describe('toWhere', () => {
  it('busca por referencia, nombre y, con tres cifras o más, teléfono', () => {
    expect(toWhere({ q: 'vp-abc' })).toEqual({
      OR: [
        { reference: { contains: 'vp-abc', mode: 'insensitive' } },
        { customerName: { contains: 'vp-abc', mode: 'insensitive' } }
      ]
    });
    expect(toWhere({ q: '300 123' }).OR).toContainEqual({ customerPhone: { contains: '300123' } });
  });

  it('combina estado y rango de fechas', () => {
    const from = new Date('2026-11-01T00:00:00Z');
    expect(toWhere({ status: 'confirmed', from })).toEqual({ status: 'confirmed', createdAt: { gte: from, lte: undefined } });
  });
});
