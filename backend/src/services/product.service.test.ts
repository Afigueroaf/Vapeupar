import { describe, it, expect } from 'vitest';
import { ProductService } from './product.service.js';
import { InMemoryProductRepository } from '../repositories/in-memory-product.repository.js';
import { Product } from '../types/product.types.js';

// Fixture propio: cambiar el catálogo real (semilla o mocks) no afecta la suite.
function product(overrides: Partial<Product> & Pick<Product, 'id' | 'slug' | 'category' | 'price'>): Product {
  return {
    name: overrides.slug,
    brand: 'Marca Test',
    brandSlug: overrides.brand ? overrides.brand.toLowerCase() : 'marca-test',
    description: '',
    shortDescription: '',
    inStock: true,
    stock: 10,
    imageUrl: '',
    featured: false,
    showcase: false,
    specs: { nicotineStrength: '20mg (2%)' },
    tags: [],
    variants: [],
    ...overrides
  };
}

const FIXTURE: Product[] = [
  product({ id: 'p1', slug: 'alfa-10k-sandia', name: 'Alfa 10K Sandía', category: 'disposables', price: 65000,
    brand: 'Alfa', featured: true, specs: { nicotineStrength: '50mg (5%)', puffCount: 10000 } }),
  product({ id: 'p2', slug: 'beta-pod-kit', name: 'Beta Pod Kit', category: 'pod-systems', price: 135000,
    brand: 'Beta', showcase: true, specs: { nicotineStrength: 'Variable' } }),
  product({ id: 'p3', slug: 'gamma-salt-mango', name: 'Gamma Salt', category: 'salt-nic', price: 48000,
    brand: 'Gamma', specs: { nicotineStrength: '20mg (2%)', flavorProfile: 'Mango maduro' } }),
  product({ id: 'p4', slug: 'delta-6k-menta', name: 'Delta 6K Menta', category: 'disposables', price: 52000,
    brand: 'Delta', specs: { nicotineStrength: '50mg (5%)', puffCount: 6000 }, tags: ['menta'] }),
  product({ id: 'p5', slug: 'epsilon-coil', name: 'Epsilon Coil', category: 'coils-accessories', price: 25000,
    brand: 'Epsilon', specs: { nicotineStrength: '0mg' } })
];

const service = new ProductService(new InMemoryProductRepository(FIXTURE));

