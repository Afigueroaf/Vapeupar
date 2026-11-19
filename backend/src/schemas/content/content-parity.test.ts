import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CONTENT_KEYS, CONTENT_SCHEMAS, PARTNER_BRANDS_TOKEN } from './index.js';
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

  it('usa el mismo marcador de marcas aliadas', () => {
    expect(mirror.PARTNER_BRANDS_TOKEN).toBe(PARTNER_BRANDS_TOKEN);
  });
});
