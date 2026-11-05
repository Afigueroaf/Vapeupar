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
import { InMemoryInventoryNoteRepository } from '../../repositories/in-memory-inventory-note.repository.js';
import { InventoryNoteService } from '../../services/inventory-note.service.js';
import { ImageUploadService } from '../../services/image-upload.service.js';
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
  const inventoryNotes = new InMemoryInventoryNoteRepository(SEED, catalog);

  const app = createApp({
    adminRouter: createAdminRouter({
      users: new InMemoryUserRepository(SEED),
      guard,
      catalog,
      catalogService: new CatalogService(catalog),
      contentService: new ContentService(content),
      inventoryNotes: new InventoryNoteService(inventoryNotes),
      // Firma de mentira: aquí se verifica el permiso y la clave, no AWS.
      imageUploads: new ImageUploadService({
        catalog, bucket: 'catalog', sign: async () => 'https://upload.example/signed',
        distributionId: 'E123', invalidate: async () => 'I123'
      }),
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

    // La pantalla «Vitrina» pide las dos mitades del catálogo por separado, y
    // la elección viaja en el PATCH de siempre: no hay endpoint propio.
    it('filtra el listado por la vitrina y la elección se guarda con un PATCH', async () => {
      const { url } = await start();
      const { productId } = await conLinea(url);

      const nace = await call(url, '/api/admin/products?showcase=true', { as: OWNER });
      expect((nace.body?.data as unknown[]).length).toBe(0);

      const elegida = await call(url, `/api/admin/products/${productId}`, {
        method: 'PATCH', as: OWNER, body: { showcase: true }
      });
      expect(elegida.status).toBe(200);
      expect(data(elegida).showcase).toBe(true);
      // `featured` es otra cosa y no se ha tocado.
      expect(data(elegida).featured).toBe(false);

      const enVitrina = await call(url, '/api/admin/products?showcase=true', { as: OWNER });
      expect((enVitrina.body?.data as unknown[]).length).toBe(1);

      const fuera = await call(url, '/api/admin/products?showcase=false', { as: OWNER });
      expect((fuera.body?.data as unknown[]).length).toBe(0);
    });

    it('no deja que el operador cambie la vitrina', async () => {
      const { url } = await start();
      const { productId } = await conLinea(url);

      const intento = await call(url, `/api/admin/products/${productId}`, {
        method: 'PATCH', as: OPERATOR, body: { showcase: true }
      });
      expect(intento.status).toBe(403);
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
        lastInboundAt: null,
        suppliedVariantCount: 0
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

  describe('notas de inventario', () => {
    it('las lee cualquier sesión, pero solo owner puede crear y resolver', async () => {
      const { url } = await start();
      const denied = await call(url, '/api/admin/inventory-notes', {
        method: 'POST', as: OPERATOR, body: { text: 'Revisar lote' }
      });
      expect(denied.status).toBe(403);

      const created = await call(url, '/api/admin/inventory-notes', {
        method: 'POST', as: OWNER, body: { text: 'Revisar lote' }
      });
      expect(created.status).toBe(201);
      const note = data(created);
      expect((await call(url, '/api/admin/inventory-notes', { as: OPERATOR })).status).toBe(200);
      expect((await call(url, `/api/admin/inventory-notes/${note.id}/resolve`, { method: 'PATCH', as: OPERATOR })).status).toBe(403);
      expect((await call(url, `/api/admin/inventory-notes/${note.id}/resolve`, { method: 'PATCH', as: OWNER })).body?.data)
        .toMatchObject({ resolved: true, authorId: OWNER, authorEmail: 'owner@vapeupar.com' });
    });

    it('la nota dice a qué variante apunta, aunque no esté en la página', async () => {
      const { url, catalog } = await start();
      const brand = catalog.seedBrand();
      const product = catalog.seedProduct({ brandId: brand.id, slug: 'eco-pro', name: 'ECO PRO' });
      const variant = catalog.seedVariant({ productId: product.id, slug: 'mango-ice', name: 'Mango Ice' });

      const created = await call(url, '/api/admin/inventory-notes', {
        method: 'POST', as: OWNER, body: { variantId: variant.id, text: 'Lote con la foto pendiente' }
      });
      expect(data(created)).toMatchObject({ variantName: 'Mango Ice', productName: 'ECO PRO' });

      // La consola no tiene por qué tener esa fila cargada: el nombre viaja.
      const listadas = await call(url, '/api/admin/inventory-notes', { as: OPERATOR });
      expect((listadas.body?.data as { variantName: string }[])[0].variantName).toBe('Mango Ice');
    });
  });
});

/**
 * Permiso de imágenes (§4.5 del traspaso 2026-10-27): el `operator` firma
 * subidas y guarda la clave, pero cualquier otro campo en el mismo PATCH lo
 * deja fuera. Lo que se comprueba aquí es la frontera, no la subida a S3.
 */
describe('imágenes del catálogo', () => {
  it('el operator firma la subida de cualquier imagen', async () => {
    const { url, catalog } = await start();
    const brand = catalog.seedBrand({ slug: 'lifepod' });
    const product = catalog.seedProduct({ brandId: brand.id, slug: 'eco-pro' });
    const variant = catalog.seedVariant({ productId: product.id, slug: 'mango-ice' });

    const firmada = await call(url, '/api/admin/uploads/presign', {
      method: 'POST', as: OPERATOR,
      body: { target: 'variant-image', entityId: variant.id, contentType: 'image/webp', size: 2048 }
    });
    expect(firmada.status).toBe(200);
    expect(data(firmada)).toMatchObject({ key: 'productos/eco-pro/mango-ice.webp', expiresIn: 300 });

    const logo = await call(url, '/api/admin/uploads/presign', {
      method: 'POST', as: OPERATOR,
      body: { target: 'brand-logo', entityId: brand.id, contentType: 'image/webp', size: 2048 }
    });
    expect(data(logo).key).toBe('marcas/lifepod/logo.webp');
  });

  it('el operator guarda la imagen de la variante, pero nada más', async () => {
    const { url, catalog } = await start();
    const brand = catalog.seedBrand();
    const product = catalog.seedProduct({ brandId: brand.id, slug: 'eco-pro' });
    const variant = catalog.seedVariant({ productId: product.id, slug: 'mango-ice' });
    const ruta = `/api/admin/products/${product.id}/variants/${variant.id}`;

    const soloImagen = await call(url, ruta, {
      method: 'PATCH', as: OPERATOR, body: { imageKey: 'productos/eco-pro/mango-ice.webp' }
    });
    expect(soloImagen.status).toBe(200);
    expect(data(soloImagen).imageKey).toBe('productos/eco-pro/mango-ice.webp');

    // Un campo de más y se rechaza entero: ni la imagen se guarda.
    const conExtra = await call(url, ruta, {
      method: 'PATCH', as: OPERATOR, body: { imageKey: 'productos/eco-pro/otra.webp', active: false }
    });
    expect(conExtra.status).toBe(403);

    const otroCampo = await call(url, ruta, { method: 'PATCH', as: OPERATOR, body: { active: false } });
    expect(otroCampo.status).toBe(403);

    const actual = await call(url, `/api/admin/products/${product.id}/variants`, { as: OPERATOR });
    expect((actual.body?.data as { imageKey: string | null; active: boolean }[])[0])
      .toMatchObject({ imageKey: 'productos/eco-pro/mango-ice.webp', active: true });
  });

  it('el operator puede invalidar la caché de una clave del catálogo', async () => {
    const { url } = await start();

    const ok = await call(url, '/api/admin/uploads/invalidate', {
      method: 'POST', as: OPERATOR, body: { key: 'productos/eco-pro/mango-ice.webp' }
    });
    expect(ok.status).toBe(200);
    expect(data(ok)).toEqual({ invalidationId: 'I123', path: '/productos/eco-pro/mango-ice.webp' });

    const comodin = await call(url, '/api/admin/uploads/invalidate', {
      method: 'POST', as: OWNER, body: { key: 'productos/*' }
    });
    expect(comodin.status).toBe(400);
  });

  it('reemplazar la imagen manda la misma clave y se acepta', async () => {
    // La clave la deriva el backend de la entidad, así que cambiar la foto de
    // una variante que ya tenía una **no** cambia la clave. La consola manda el
    // PATCH igual, para dejar constancia del cambio, y no puede recibir un 400.
    const { url, catalog } = await start();
    const brand = catalog.seedBrand();
    const product = catalog.seedProduct({ brandId: brand.id, slug: 'eco-pro' });
    const variant = catalog.seedVariant({
      productId: product.id, slug: 'mango-ice', imageKey: 'productos/eco-pro/mango-ice.webp'
    });

    const repetida = await call(url, `/api/admin/products/${product.id}/variants/${variant.id}`, {
      method: 'PATCH', as: OPERATOR, body: { imageKey: 'productos/eco-pro/mango-ice.webp' }
    });
    expect(repetida.status).toBe(200);
    expect(data(repetida).imageKey).toBe('productos/eco-pro/mango-ice.webp');

    const marca = await call(url, `/api/admin/brands/${brand.id}`, {
      method: 'PATCH', as: OWNER, body: { logoKey: brand.logoKey }
    });
    expect(marca.status).toBe(200);
  });

  it('la misma regla en marca, línea y proveedor', async () => {
    const { url, catalog } = await start();
    const brand = catalog.seedBrand({ slug: 'lifepod' });
    const product = catalog.seedProduct({ brandId: brand.id, slug: 'eco-pro' });
    const supplier = catalog.seedSupplier();

    expect((await call(url, `/api/admin/brands/${brand.id}`, {
      method: 'PATCH', as: OPERATOR, body: { logoKey: 'marcas/lifepod/logo.webp' }
    })).status).toBe(200);
    expect((await call(url, `/api/admin/brands/${brand.id}`, {
      method: 'PATCH', as: OPERATOR, body: { name: 'Otra' }
    })).status).toBe(403);

    expect((await call(url, `/api/admin/products/${product.id}`, {
      method: 'PATCH', as: OPERATOR, body: { imageKey: 'productos/eco-pro/linea.webp' }
    })).status).toBe(200);
    expect((await call(url, `/api/admin/products/${product.id}`, {
      method: 'PATCH', as: OPERATOR, body: { status: 'published' }
    })).status).toBe(403);

    expect((await call(url, `/api/admin/suppliers/${supplier.id}`, {
      method: 'PATCH', as: OPERATOR, body: { imageKey: `proveedores/${supplier.id}/logo.webp` }
    })).status).toBe(200);
    expect((await call(url, `/api/admin/suppliers/${supplier.id}`, {
      method: 'PATCH', as: OPERATOR, body: { active: false } })).status).toBe(403);
  });
});
