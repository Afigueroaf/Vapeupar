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
    brand: { name: 'LifePod' },
    variants: [],
    ...overrides
  };
}

describe('toProduct', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('traduce la categoría del enum de Prisma al contrato de la API', () => {
    expect(toProduct(row()).category).toBe('pod-systems');
    expect(toProduct(row({ category: 'coils_accessories' })).category).toBe('coils-accessories');
  });

  it('suma el stock de las variantes activas e ignora cachés negativas', () => {
    const product = toProduct(row({ variants: [{ stockCache: 3 }, { stockCache: 4 }, { stockCache: -2 }] }));
    expect(product.stock).toBe(7);
    expect(product.inStock).toBe(true);
    expect(toProduct(row()).inStock).toBe(false);
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
