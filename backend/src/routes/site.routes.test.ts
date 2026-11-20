import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import { createBrandsPublicRouter, createContentPublicRouter } from './site.routes.js';
import { InMemoryCatalogRepository } from '../repositories/in-memory-catalog.repository.js';
import { InMemorySiteContentRepository } from '../repositories/in-memory-site-content.repository.js';
import { ContentService } from '../services/content.service.js';
import { CONTENT_SCHEMAS } from '../schemas/content/index.js';
import { SiteContentRepository } from '../repositories/site-content.repository.js';

/**
 * Lectura pública de contenido y marcas aliadas (plan A7.2 y A7.4), contra la
 * aplicación real en un puerto efímero. Sin sesión: es lo que pinta la portada.
 */

const AUTHOR = { userId: '019299a4-0000-7000-8000-000000000001' };
const servers: Server[] = [];

async function start(content: SiteContentRepository = new InMemorySiteContentRepository()) {
  const catalog = new InMemoryCatalogRepository();
  const service = new ContentService(content);
  const app = createApp({
    contentRouter: createContentPublicRouter({ content: service }),
    brandsRouter: createBrandsPublicRouter({ catalog })
  });
  const server = await new Promise<Server>(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, catalog, service };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))));
});

async function get(url: string) {
  const response = await fetch(url);
  return { status: response.status, body: await response.json() as { success: boolean; data?: unknown } };
}

describe('GET /api/content/:key', () => {
  it('sirve el valor por defecto de una clave nunca publicada', async () => {
    const { url } = await start();
    const { status, body } = await get(`${url}/api/content/faq`);

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ key: 'faq', source: 'default', version: null });
    expect((body.data as { value: unknown }).value).toEqual(CONTENT_SCHEMAS.faq.defaults);
  });

  it('sirve lo publicado, sin sesión', async () => {
    const { url, service } = await start();
    await service.publish('hero', { value: { label: 'ONLINE', tagline: 'Nuevo reclamo' } }, AUTHOR);

    const { body } = await get(`${url}/api/content/hero`);
    expect(body.data).toMatchObject({ source: 'published', version: 1, value: { label: 'ONLINE', tagline: 'Nuevo reclamo' } });
  });

  it('400 en una clave fuera de la lista, incluidos los ajustes internos', async () => {
    const { url } = await start();
    expect((await get(`${url}/api/content/inventada`)).status).toBe(400);
    // `setting.*` vive en la misma tabla pero no es contenido público.
    expect((await get(`${url}/api/content/setting.low-stock-threshold`)).status).toBe(400);
  });

  it('500 si la base falla, para que el sitio caiga a su respaldo', async () => {
    const roto: SiteContentRepository = {
      transaction: async () => { throw new Error('sin base'); },
      findLatest: async () => { throw new Error('sin base'); },
      findVersion: async () => undefined,
      listVersions: async () => []
    };
    const { url } = await start(roto);
    expect((await get(`${url}/api/content/faq`)).status).toBe(500);
  });
});

describe('GET /api/brands/partners', () => {
  it('lista solo las aliadas activas, con nombre y slug', async () => {
    const { url, catalog } = await start();
    catalog.seedBrand({ name: 'LifePod', slug: 'lifepod', isPartner: true });
    catalog.seedBrand({ name: 'Retirada', slug: 'retirada', isPartner: true, active: false });
    catalog.seedBrand({ name: 'No aliada', slug: 'no-aliada', isPartner: false });

    const { status, body } = await get(`${url}/api/brands/partners`);
    expect(status).toBe(200);
    expect(body.data).toEqual([{ name: 'LifePod', slug: 'lifepod' }]);
  });
});
