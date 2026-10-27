import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { RequestHandler } from 'express';
import { createApp } from '../../app.js';
import { createAdminRouter } from './index.js';
import { InMemoryUserRepository } from '../../repositories/in-memory-user.repository.js';
import { InMemoryCatalogRepository } from '../../repositories/in-memory-catalog.repository.js';
import { InMemorySiteContentRepository } from '../../repositories/in-memory-site-content.repository.js';
import { InMemoryAuditViewRepository } from '../../repositories/in-memory-audit-view.repository.js';
import { CatalogService } from '../../services/catalog.service.js';
import { ContentService } from '../../services/content.service.js';
import { AdminUser } from '../../repositories/user.repository.js';

/**
 * Verificación del CRUD de A4: códigos de estado, roles y forma de las
 * respuestas, contra la aplicación real levantada en un puerto efímero.
 *
 * Aquí los servicios son los de verdad sobre repositorios en memoria, para que
 * una regla de dominio que no llegue a la respuesta HTTP se note. La sesión sí
 * se sustituye por un guardián mínimo: el cableado de Cognito y las cookies ya
 * tiene sus tests en `admin.routes.test.ts`.
 */

const OWNER = '019299a4-0000-7000-8000-000000000001';
const OPERATOR = '019299a4-0000-7000-8000-000000000002';
const AJENO = '019299a4-0000-7000-8000-00000000ffff';

const SEED: AdminUser[] = [
  { id: OWNER, email: 'owner@vapeupar.com', role: 'owner', active: true },
  { id: OPERATOR, email: 'operador@vapeupar.com', role: 'operator', active: true }
];

/** La cookie lleva el `sub` en claro: basta para elegir el rol de la petición. */
const guard: RequestHandler = (req, res, next) => {
  const sub = /vp_admin_at=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  const user = SEED.find(u => u.id === sub);
  if (!user) {
    res.status(401).json({ success: false, message: 'Sin sesión' });
    return;
  }
  req.admin = { userId: user.id, email: user.email, role: user.role, username: `pool-${user.id}` };
  next();
};

interface Harness {
  url: string;
  catalog: InMemoryCatalogRepository;
  content: InMemorySiteContentRepository;
  audit: InMemoryAuditViewRepository;
}

const servers: Server[] = [];

async function start(): Promise<Harness> {
  const catalog = new InMemoryCatalogRepository();
  const content = new InMemorySiteContentRepository();
  const audit = new InMemoryAuditViewRepository();

  const app = createApp({
    adminRouter: createAdminRouter({
      users: new InMemoryUserRepository(SEED),
      guard,
      catalog,
      catalogService: new CatalogService(catalog),
      contentService: new ContentService(content),
      auditView: audit
    })
  });

  const server = await new Promise<Server>(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, catalog, content, audit };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))));
});

interface CallOptions {
  method?: string;
  body?: unknown;
  as?: string;
}

