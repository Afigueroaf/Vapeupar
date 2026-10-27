import { beforeEach, describe, expect, it } from 'vitest';
import { ContentError, ContentService } from './content.service.js';
import { InMemorySiteContentRepository } from '../repositories/in-memory-site-content.repository.js';
import {
  ContentTransaction, ContentVersionConflictError, SiteContentRepository
} from '../repositories/site-content.repository.js';

/**
 * Contenido del sitio (plan A4.2). Lo que importa aquí es que publicar **no
 * sobrescriba**: cada publicación es una versión nueva, firmada y auditada, y
 * la anterior sigue disponible para volver atrás.
 */

const AUTHOR = { userId: '019299a4-0000-7000-8000-000000000001' };
const NOW = new Date('2026-10-27T15:00:00.000Z');

let repo: InMemorySiteContentRepository;
let service: ContentService;

beforeEach(() => {
  repo = new InMemorySiteContentRepository(() => NOW);
  service = new ContentService(repo, () => NOW);
});

describe('publicación', () => {
  it('crea la versión 1 y la deja auditada', async () => {
    const version = await service.publish('hero', { value: { title: 'Vapeá en Paraná' } }, AUTHOR);

    expect(version).toMatchObject({
      key: 'hero',
      version: 1,
      publishedAt: NOW,
      userId: AUTHOR.userId,
      value: { title: 'Vapeá en Paraná' }
    });
    expect(repo.audits).toHaveLength(1);
    expect(repo.audits[0]).toMatchObject({
      userId: AUTHOR.userId,
      entity: 'content',
      entityId: 'hero',
      action: 'content.publish'
    });
    // No había nada antes: el registro lo dice dejando `before` vacío.
    expect(repo.audits[0]?.before).toBeUndefined();
  });

  it('añade versiones en vez de sobrescribir, y guarda la anterior en la auditoría', async () => {
    await service.publish('faq', { value: { items: [] } }, AUTHOR);
    const segunda = await service.publish('faq', { value: { items: ['¿Hacen envíos?'] } }, AUTHOR);

    expect(segunda.version).toBe(2);
    expect(repo.audits[1]?.before).toEqual({ version: 1, value: { items: [] } });
    expect(repo.audits[1]?.after).toEqual({ version: 2, value: { items: ['¿Hacen envíos?'] } });

    const versiones = await service.listVersions('faq', 10);
    expect(versiones.map(v => v.version)).toEqual([2, 1]);
  });

  it('la lectura devuelve siempre la última versión', async () => {
    await service.publish('seo', { value: { title: 'viejo' } }, AUTHOR);
    await service.publish('seo', { value: { title: 'nuevo' } }, AUTHOR);

    expect((await service.get('seo')).value).toEqual({ title: 'nuevo' });
  });

  it('no mezcla claves', async () => {
    await service.publish('hero', { value: { a: 1 } }, AUTHOR);
    const trust = await service.publish('trust-band', { value: { b: 2 } }, AUTHOR);

    // Cada clave lleva su propio correlativo.
    expect(trust.version).toBe(1);
  });

  it('rechaza un valor que no es un objeto JSON y uno desproporcionado', async () => {
    await expect(service.publish('hero', { value: 'texto suelto' }, AUTHOR))
      .rejects.toMatchObject({ code: 'VALIDATION' });

    const enorme = { texto: 'x'.repeat(70 * 1024) };
    await expect(service.publish('hero', { value: enorme }, AUTHOR))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    expect(repo.audits).toHaveLength(0);
  });
});

describe('lectura sin contenido', () => {
  it('lanza NOT_FOUND cuando la clave nunca se publicó', async () => {
    const error = await service.get('contact').then(() => undefined, (e: unknown) => e);
    expect(error).toBeInstanceOf(ContentError);
    expect((error as ContentError).code).toBe('NOT_FOUND');
  });

  it('devuelve una lista vacía de versiones, no un error', async () => {
    expect(await service.listVersions('contact', 10)).toEqual([]);
  });
});

describe('carrera por el número de versión', () => {
  /** Dos publicaciones a la vez: la segunda ve el índice único de `[key, version]`. */
  const perdedor: SiteContentRepository = {
    transaction: work => work({
      findLatest: async () => undefined,
      insert: async entry => {
        throw new ContentVersionConflictError(entry.key, entry.version);
      },
      audit: { write: async () => undefined }
    } as ContentTransaction),
    findLatest: async () => undefined,
    listVersions: async () => []
  };

  it('se traduce a CONFLICT para que la consola reintente', async () => {
    const service = new ContentService(perdedor);
    await expect(service.publish('hero', { value: { a: 1 } }, AUTHOR))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
