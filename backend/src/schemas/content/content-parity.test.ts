import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  CONTENT_KEYS, CONTENT_SCHEMAS, FAQ_MAX_ITEMS, LEGAL_FAQ_INDEX, LEGAL_FAQ_ITEM, PARTNER_BRANDS_TOKEN,
  TRUST_BAND_ICONS, comparableQuestion, normalizeFaqForRead, stripLegalFaqItem
} from './index.js';
import * as mirror from '../../../../frontend/src/lib/content/schemas.js';

/**
 * El frontend lleva un espejo de estos esquemas (`frontend/src/lib/content/schemas.ts`)
 * porque todavía no hay paquete de contratos compartido. Si uno cambia y el
 * otro no, el sitio descartaría contenido válido —o aceptaría uno que el
 * backend rechaza— sin que nada falle a la vista. Esta prueba lo hace fallar.
 */
describe('paridad con el espejo del frontend', () => {
  it('tiene las mismas claves', () => {
    expect(Object.keys(mirror.CONTENT_SCHEMAS).sort()).toEqual([...CONTENT_KEYS].sort());
  });

  for (const key of CONTENT_KEYS) {
    it(`"${key}": misma forma y mismo valor por defecto`, () => {
      const front = mirror.CONTENT_SCHEMAS[key];
      expect(z.toJSONSchema(front.schema)).toEqual(z.toJSONSchema(CONTENT_SCHEMAS[key].schema));
      expect(front.defaults).toEqual(CONTENT_SCHEMAS[key].defaults);
    });
  }

  // `z.toJSONSchema` no representa `.trim()`: sin esto, quitar el recorte de un
  // lado pasaría la prueba de forma.
  it('recorta y rechaza lo vacío igual en los dos lados', () => {
    const casos = [
      { label: '  ONLINE  ', tagline: ' Reclamo ' },
      { label: '   ', tagline: 'x' }
    ];
    for (const caso of casos) {
      const back = CONTENT_SCHEMAS.hero.schema.safeParse(caso);
      const front = mirror.CONTENT_SCHEMAS.hero.schema.safeParse(caso);
      expect(front.success).toBe(back.success);
      if (back.success && front.success) expect(front.data).toEqual(back.data);
    }
  });

  // El rediseño de las tarjetas añadió `icon`, `highlight` y `points`
  // opcionales: una fila publicada con el formato antiguo tiene que seguir
  // valiendo en los dos lados, y el sitio pone el icono por posición.
  it('trust-band: mismos iconos y acepta igual el formato antiguo', () => {
    expect(mirror.TRUST_BAND_ICONS).toEqual(TRUST_BAND_ICONS);
    const antiguo = {
      items: [
        { label: 'Envío', title: 'Domicilio en Valledupar', detail: 'Entrega rápida en tu puerta' },
        { label: 'Original', title: 'Productos 100% originales', detail: 'Verificables con código QR' },
        { label: 'Pago', title: 'Pago contra entrega', detail: 'Efectivo, Nequi y Daviplata' }
      ]
    };
    const casos: unknown[] = [
      antiguo,
      { items: antiguo.items.map(item => ({ ...item, icon: 'otro' })) },
      { items: antiguo.items.map(item => ({ ...item, points: [] })) },
      { items: antiguo.items.map(item => ({ ...item, points: ['a', 'b', 'c'] })) },
      { items: antiguo.items.map(item => ({ ...item, highlight: '   ' })) },
      { items: antiguo.items.map(item => ({ ...item, link: { label: 'x', href: '/' } })) }
    ];
    for (const caso of casos) {
      const back = CONTENT_SCHEMAS['trust-band'].schema.safeParse(caso);
      const front = mirror.CONTENT_SCHEMAS['trust-band'].schema.safeParse(caso);
      expect(front.success).toBe(back.success);
    }
    expect(CONTENT_SCHEMAS['trust-band'].schema.safeParse(antiguo).success).toBe(true);
  });

  it('usa el mismo marcador de marcas aliadas', () => {
    expect(mirror.PARTNER_BRANDS_TOKEN).toBe(PARTNER_BRANDS_TOKEN);
  });

  // La pregunta legal +18 vive en código en los dos lados: si el texto o la
  // posición cambian en uno solo, el sitio y el backend dejarían de reconocerla.
  it('fija la misma pregunta legal, en la misma posición, y la quita igual', () => {
    expect(mirror.LEGAL_FAQ_ITEM).toEqual(LEGAL_FAQ_ITEM);
    expect(mirror.LEGAL_FAQ_INDEX).toBe(LEGAL_FAQ_INDEX);
    const casos: unknown[] = [
      { items: [LEGAL_FAQ_ITEM, { question: 'Otra', answer: 'x' }] },
      { items: [{ question: `  ${LEGAL_FAQ_ITEM.question.toUpperCase()}  `, answer: 'cambiada' }] },
      { items: [{ question: 'Es obligatoria la cedula de ciudadania, para recibir el pedido', answer: 'x' }] },
      { items: 'no es lista' },
      null,
      [LEGAL_FAQ_ITEM]
    ];
    for (const caso of casos) {
      expect(mirror.stripLegalFaqItem(caso)).toEqual(stripLegalFaqItem(caso));
    }
    for (const texto of ['¿Qué tal?', '  ¡ÁRBOL!  ', 'a.b,c;d:e']) {
      expect(mirror.comparableQuestion(texto)).toBe(comparableQuestion(texto));
    }
  });

  it('al leer recorta igual una FAQ antigua con más de 11 preguntas', () => {
    expect(mirror.FAQ_MAX_ITEMS).toBe(FAQ_MAX_ITEMS);
    const items = Array.from({ length: 13 }, (_, i) => ({ question: `P${i}`, answer: 'x' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      for (const caso of [{ items }, { items: [...items.slice(0, 11), LEGAL_FAQ_ITEM] }, null]) {
        expect(mirror.normalizeFaqForRead(caso)).toEqual(normalizeFaqForRead(caso));
      }
    } finally {
      warn.mockRestore();
    }
  });
});