async function call(url: string, path: string, options: CallOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.as) headers.cookie = `vp_admin_at=${options.as}`;
  const response = await fetch(`${url}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : undefined) as Record<string, unknown> | undefined
  };
}

/** `data` de una respuesta correcta, ya tipado como objeto. */
function data(response: { body?: Record<string, unknown> }): Record<string, unknown> {
  return response.body?.data as Record<string, unknown>;
}

describe('CRUD de /api/admin', () => {
  describe('roles', () => {
    it('cualquier sesión lee, pero solo owner escribe', async () => {
      const { url } = await start();

      expect((await call(url, '/api/admin/brands', { as: OPERATOR })).status).toBe(200);

      const rechazado = await call(url, '/api/admin/brands', {
        method: 'POST', as: OPERATOR, body: { name: 'LifePod', slug: 'lifepod' }
      });
      expect(rechazado.status).toBe(403);
      // Y no se escribió nada.
      expect(data(await call(url, '/api/admin/brands', { as: OWNER })).length).toBe(0);
    });

    it('sin sesión no se llega ni a la lectura', async () => {
      const { url } = await start();
      expect((await call(url, '/api/admin/brands')).status).toBe(401);
    });

    it('la auditoría es solo para owner', async () => {
      const { url, audit } = await start();
      audit.seed({ entity: 'product', action: 'product.publish', userEmail: 'owner@vapeupar.com' });

      expect((await call(url, '/api/admin/audit', { as: OPERATOR })).status).toBe(403);

      const permitido = await call(url, '/api/admin/audit', { as: OWNER });
      expect(permitido.status).toBe(200);
      expect(permitido.body?.pagination).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    });

    it('filtra la auditoría por entidad y por verbo', async () => {
      const { url, audit } = await start();
      audit.seed({ entity: 'product', action: 'product.price' });
      audit.seed({ entity: 'product', action: 'product.publish' });
      audit.seed({ entity: 'variant', action: 'variant.create' });

      const porEntidad = await call(url, '/api/admin/audit?entity=product', { as: OWNER });
      expect((porEntidad.body?.data as unknown[]).length).toBe(2);

      const porVerbo = await call(url, '/api/admin/audit?action=product.price', { as: OWNER });
      expect((porVerbo.body?.data as unknown[]).length).toBe(1);
    });
  });

  describe('marcas', () => {
    it('crea, lista y devuelve el estado resultante', async () => {
      const { url, catalog } = await start();

      const creada = await call(url, '/api/admin/brands', {
        method: 'POST', as: OWNER, body: { name: 'LifePod', slug: 'LifePod', isPartner: true }
      });

      expect(creada.status).toBe(201);
      expect(data(creada)).toMatchObject({ name: 'LifePod', slug: 'lifepod', isPartner: true, active: true });

      const listado = await call(url, `/api/admin/brands?q=life`, { as: OWNER });
      expect((listado.body?.data as unknown[]).length).toBe(1);
      expect(listado.body?.pagination).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });

      // El autor sale de la sesión, no del cuerpo.
      expect(catalog.audits[0]).toMatchObject({ userId: OWNER, action: 'brand.create' });
    });

    it('no acepta un autor inventado en el cuerpo', async () => {
      const { url, catalog } = await start();

      await call(url, '/api/admin/brands', {
        method: 'POST', as: OWNER, body: { name: 'LifePod', slug: 'lifepod', userId: AJENO }
      });

      expect(catalog.audits[0]?.userId).toBe(OWNER);
    });

    it('distingue un identificador mal formado de uno que no existe', async () => {
      const { url } = await start();

      expect((await call(url, '/api/admin/brands/no-es-uuid', { as: OWNER })).status).toBe(400);
      expect((await call(url, `/api/admin/brands/${AJENO}`, { as: OWNER })).status).toBe(404);
    });

    it('rechaza un PATCH sin campos y un slug repetido', async () => {
      const { url } = await start();
      const creada = await call(url, '/api/admin/brands', {
        method: 'POST', as: OWNER, body: { name: 'LifePod', slug: 'lifepod' }
      });
      const id = data(creada).id as string;

      const vacio = await call(url, `/api/admin/brands/${id}`, { method: 'PATCH', as: OWNER, body: {} });
      expect(vacio.status).toBe(400);

      const repetida = await call(url, '/api/admin/brands', {
        method: 'POST', as: OWNER, body: { name: 'Otra', slug: 'lifepod' }
      });
      expect(repetida.status).toBe(409);
      expect(repetida.body?.code).toBe('DUPLICATE_SLUG');
    });
  });

  describe('líneas y variantes', () => {
    /** Marca + línea en borrador, que es por donde empieza la consola. */
    async function conLinea(url: string) {
      const marca = await call(url, '/api/admin/brands', {
        method: 'POST', as: OWNER, body: { name: 'LifePod', slug: 'lifepod' }
      });
      const linea = await call(url, '/api/admin/products', {
        method: 'POST',
        as: OWNER,
        body: {
          slug: 'eco-pro', brandId: data(marca).id, category: 'disposables', name: 'ECO PRO',
          price: 45000, imageKey: 'lifepod/eco-pro.webp'
        }
      });
      return { brandId: data(marca).id as string, productId: data(linea).id as string };
    }

    it('acompaña la línea con lo que le falta para publicarse', async () => {
      const { url } = await start();
      const { productId } = await conLinea(url);

      const detalle = await call(url, `/api/admin/products/${productId}`, { as: OWNER });
      expect(detalle.status).toBe(200);
      expect(detalle.body?.meta).toEqual({ readiness: { canPublish: false, missing: ['activeVariant'] } });
    });

    it('responde 409 y dice qué falta cuando no se puede publicar', async () => {
      const { url } = await start();
      const { productId } = await conLinea(url);

      const intento = await call(url, `/api/admin/products/${productId}`, {
        method: 'PATCH', as: OWNER, body: { status: 'published' }
      });

      expect(intento.status).toBe(409);
      expect(intento.body?.code).toBe('NOT_PUBLISHABLE');
      expect(intento.body?.missing).toEqual(['activeVariant']);
    });

    it('publica una vez que hay variante activa', async () => {
      const { url } = await start();
      const { productId } = await conLinea(url);

      const variante = await call(url, `/api/admin/products/${productId}/variants`, {
        method: 'POST', as: OWNER, body: { kind: 'flavor', name: 'Mango Ice', slug: 'mango-ice' }
      });
      expect(variante.status).toBe(201);
      expect(data(variante)).toMatchObject({ slug: 'mango-ice', active: true, stock: 0 });

      const publicada = await call(url, `/api/admin/products/${productId}`, {
        method: 'PATCH', as: OWNER, body: { status: 'published' }
      });
      expect(publicada.status).toBe(200);
      expect(data(publicada)).toMatchObject({ status: 'published' });
      expect(publicada.body?.meta).toEqual({ readiness: { canPublish: true, missing: [] } });

      const variantes = await call(url, `/api/admin/products/${productId}/variants`, { as: OWNER });
      expect((variantes.body?.data as unknown[]).length).toBe(1);
    });

    it('404 en una línea que no existe, y en una variante de otra línea', async () => {
      const { url } = await start();
      const { brandId, productId } = await conLinea(url);

      const sinLinea = await call(url, `/api/admin/products/${AJENO}/variants`, {
        method: 'POST', as: OWNER, body: { kind: 'flavor', name: 'Uva', slug: 'uva' }
      });
      expect(sinLinea.status).toBe(404);

      const variante = await call(url, `/api/admin/products/${productId}/variants`, {
        method: 'POST', as: OWNER, body: { kind: 'flavor', name: 'Uva', slug: 'uva' }
      });
      const otra = await call(url, '/api/admin/products', {
        method: 'POST', as: OWNER, body: { slug: 'eco-3', brandId, category: 'disposables', name: 'ECO 3' }
      });

      const cruzada = await call(
        url,
        `/api/admin/products/${data(otra).id}/variants/${data(variante).id}`,
        { method: 'PATCH', as: OWNER, body: { name: 'Uva Ice' } }
      );
      expect(cruzada.status).toBe(404);
    });

    it('filtra el listado por estado y por marca', async () => {
      const { url } = await start();
      const { brandId } = await conLinea(url);

      const borradores = await call(url, `/api/admin/products?status=draft&brandId=${brandId}`, { as: OWNER });
      expect((borradores.body?.data as unknown[]).length).toBe(1);

      const publicadas = await call(url, '/api/admin/products?status=published', { as: OWNER });
      expect((publicadas.body?.data as unknown[]).length).toBe(0);

      const categoriaInventada = await call(url, '/api/admin/products?category=vapes', { as: OWNER });
      expect(categoriaInventada.status).toBe(400);
    });
  });

  describe('proveedores', () => {
    it('guarda el vínculo con marcas y lo devuelve en la ficha', async () => {
      const { url } = await start();
      const marca = await call(url, '/api/admin/brands', {
        method: 'POST', as: OWNER, body: { name: 'LifePod', slug: 'lifepod' }
      });

      const creado = await call(url, '/api/admin/suppliers', {
        method: 'POST', as: OWNER, body: { name: 'Distribuidora Andina', brandIds: [data(marca).id] }
      });
      expect(creado.status).toBe(201);

      const ficha = await call(url, `/api/admin/suppliers/${data(creado).id}`, { as: OWNER });
      expect(data(ficha)).toMatchObject({
        name: 'Distribuidora Andina',
        brands: [{ id: data(marca).id, name: 'LifePod' }],
        lastInboundAt: null
      });
    });

    it('rechaza una marca inexistente con 400', async () => {
      const { url } = await start();
      const respuesta = await call(url, '/api/admin/suppliers', {
        method: 'POST', as: OWNER, body: { name: 'Andina', brandIds: [AJENO] }
      });
      expect(respuesta.status).toBe(400);
    });
  });

  describe('contenido', () => {
    it('publica una versión y la devuelve en la lectura', async () => {
      const { url } = await start();

      const publicada = await call(url, '/api/admin/content/hero', {
        method: 'PUT', as: OWNER, body: { value: { title: 'Vapeá en Paraná' } }
      });
      expect(publicada.status).toBe(201);
      expect(data(publicada)).toMatchObject({ key: 'hero', version: 1, userId: OWNER });

      const leida = await call(url, '/api/admin/content/hero', { as: OWNER });
      expect(data(leida).value).toEqual({ title: 'Vapeá en Paraná' });

      const segunda = await call(url, '/api/admin/content/hero', {
        method: 'PUT', as: OWNER, body: { value: { title: 'Otro' } }
      });
      expect(data(segunda).version).toBe(2);

      const versiones = await call(url, '/api/admin/content/hero/versions', { as: OWNER });
      expect((versiones.body?.data as { version: number }[]).map(v => v.version)).toEqual([2, 1]);
    });

    it('solo owner publica, y la clave tiene que ser de la lista', async () => {
      const { url } = await start();

      const operador = await call(url, '/api/admin/content/hero', {
        method: 'PUT', as: OPERATOR, body: { value: { title: 'x' } }
      });
      expect(operador.status).toBe(403);

      const inventada = await call(url, '/api/admin/content/inventada', {
        method: 'PUT', as: OWNER, body: { value: { title: 'x' } }
      });
      expect(inventada.status).toBe(400);

      // Las claves disponibles se pueden consultar.
      const claves = await call(url, '/api/admin/content', { as: OWNER });
      expect(claves.body?.data).toContain('hero');
    });

    it('404 en una clave sin publicar todavía', async () => {
      const { url } = await start();
      const respuesta = await call(url, '/api/admin/content/contact', { as: OWNER });
      expect(respuesta.status).toBe(404);
      expect(respuesta.body?.code).toBe('NOT_FOUND');
    });
  });
});
