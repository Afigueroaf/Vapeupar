import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../app.js';
import { createAdminRouter } from './index.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { InMemoryUserRepository } from '../../repositories/in-memory-user.repository.js';
import { InMemoryStockRepository } from '../../repositories/in-memory-stock.repository.js';
import { InMemoryOrderRepository } from '../../repositories/in-memory-order.repository.js';
import { AccessTokenClaims, TokenInvalidError } from '../../services/token-verifier.js';
import { OrderService } from '../../services/order.service.js';
import { SiteRevalidator } from '../../services/site-revalidation.service.js';
import { DATA_POLICY_VERSION, PublicOrderBodySchema } from '../../schemas/order.schema.js';

/**
 * `/api/admin/orders` contra la aplicación real, con sesión de mentira y el
 * servicio de pedidos real sobre repositorios en memoria: roles, códigos,
 * stock y aviso al sitio (ADR-003).
 */

const OWNER = '019299a4-0000-7000-8000-000000000001';
const OPERATOR = '019299a4-0000-7000-8000-000000000002';
const MANGO = '019299a4-0000-7000-8000-0000000000a1';
const GRAY = '019299a4-0000-7000-8000-0000000000a3';
const MISSING = '019299a4-0000-7000-8000-0000000000ff';

const verify = async (token: string): Promise<AccessTokenClaims> => {
  if (!token.startsWith('019299a4')) throw new TokenInvalidError('Token de prueba inválido');
  return { sub: token, username: `pool-${token}`, exp: Math.floor(Date.now() / 1000) + 3600 };
};

const servers: Server[] = [];
let keySeq = 0;

async function start(options: { revalidate?: SiteRevalidator } = {}) {
  const users = new InMemoryUserRepository([
    { id: OWNER, email: 'owner@vapeupar.com', role: 'owner', active: true },
    { id: OPERATOR, email: 'operador@vapeupar.com', role: 'operator', active: true }
  ]);
  const stock = new InMemoryStockRepository();
  stock.addVariant({ id: MANGO, name: 'Mango Ice', productId: 'eco-3', productName: 'LifePod ECO 3', stockCache: 5 });
  stock.addVariant({ id: GRAY, name: 'Space Gray', productId: 'one', productName: 'LifePod ONE', stockCache: 3 });
  const orders = new InMemoryOrderRepository(stock);
  orders.setProduct('eco-3', { price: 45000, published: true });
  orders.setProduct('one', { price: 120000, published: true });
  const service = new OrderService(orders);
  const revalidate = vi.fn<SiteRevalidator>(options.revalidate ?? (async () => true));

  const app = createApp({
    rateLimits: { adminMax: 1000 },
    adminRouter: createAdminRouter({
      users,
      verify,
      guard: createRequireAuth({ verify, users, renew: async () => { throw new Error('sin renovación'); } }),
      orders: service,
      revalidate
    })
  });
  const server = await new Promise<Server>(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;

  /** Un pedido recibido, creado como lo crea el sitio. */
  const received = async (lines = [{ variantId: MANGO, quantity: 2 }, { variantId: GRAY, quantity: 1 }]) => {
    const { reference } = await service.submit(PublicOrderBodySchema.parse({
      submissionKey: `019299a4-0000-7000-8000-${String(++keySeq).padStart(12, '0')}`,
      customer: { name: 'Ana Pérez', phone: '3001234567', neighborhood: 'Novalito' },
      consent: { accepted: true, policyVersion: DATA_POLICY_VERSION },
      lines
    }));
    return orders.all.find(o => o.reference === reference)!;
  };

  return { url: `http://127.0.0.1:${port}`, stock, orders, revalidate, received };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))));
});

