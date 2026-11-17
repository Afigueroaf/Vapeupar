import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogAsset, ImageRow, listCatalogAssets, planImages } from './catalog-assets.js';

const ASSETS_DIR = resolve(__dirname, '../../../assets/brands');

function variant(productSlug: string, variantSlug: string): CatalogAsset {
  return {
    target: 'variant', productSlug, variantSlug, path: `/x/${variantSlug}.webp`,
    key: `productos/${productSlug}/${variantSlug}.webp`, contentType: 'image/webp'
  };
}

function row(target: ImageRow['target'], ref: string, imageKey: string | null): ImageRow {
  return { target, id: `${target}:${ref}`, ref, imageKey };
}

describe('listCatalogAssets (assets/brands real)', () => {
  const assets = listCatalogAssets(ASSETS_DIR);

  it('incluye logo, imagen de línea y variantes con las claves de image-keys', () => {
    const keys = assets.map(a => a.key);
    expect(keys).toContain('marcas/lifepod/logo.svg');
    expect(keys).toContain('productos/lifepod-eco-3/linea.webp');
    expect(keys).toContain('productos/lifepod-eco-3/blackberry-huls.webp');
    expect(keys).toContain('productos/lifepod-one/electric-blue.webp');
  });

  it('no repite claves y pone el tipo de contenido por extensión', () => {
    expect(new Set(assets.map(a => a.key)).size).toBe(assets.length);
    expect(assets.find(a => a.key === 'marcas/lifepod/logo.svg')?.contentType).toBe('image/svg+xml');
    expect(assets.filter(a => a.key.endsWith('.webp')).every(a => a.contentType === 'image/webp')).toBe(true);
  });
});

describe('planImages', () => {
  const assets = [variant('linea', 'mango'), variant('linea', 'menta')];

  it('sube solo lo que no está en el bucket', () => {
    const plan = planImages(assets, new Set(['productos/linea/mango.webp']), []);
    expect(plan.uploads.map(a => a.key)).toEqual(['productos/linea/menta.webp']);
  });

  it('rellena solo filas sin imagen, con la clave canónica', () => {
    const plan = planImages(assets, new Set(), [
      row('variant', 'linea/mango', null),
      row('variant', 'linea/menta', 'productos/linea/menta-m3k9x2ab.webp')
    ]);
    expect(plan.backfill).toEqual([{ row: row('variant', 'linea/mango', null), key: 'productos/linea/mango.webp' }]);
  });

  it('no toca una clave versionada de la consola, pero la señala si falta en el bucket', () => {
    const consola = row('variant', 'linea/menta', 'productos/linea/menta-m3k9x2ab.webp');
    const plan = planImages(assets, new Set(), [consola]);
    expect(plan.backfill).toEqual([]);
    expect(plan.broken).toEqual([consola]);
  });

  it('una clave canónica que esta carga va a subir no cuenta como rota', () => {
    const plan = planImages(assets, new Set(), [row('variant', 'linea/mango', 'productos/linea/mango.webp')]);
    expect(plan.broken).toEqual([]);
    expect(plan.uploads).toHaveLength(2);
  });

  it('ignora filas sin archivo en assets (creadas desde la consola)', () => {
    const plan = planImages(assets, new Set(), [row('variant', 'otra/uva', null)]);
    expect(plan.backfill).toEqual([]);
  });
});
