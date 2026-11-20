import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import { createOrdersPublicRouter } from './order.routes.js';
import { InMemoryStockRepository } from '../repositories/in-memory-stock.repository.js';
import { InMemoryOrderRepository } from '../repositories/in-memory-order.repository.js';
import { OrderService } from '../services/order.service.js';
import { DATA_POLICY_VERSION } from '../schemas/order.schema.js';

/**
 * `POST /api/orders` contra la aplicación real en un puerto efímero, con el
 * pedido en memoria: validación estricta, precio del catálogo, respuesta mínima
 * y límite de peticiones propio (ADR-003).
 */

const MANGO = '019299a4-0000-7000-8000-0000000000a1';
const UVA = '019299a4-0000-7000-8000-0000000000a2';
const servers: Server[] = [];
let keySeq = 0;

async function start(options: { ordersMax?: number; ordersEnabled?: boolean } = {}) {
  const stock = new InMemoryStockRepository();
  stock.addVariant({ id: MANGO, name: 'Mango Ice', productId: 'eco-3', productName: 'LifePod ECO 3', stockCache: 5 });
  stock.addVariant({ id: UVA, name: 'Uva', productId: 'eco-3', productName: 'LifePod ECO 3', stockCache: 0 });
  const orders = new InMemoryOrderRepository(stock);
  orders.setProduct('eco-3', { price: 45000, published: true });
  const app = createApp({
    ordersRouter: createOrdersPublicRouter({ service: new OrderService(orders) }),
    ordersEnabled: options.ordersEnabled ?? true,
    rateLimits: { ordersMax: options.ordersMax ?? 100 }
  });
  const server = await new Promise<Server>(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, orders, stock };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))));
});

function order(overrides: Record<string, unknown> = {}) {
  return {
    submissionKey: `019299a4-0000-7000-8000-${String(++keySeq).padStart(12, '0')}`,
    customer: { name: 'Ana Pérez', phone: '3001234567', neighborhood: 'Novalito' },
    consent: { accepted: true, policyVersion: DATA_POLICY_VERSION },
    lines: [{ variantId: MANGO, quantity: 2 }],
    ...overrides
  };
}

async function post(url: string, body: unknown, method = 'POST') {
  const response = await fetch(`${url}/api/orders`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method !== 'POST' ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, unknown> : undefined };
}

describe('POST /api/orders', () => {
  it('crea el pedido y responde solo la referencia y el subtotal del catálogo', async () => {
    const { url, orders } = await start();
    const response = await post(url, order());
    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: { reference: expect.stringMatching(/^VP-[23456789A-HJKMNP-Z]{6}$/), subtotal: 90000 }
    });
    expect(orders.all).toHaveLength(1);
  });

  it('un reintento con la misma clave responde 200 con la misma referencia', async () => {
    const { url, orders } = await start();
    const body = order();
    const first = await post(url, body);
    const second = await post(url, body);
    expect(second.status).toBe(200);
    expect(second.body?.data).toEqual(first.body?.data);
    expect(orders.all).toHaveLength(1);
  });

  it('rechaza un precio enviado por el cliente sin crear nada', async () => {
    const { url, orders } = await start();
    const response = await post(url, order({ lines: [{ variantId: MANGO, quantity: 2, price: 1 }] }));
    expect(response.status).toBe(400);
    expect(orders.all).toHaveLength(0);
  });

  it('rechaza un pedido sin autorización de datos', async () => {
    const { url } = await start();
    expect((await post(url, order({ consent: { accepted: false, policyVersion: DATA_POLICY_VERSION } }))).status).toBe(400);
    expect((await post(url, order({ consent: undefined }))).status).toBe(400);
  });

  it('dice qué línea no tiene stock, sin datos de nadie más', async () => {
    const { url } = await start();
    const response = await post(url, order({ lines: [{ variantId: MANGO, quantity: 1 }, { variantId: UVA, quantity: 1 }] }));
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      message: expect.any(String),
      code: 'UNAVAILABLE',
      lines: [{ variantId: UVA, reason: 'insufficient_stock', available: 0 }]
    });
  });

  it('no hay forma pública de leer pedidos', async () => {
    const { url } = await start();
    expect((await post(url, undefined, 'GET')).status).toBe(404);
  });

  it('apagado por el interruptor responde el 404 genérico y no crea nada', async () => {
    const { url, orders } = await start({ ordersEnabled: false });
    const response = await post(url, order());
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, message: 'Endpoint no encontrado' });
    expect(orders.all).toHaveLength(0);
  });

  it('un JSON mal formado es 400 y el cuerpo nunca llega al registro', async () => {
    const { url } = await start();
    const logged: unknown[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation((...args) => { logged.push(...args); });
    const error = vi.spyOn(console, 'error').mockImplementation((...args) => { logged.push(...args); });
    try {
      const response = await post(url, '{"customer":{"name":"Ana Pérez","phone":"3001234567"');
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, message: expect.any(String) });
      expect(JSON.stringify(logged)).not.toContain('3001234567');
      expect(JSON.stringify(logged)).toContain('entity.parse.failed');
      expect(error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it('un cuerpo demasiado grande es 413, no 500', async () => {
    const { url } = await start();
    const response = await post(url, order({ padding: 'x'.repeat(30 * 1024) }));
    expect(response.status).toBe(413);
  });

  it('los pedidos rechazados no gastan el límite', async () => {
    const { url } = await start({ ordersMax: 1 });
    for (let i = 0; i < 3; i++) {
      expect((await post(url, order({ customer: { name: 'Ana', phone: '123', neighborhood: 'Centro' } }))).status).toBe(400);
    }
    expect((await post(url, order())).status).toBe(201);
    expect((await post(url, order())).status).toBe(429);
  });

  it('tiene su propio límite de peticiones', async () => {
    const { url } = await start({ ordersMax: 2 });
    expect((await post(url, order())).status).toBe(201);
    expect((await post(url, order())).status).toBe(201);
    const limited = await post(url, order());
    expect(limited.status).toBe(429);
    expect(limited.body?.success).toBe(false);
  });

  it('la comprobación previa de CORS no gasta el límite', async () => {
    const { url } = await start({ ordersMax: 1 });
    for (let i = 0; i < 3; i++) {
      const preflight = await fetch(`${url}/api/orders`, {
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST' }
      });
      expect(preflight.status).toBe(204);
    }
    expect((await post(url, order())).status).toBe(201);
  });
});