describe('ProductService', () => {
  it('pagina con valores por defecto', async () => {
    const result = await service.getAll();
    expect(result.total).toBe(5);
    expect(result.items).toHaveLength(5);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('filtra por categoría', async () => {
    const result = await service.getAll({ category: 'disposables' });
    expect(result.items.every(p => p.category === 'disposables')).toBe(true);
    expect(result.total).toBe(2);
  });

  it('filtra por marca usando el slug, aunque el nombre sea distinto', async () => {
    const repo = new InMemoryProductRepository([
      product({ id: 'x1', slug: 'x1', category: 'disposables', price: 1, brand: 'Lost Mary', brandSlug: 'lost-mary' }),
      product({ id: 'x2', slug: 'x2', category: 'disposables', price: 1, brand: 'Otra', brandSlug: 'otra' })
    ]);
    const result = await new ProductService(repo).getAll({ brand: 'lost-mary' });
    expect(result.items.map(p => p.id)).toEqual(['x1']);
  });

  it('filtra por marca sin distinguir mayúsculas', async () => {
    const result = await service.getAll({ brand: 'beta' });
    expect(result.items.map(p => p.id)).toEqual(['p2']);
  });

  it('filtra por concentración de nicotina', async () => {
    const result = await service.getAll({ nicotine: '50mg' });
    expect(result.items.map(p => p.id)).toEqual(['p1', 'p4']);
  });

  it('filtra por destacados', async () => {
    const result = await service.getAll({ featured: true });
    expect(result.items.map(p => p.id)).toEqual(['p1']);
  });

  // `showcase` es la vitrina 3D de la portada y `featured` el merchandising del
  // catalogo: columnas distintas. p1 esta destacada sin estar en la vitrina y
  // p2 al contrario, que es justo lo que no se podia expresar antes.
  it('filtra por la vitrina, con independencia de los destacados', async () => {
    expect((await service.getAll({ showcase: true })).items.map(p => p.id)).toEqual(['p2']);
    expect((await service.getAll({ showcase: false })).items.map(p => p.id))
      .toEqual(['p1', 'p3', 'p4', 'p5']);
  });

  it('busca en nombre, perfil de sabor y etiquetas', async () => {
    expect((await service.getAll({ search: 'mango' })).items.map(p => p.id)).toEqual(['p3']);
    expect((await service.getAll({ search: 'MENTA' })).items.map(p => p.id)).toEqual(['p4']);
    expect((await service.getAll({ search: 'pod kit' })).items.map(p => p.id)).toEqual(['p2']);
  });

  it('encuentra una línea por el nombre de uno de sus sabores', async () => {
    const lines = [
      product({ id: 'l1', name: 'Gamma 6K', variants: [
        { id: 'v1', kind: 'flavor', name: 'Lychee Ice', slug: 'lychee-ice', imageUrl: '', inStock: true, stock: 2 }
      ] }),
      product({ id: 'l2', name: 'Delta 6K' })
    ];
    const byFlavor = new ProductService(new InMemoryProductRepository(lines));
    expect((await byFlavor.getAll({ search: 'lychee' })).items.map(p => p.id)).toEqual(['l1']);
  });

  it('filtra por rango de precio inclusivo', async () => {
    const result = await service.getAll({ minPrice: 48000, maxPrice: 65000 });
    expect(result.items.map(p => p.id).sort()).toEqual(['p1', 'p3', 'p4']);
  });

  it('ordena por precio ascendente', async () => {
    const result = await service.getAll({ sortBy: 'price', sortOrder: 'asc' });
    for (let i = 0; i < result.items.length - 1; i++) {
      expect(result.items[i]!.price).toBeLessThanOrEqual(result.items[i + 1]!.price);
    }
  });

  it('ordena por precio descendente', async () => {
    const result = await service.getAll({ sortBy: 'price', sortOrder: 'desc' });
    for (let i = 0; i < result.items.length - 1; i++) {
      expect(result.items[i]!.price).toBeGreaterThanOrEqual(result.items[i + 1]!.price);
    }
  });

  it('ordena por puffs con los productos sin dato al final, en ambos sentidos', async () => {
    const asc = await service.getAll({ sortBy: 'puffCount', sortOrder: 'asc' });
    expect(asc.items.slice(0, 2).map(p => p.id)).toEqual(['p4', 'p1']);
    const desc = await service.getAll({ sortBy: 'puffCount', sortOrder: 'desc' });
    expect(desc.items.slice(0, 2).map(p => p.id)).toEqual(['p1', 'p4']);
    expect(desc.items.slice(2).every(p => p.specs.puffCount === undefined)).toBe(true);
  });

  it('pagina con un límite pequeño', async () => {
    const page1 = await service.getAll({ limit: 2, page: 1 });
    const page3 = await service.getAll({ limit: 2, page: 3 });
    expect(page1.items).toHaveLength(2);
    expect(page1.totalPages).toBe(3);
    expect(page3.items.map(p => p.id)).toEqual(['p5']);
  });

  it('no altera el repositorio al ordenar', async () => {
    await service.getAll({ sortBy: 'price', sortOrder: 'desc' });
    expect((await service.getAll()).items.map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('encuentra por slug e id', async () => {
    expect((await service.getBySlug('beta-pod-kit'))?.id).toBe('p2');
    expect((await service.getById('p3'))?.slug).toBe('gamma-salt-mango');
    expect(await service.getBySlug('no-existe')).toBeUndefined();
    expect(await service.getById('no-existe')).toBeUndefined();
  });

  it('lista las 6 categorías con su conteo, incluidas las vacías', async () => {
    const categories = await service.getCategories();
    expect(categories.map(c => c.id)).toEqual([
      'disposables', 'pod-systems', 'salt-nic', 'freebase-liquids', 'mods-tanks', 'coils-accessories'
    ]);
    expect(categories.find(c => c.id === 'disposables')).toEqual({ id: 'disposables', name: 'Desechables (Puffs)', count: 2 });
    expect(categories.find(c => c.id === 'freebase-liquids')?.count).toBe(0);
  });
});