async function call(url: string, path: string, options: { method?: string; body?: unknown; as?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.as) headers.cookie = `vp_admin_at=${options.as}`;
  const response = await fetch(`${url}/api/admin/orders${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, any> : undefined };
}

const post = (url: string, path: string, as: string, body?: unknown) => call(url, path, { method: 'POST', as, body });

describe('/api/admin/orders', () => {
  it('sin sesión responde 401 y no confirma nada', async () => {
    const { url, received, stock } = await start();
    const order = await received();
    expect((await call(url, '')).status).toBe(401);
    expect((await call(url, `/${order.id}/confirm`, { method: 'POST', body: { deliveryFee: 0 } })).status).toBe(401);
    expect(stock.movements).toHaveLength(0);
  });

  it('el operator lista y filtra, con los datos del cliente', async () => {
    const { url, received } = await start();
    const first = await received();
    await received([{ variantId: MANGO, quantity: 1 }]);
    await post(url, `/${first.id}/cancel`, OPERATOR, {});

    const all = await call(url, '', { as: OPERATOR });
    expect(all.status).toBe(200);
    expect(all.body?.pagination).toMatchObject({ total: 2, page: 1 });
    expect(all.body?.data[0].customer).toEqual({ name: 'Ana Pérez', phone: '+573001234567', neighborhood: 'Novalito' });

    const cancelled = await call(url, '?status=cancelled', { as: OPERATOR });
    expect(cancelled.body?.data.map((o: { id: string }) => o.id)).toEqual([first.id]);
    expect((await call(url, `?q=${first.reference}`, { as: OPERATOR })).body?.pagination.total).toBe(1);
    expect((await call(url, '?status=pagado', { as: OPERATOR })).status).toBe(400);
  });

  it('ver un pedido: 404 si no existe, 400 si el id no es un UUID', async () => {
    const { url, received } = await start();
    const order = await received();
    expect((await call(url, `/${order.id}`, { as: OPERATOR })).body?.data.reference).toBe(order.reference);
    expect((await call(url, `/${MISSING}`, { as: OPERATOR })).status).toBe(404);
    expect((await call(url, '/VP-ABC234', { as: OPERATOR })).status).toBe(400);
  });

  it('el operator confirma: descuenta el stock y avisa al sitio', async () => {
    const { url, received, stock, revalidate } = await start();
    const order = await received();
    const response = await post(url, `/${order.id}/confirm`, OPERATOR, { deliveryFee: 5000 });
    expect(response.status).toBe(200);
    expect(response.body?.data).toMatchObject({ status: 'confirmed', deliveryFee: 5000, total: 215000 });
    expect(response.body?.meta).toEqual({ replayed: false, revalidated: true });
    expect(stock.variant(MANGO)!.stockCache).toBe(3);
    expect(stock.movements.every(m => m.userId === OPERATOR && m.lot === order.reference)).toBe(true);
    expect(revalidate).toHaveBeenCalledWith(['catalogo']);

    const again = await post(url, `/${order.id}/confirm`, OPERATOR, { deliveryFee: 5000 });
    expect(again.body?.meta.replayed).toBe(true);
    expect(stock.movements).toHaveLength(2);
    expect((await post(url, `/${order.id}/confirm`, OPERATOR, { deliveryFee: 9000 })).status).toBe(409);
  });

  it('un descuento del operator es 403; el del owner pasa', async () => {
    const { url, received, stock } = await start();
    const order = await received();
    const body = { deliveryFee: 0, lines: [{ variantId: MANGO, unitPrice: 40000 }] };
    const denied = await post(url, `/${order.id}/confirm`, OPERATOR, body);
    expect(denied.status).toBe(403);
    expect(denied.body?.code).toBe('FORBIDDEN');
    expect(stock.movements).toHaveLength(0);
    expect((await post(url, `/${order.id}/confirm`, OWNER, body)).status).toBe(200);
  });

  it('confirmar rechaza campos de más y sin domicilio', async () => {
    const { url, received } = await start();
    const order = await received();
    expect((await post(url, `/${order.id}/confirm`, OWNER, { deliveryFee: 0, status: 'delivered' })).status).toBe(400);
    expect((await post(url, `/${order.id}/confirm`, OWNER, {})).status).toBe(400);
  });

  it('sin stock suficiente responde 409 con la línea y no registra ninguna', async () => {
    const { url, received, stock } = await start();
    const order = await received();
    stock.corruptStockCache(GRAY, 0);
    const response = await post(url, `/${order.id}/confirm`, OPERATOR, { deliveryFee: 0 });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'INSUFFICIENT_STOCK', lines: [{ variantId: GRAY, available: 0 }] });
    expect(stock.movements).toHaveLength(0);
  });

  it('un fallo del aviso al sitio no cambia la respuesta', async () => {
    const { url, received } = await start({ revalidate: async () => { throw new Error('caído'); } });
    const order = await received();
    const response = await post(url, `/${order.id}/confirm`, OPERATOR, { deliveryFee: 0 });
    expect(response.status).toBe(200);
    expect(response.body?.meta.revalidated).toBe(false);
  });

  it('entregar y cancelar: solo los que mueven stock avisan al sitio', async () => {
    const { url, received, stock, revalidate } = await start();
    const toCancel = await received();
    const cancelled = await post(url, `/${toCancel.id}/cancel`, OPERATOR, { reason: 'Ya no lo quiere' });
    expect(cancelled.body?.data).toMatchObject({ status: 'cancelled', cancelReason: 'Ya no lo quiere' });
    expect(revalidate).not.toHaveBeenCalled();

    const confirmed = await received();
    await post(url, `/${confirmed.id}/confirm`, OPERATOR, { deliveryFee: 0 });
    revalidate.mockClear();
    const back = await post(url, `/${confirmed.id}/cancel`, OPERATOR);
    expect(back.status).toBe(200);
    expect(back.body?.meta.revalidated).toBe(true);
    expect(stock.variant(MANGO)!.stockCache).toBe(5);

    const delivered = await received();
    expect((await post(url, `/${delivered.id}/deliver`, OPERATOR)).status).toBe(409);
    await post(url, `/${delivered.id}/confirm`, OPERATOR, { deliveryFee: 0 });
    expect((await post(url, `/${delivered.id}/deliver`, OPERATOR)).body?.data.status).toBe('delivered');
    expect((await post(url, `/${delivered.id}/cancel`, OWNER)).status).toBe(409);
  });

  it('anonimizar es solo del owner', async () => {
    const { url, received } = await start();
    const order = await received();
    await post(url, `/${order.id}/cancel`, OPERATOR);
    expect((await post(url, `/${order.id}/anonymize`, OPERATOR)).status).toBe(403);
    const response = await post(url, `/${order.id}/anonymize`, OWNER);
    expect(response.status).toBe(200);
    expect(response.body?.data).toMatchObject({ customer: null, anonymizedAt: expect.any(String) });
  });

  it('aplicar el plazo de conservación es solo del owner', async () => {
    const { url } = await start();
    expect((await post(url, '/retention', OPERATOR)).status).toBe(403);
    const response = await post(url, '/retention', OWNER);
    expect(response.status).toBe(200);
    expect(response.body?.data).toEqual({ cancelled: 0, anonymized: 0 });
  });
});
