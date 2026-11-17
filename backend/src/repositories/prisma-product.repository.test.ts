import { afterEach, describe, it, expect, vi } from 'vitest';
import { toProduct, ProductRow } from './prisma-product.repository.js';

function row(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: '01a17b12-10e2-74c8-9aac-a45f7120fe7a',
    slug: 'lifepod-one',
    brandId: '01a17b11-0000-7000-8000-000000000000',
    category: 'pod_systems',
    name: 'LifePod ONE',
    description: '',
    shortDescription: '',
    specs: {},
    price: 90000,
    compareAtPrice: null,
    status: 'published',
    imageKey: 'productos/lifepod-one/linea.webp',
    featured: false,
    isNewArrival: false,
    isBestSeller: false,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    brand: { name: 'LifePod', slug: 'lifepod' },
    variants: [],
    ...overrides
  };
}

function variant(overrides: Partial<ProductRow['variants'][number]> = {}): ProductRow['variants'][number] {
  return { id: 'v1', kind: 'flavor', name: 'Mango', slug: 'mango', imageKey: null, stockCache: 0, ...overrides };
}

describe('toProduct', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('expone el slug de la marca como identificador estable', () => {
    expect(toProduct(row())).toMatchObject({ brand: 'LifePod', brandSlug: 'lifepod' });
  });

  it('traduce la categoría del enum de Prisma al contrato de la API', () => {
    expect(toProduct(row()).category).toBe('pod-systems');
    expect(toProduct(row({ category: 'coils_accessories' })).category).toBe('coils-accessories');
  });

  it('suma el stock de las variantes activas e ignora cachés negativas', () => {
    const product = toProduct(row({ variants: [variant({ stockCache: 3 }), variant({ stockCache: 4 }), variant({ stockCache: -2 })] }));
    expect(product.stock).toBe(7);
    expect(product.inStock).toBe(true);
    expect(toProduct(row()).inStock).toBe(false);
  });

  it('expone cada variante con su disponibilidad, sin stock negativo', () => {
    const product = toProduct(row({ variants: [variant({ stockCache: 5 }), variant({ id: 'v2', name: 'Uva', slug: 'uva', stockCache: -1 })] }));
    expect(product.variants).toEqual([
      { id: 'v1', kind: 'flavor', name: 'Mango', slug: 'mango', imageUrl: '', inStock: true, stock: 5 },
      { id: 'v2', kind: 'flavor', name: 'Uva', slug: 'uva', imageUrl: '', inStock: false, stock: 0 }
    ]);
  });

  it('compone la URL de imagen con CDN_DOMAIN y la deja vacía sin él', () => {
    vi.stubEnv('CDN_DOMAIN', 'cdn.example');
    expect(toProduct(row()).imageUrl).toBe('https://cdn.example/productos/lifepod-one/linea.webp');
    expect(toProduct(row({ imageKey: null })).imageUrl).toBe('');
    vi.stubEnv('CDN_DOMAIN', '');
    expect(toProduct(row()).imageUrl).toBe('');
  });

  it('omite compareAtPrice cuando es nulo', () => {
    expect(toProduct(row())).not.toHaveProperty('compareAtPrice');
    expect(toProduct(row({ compareAtPrice: 99000 })).compareAtPrice).toBe(99000);
  });

  it('toma de specs solo lo que encaja con el contrato', () => {
    expect(toProduct(row({ specs: { puffCount: 6000, nicotineStrength: '50mg', extra: 'x', rechargeable: 'si' } })).specs)
      .toEqual({ puffCount: 6000, nicotineStrength: '50mg' });
    expect(toProduct(row({ specs: [1, 2] })).specs).toEqual({ nicotineStrength: '' });
  });
});
