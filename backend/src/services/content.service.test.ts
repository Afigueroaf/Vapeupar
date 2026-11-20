import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentError, ContentService } from './content.service.js';
import { InMemorySiteContentRepository } from '../repositories/in-memory-site-content.repository.js';
import { CONTENT_KEYS, CONTENT_SCHEMAS, LEGAL_FAQ_ITEM, PARTNER_BRANDS_TOKEN } from '../schemas/content/index.js';
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

/** Valores válidos por clave: los de A7.1 obligan a cumplir el esquema. */
const hero = (tagline: string) => ({ label: 'SYSTEM ONLINE', tagline });
const faq = (question: string) => ({
  title: 'Preguntas', intro: 'Lo que más nos preguntan.', items: [{ question, answer: 'Sí.' }]
});

let repo: InMemorySiteContentRepository;
let service: ContentService;

beforeEach(() => {
  repo = new InMemorySiteContentRepository(() => NOW);
  service = new ContentService(repo, () => NOW);
});

describe('publicación', () => {
  it('crea la versión 1 y la deja auditada', async () => {
    const version = await service.publish('hero', { value: hero('Vapeá en Valledupar') }, AUTHOR);

    expect(version).toMatchObject({
      key: 'hero',
      version: 1,
      publishedAt: NOW,
      userId: AUTHOR.userId,
      value: hero('Vapeá en Valledupar')
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
    await service.publish('faq', { value: faq('¿Abren hoy?') }, AUTHOR);
    const segunda = await service.publish('faq', { value: faq('¿Hacen envíos?') }, AUTHOR);

    expect(segunda.version).toBe(2);
    expect(repo.audits[1]?.before).toEqual({ version: 1, value: faq('¿Abren hoy?') });
    expect(repo.audits[1]?.after).toEqual({ version: 2, value: faq('¿Hacen envíos?') });

    const versiones = await service.listVersions('faq', 10);
    expect(versiones.map(v => v.version)).toEqual([2, 1]);
  });

  it('la lectura devuelve siempre la última versión', async () => {
    await service.publish('hero', { value: hero('viejo') }, AUTHOR);
    await service.publish('hero', { value: hero('nuevo') }, AUTHOR);

    expect((await service.get('hero')).value).toEqual(hero('nuevo'));
  });

  it('no mezcla claves', async () => {
    await service.publish('hero', { value: hero('uno') }, AUTHOR);
    const trust = await service.publish('trust-band', { value: CONTENT_SCHEMAS['trust-band'].defaults }, AUTHOR);

    // Cada clave lleva su propio correlativo.
    expect(trust.version).toBe(1);
  });

  it('rechaza un valor que no es un objeto JSON y uno desproporcionado', async () => {
    await expect(service.publish('hero', { value: 'texto suelto' }, AUTHOR))
      .rejects.toMatchObject({ code: 'VALIDATION' });

    const enorme = { label: 'x', tagline: 'x'.repeat(70 * 1024) };
    await expect(service.publish('hero', { value: enorme }, AUTHOR))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    expect(repo.audits).toHaveLength(0);
  });
});

describe('esquema por clave (A7.1)', () => {
  it('los valores por defecto cumplen su propio esquema', () => {
    for (const key of CONTENT_KEYS) {
      expect(CONTENT_SCHEMAS[key].schema.safeParse(CONTENT_SCHEMAS[key].defaults).success, key).toBe(true);
    }
  });

  it('la respuesta de autenticidad deja el hueco de las marcas aliadas', () => {
    const answers = CONTENT_SCHEMAS.faq.defaults.items.map(item => item.answer).join(' ');
    expect(answers).toContain(PARTNER_BRANDS_TOKEN);
    // Ninguna marca escrita a mano: la enumeración se genera (ADR-002 §5).
    expect(answers).not.toMatch(/Lost Mary|Geekvape|OXVA|Elf Bar|Nasty/i);
  });

  it('rechaza campos desconocidos, que falte uno y textos fuera de límite', async () => {
    await expect(service.publish('hero', { value: { ...hero('x'), extra: 'y' } }, AUTHOR))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(service.publish('hero', { value: { label: 'x' } }, AUTHOR))
      .rejects.toMatchObject({
        code: 'VALIDATION',
        message: expect.stringContaining('value.tagline'),
        // Cada campo por separado, para que la consola lo señale en su sitio.
        fields: [expect.objectContaining({ field: 'value.tagline' })]
      });
    await expect(service.publish('hero', { value: hero('x'.repeat(33)) }, AUTHOR))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(service.publish('hero', { value: hero('   ') }, AUTHOR))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    expect(repo.audits).toHaveLength(0);
  });

  it('la banda de confianza lleva exactamente tres tarjetas', async () => {
    const [first] = CONTENT_SCHEMAS['trust-band'].defaults.items;
    await expect(service.publish('trust-band', { value: { items: [first, first] } }, AUTHOR))
      .rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('el marcador de marcas aliadas solo se admite en la FAQ', async () => {
    await expect(service.publish('hero', { value: hero(`Somos ${PARTNER_BRANDS_TOKEN}`) }, AUTHOR))
      .rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(service.publish('faq', { value: faq(`¿Venden ${PARTNER_BRANDS_TOKEN}?`) }, AUTHOR))
      .resolves.toMatchObject({ version: 1 });
  });

  it('guarda el valor ya recortado', async () => {
    const version = await service.publish('hero', { value: hero('  con espacios  ') }, AUTHOR);
    expect(version.value).toEqual(hero('con espacios'));
  });
});

describe('lectura pública (A7.2)', () => {
  it('sirve el valor por defecto mientras la clave no se publica', async () => {
    const leido = await service.getPublic('faq');
    expect(leido).toMatchObject({ key: 'faq', source: 'default', version: null });
    expect(leido.value).toEqual(CONTENT_SCHEMAS.faq.defaults);
  });

  it('sirve la última versión publicada', async () => {
    await service.publish('hero', { value: hero('publicado') }, AUTHOR);
    expect(await service.getPublic('hero')).toMatchObject({
      source: 'published', version: 1, value: hero('publicado')
    });
  });

  it('cae al valor por defecto si la fila guardada no cumple el esquema', async () => {
    // Una fila de antes de A7.1, cuando la ruta aceptaba cualquier objeto.
    await repo.transaction(tx => tx.insert({
      key: 'hero', value: { title: 'viejo' }, version: 1, publishedAt: NOW, userId: AUTHOR.userId
    }));
    expect(await service.getPublic('hero')).toMatchObject({ source: 'default', value: CONTENT_SCHEMAS.hero.defaults });
  });
});

describe('pregunta legal +18 fija en código', () => {
  const legalEditada = { question: `  ${LEGAL_FAQ_ITEM.question.toUpperCase()} `, answer: 'Ya no hace falta.' };

  it('no forma parte del texto por defecto: la pinta el sitio desde LEGAL_FAQ_ITEM', () => {
    const questions = CONTENT_SCHEMAS.faq.defaults.items.map(item => item.question);
    expect(questions).not.toContain(LEGAL_FAQ_ITEM.question);
  });

  it('al publicar se quita aunque venga con otra respuesta o con otro formato', async () => {
    const version = await service.publish('faq', {
      value: { ...faq('¿Abren hoy?'), items: [{ question: '¿Abren hoy?', answer: 'Sí.' }, legalEditada] }
    }, AUTHOR);
    expect(version.value).toEqual(faq('¿Abren hoy?'));
  });

  it('admite 11 preguntas editables y rechaza 12', async () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ question: `¿Pregunta ${i}?`, answer: 'Sí.' }));
    await expect(service.publish('faq', { value: { ...faq('x'), items: items(11) } }, AUTHOR))
      .resolves.toMatchObject({ version: 1 });
    await expect(service.publish('faq', { value: { ...faq('x'), items: items(12) } }, AUTHOR))
      .rejects.toMatchObject({ code: 'VALIDATION', fields: [expect.objectContaining({ field: 'value.items' })] });
  });

  it('la reconoce sin tildes ni signos de puntuación', async () => {
    const sinTildes = { question: 'es obligatoria la CEDULA de ciudadania para recibir el pedido', answer: 'No.' };
    const version = await service.publish('faq', {
      value: { ...faq('¿Abren hoy?'), items: [{ question: '¿Abren hoy?', answer: 'Sí.' }, sinTildes] }
    }, AUTHOR);
    expect(version.value).toEqual(faq('¿Abren hoy?'));
  });

  it('una FAQ antigua con 12 preguntas editables se sirve recortada a 11, no cae al defecto', async () => {
    const doce = Array.from({ length: 12 }, (_, i) => ({ question: `¿Pregunta ${i}?`, answer: 'Sí.' }));
    await repo.transaction(tx => tx.insert({
      key: 'faq', value: { ...faq('x'), items: [...doce, LEGAL_FAQ_ITEM] }, version: 1, publishedAt: NOW, userId: AUTHOR.userId
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const leido = await service.getPublic('faq');
      expect(leido).toMatchObject({ source: 'published', version: 1 });
      expect((leido.value as { items: unknown[] }).items).toEqual(doce.slice(0, 11));
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    // Al publicar, el máximo se exige.
    await expect(service.publish('faq', { value: { ...faq('x'), items: doce } }, AUTHOR))
      .rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('una FAQ con solo la pregunta legal se queda sin preguntas y no se publica', async () => {
    await expect(service.publish('faq', { value: { ...faq('x'), items: [LEGAL_FAQ_ITEM] } }, AUTHOR))
      .rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('una versión antigua que la lleva dentro se sirve sin duplicarla', async () => {
    // Fila de antes de la regla: las 5 preguntas de entonces, legal incluida.
    const antigua = {
      ...CONTENT_SCHEMAS.faq.defaults,
      items: [...CONTENT_SCHEMAS.faq.defaults.items.slice(0, 3), LEGAL_FAQ_ITEM, ...CONTENT_SCHEMAS.faq.defaults.items.slice(3)]
    };
    await repo.transaction(tx => tx.insert({
      key: 'faq', value: antigua, version: 1, publishedAt: NOW, userId: AUTHOR.userId
    }));
    const leido = await service.getPublic('faq');
    expect(leido).toMatchObject({ source: 'published', version: 1 });
    expect(leido.value).toEqual(CONTENT_SCHEMAS.faq.defaults);
  });
});

describe('restaurar (A5.4)', () => {
  it('vuelve a publicar el valor de la versión N como N+1, sin tocar el historial', async () => {
    await service.publish('hero', { value: hero('primero') }, AUTHOR);
    await service.publish('hero', { value: hero('segundo') }, AUTHOR);

    const restaurada = await service.restore('hero', 1, AUTHOR);
    expect(restaurada).toMatchObject({ version: 3, value: hero('primero') });
    expect((await service.listVersions('hero', 10)).map(v => [v.version, v.value])).toEqual([
      [3, hero('primero')], [2, hero('segundo')], [1, hero('primero')]
    ]);

    expect(repo.audits[2]).toMatchObject({ action: 'content.restore', entityId: 'hero' });
    expect(repo.audits[2]?.before).toEqual({ version: 2, value: hero('segundo') });
    expect(repo.audits[2]?.after).toEqual({ version: 3, value: hero('primero'), restoredFrom: 1 });
  });

  it('NOT_FOUND si la versión no existe', async () => {
    await expect(service.restore('hero', 7, AUTHOR)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.audits).toHaveLength(0);
  });

  it('una versión que ya no cumple el esquema no se restaura', async () => {
    await repo.transaction(tx => tx.insert({
      key: 'hero', value: { title: 'viejo' }, version: 1, publishedAt: NOW, userId: AUTHOR.userId
    }));
    await expect(service.restore('hero', 1, AUTHOR)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('restaurar una FAQ antigua quita la pregunta legal', async () => {
    await repo.transaction(tx => tx.insert({
      key: 'faq', value: { ...faq('¿Abren?'), items: [{ question: '¿Abren?', answer: 'Sí.' }, LEGAL_FAQ_ITEM] },
      version: 1, publishedAt: NOW, userId: AUTHOR.userId
    }));
    expect((await service.restore('faq', 1, AUTHOR)).value).toEqual(faq('¿Abren?'));
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
    findVersion: async () => undefined,
    listVersions: async () => []
  };

  it('se traduce a CONFLICT para que la consola reintente', async () => {
    const service = new ContentService(perdedor);
    await expect(service.publish('hero', { value: hero('a la vez') }, AUTHOR))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
