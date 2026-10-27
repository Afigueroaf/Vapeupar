import { beforeEach, describe, expect, it } from 'vitest';
import { CatalogError, CatalogService, readiness } from './catalog.service.js';
import { InMemoryCatalogRepository } from '../repositories/in-memory-catalog.repository.js';

/**
 * Reglas del catálogo (plan A4.2, pantalla A5.3). Lo que se prueba aquí son las
 * que el esquema de la base documenta pero no puede imponer: qué falta para
 * publicar, qué es inmutable, qué tipo admite una línea y qué queda auditado.
 */

const AUTHOR = { userId: '019299a4-0000-7000-8000-000000000001' };

let repo: InMemoryCatalogRepository;
let service: CatalogService;

beforeEach(() => {
  repo = new InMemoryCatalogRepository();
  service = new CatalogService(repo);
});

/** Línea lista para publicar salvo lo que el test quite. */
async function publishable(): Promise<{ brandId: string; productId: string; variantId: string }> {
  const brand = repo.seedBrand({ name: 'LifePod', slug: 'lifepod' });
  const product = repo.seedProduct({
    brandId: brand.id, slug: 'eco-pro', name: 'ECO PRO', price: 45_000, imageKey: 'lifepod/eco-pro.webp'
  });
  const variant = repo.seedVariant({ productId: product.id, name: 'Mango Ice', slug: 'mango-ice' });
  return { brandId: brand.id, productId: product.id, variantId: variant.id };
}

async function expectError(work: Promise<unknown>, code: string): Promise<CatalogError> {
  const error = await work.then(() => undefined, (e: unknown) => e);
  expect(error, 'se esperaba un CatalogError').toBeInstanceOf(CatalogError);
  expect((error as CatalogError).code).toBe(code);
  return error as CatalogError;
}

describe('marcas', () => {
  it('crea la marca y la deja auditada con su autor', async () => {
    const brand = await service.createBrand({ name: 'LifePod', slug: 'lifepod' }, AUTHOR);

    expect(brand).toMatchObject({ name: 'LifePod', slug: 'lifepod', active: true, isPartner: false });
    expect(repo.audits).toHaveLength(1);
    expect(repo.audits[0]).toMatchObject({ userId: AUTHOR.userId, entity: 'brand', action: 'brand.create' });
  });

  it('rechaza un slug repetido', async () => {
    await service.createBrand({ name: 'LifePod', slug: 'lifepod' }, AUTHOR);
    await expectError(service.createBrand({ name: 'Otra', slug: 'lifepod' }, AUTHOR), 'DUPLICATE_SLUG');
  });

  it('normaliza el slug y rechaza el que no sirve para una URL', async () => {
    const brand = await service.createBrand({ name: 'LifePod', slug: '  LifePod-CO  ' }, AUTHOR);
    expect(brand.slug).toBe('lifepod-co');
    await expectError(service.createBrand({ name: 'X', slug: 'con acentós' }, AUTHOR), 'VALIDATION');
  });

  it('un PATCH solo escribe los campos que trae', async () => {
    const seeded = repo.seedBrand({ name: 'LifePod', slug: 'lifepod', isPartner: true, sortOrder: 3 });

    const brand = await service.updateBrand(seeded.id, { active: false }, AUTHOR);

    expect(brand).toMatchObject({ active: false, isPartner: true, sortOrder: 3 });
    expect(repo.audits[0]).toMatchObject({ action: 'brand.deactivate' });
    // Antes y después recortados a lo que cambió: el registro queda legible.
    expect(repo.audits[0]?.before).toEqual({ active: true });
    expect(repo.audits[0]?.after).toEqual({ active: false });
  });

  it('no audita un PATCH que no cambia nada', async () => {
    const seeded = repo.seedBrand({ name: 'LifePod', slug: 'lifepod' });
    await service.updateBrand(seeded.id, { name: 'LifePod' }, AUTHOR);
    expect(repo.audits).toHaveLength(0);
  });

  it('rechaza un PATCH vacío y una marca inexistente', async () => {
    const seeded = repo.seedBrand();
    await expectError(service.updateBrand(seeded.id, {}, AUTHOR), 'VALIDATION');
    await expectError(service.updateBrand(AUTHOR.userId, { active: false }, AUTHOR), 'NOT_FOUND');
  });
});

describe('proveedores', () => {
  it('guarda el vínculo con marcas y lo deja en la auditoría', async () => {
    const brand = repo.seedBrand({ slug: 'lifepod' });

    const supplier = await service.createSupplier(
      { name: 'Distribuidora Andina', whatsapp: '3001234567', brandIds: [brand.id] },
      AUTHOR
    );

    expect(await repo.findSupplier(supplier.id)).toMatchObject({
      name: 'Distribuidora Andina',
      brands: [{ id: brand.id, name: 'LifePod' }]
    });
    expect(repo.audits[0]).toMatchObject({ entity: 'supplier', action: 'supplier.create' });
  });

  it('rechaza una marca que no existe', async () => {
    await expectError(
      service.createSupplier({ name: 'X', brandIds: [AUTHOR.userId] }, AUTHOR),
      'VALIDATION'
    );
    // La transacción se revirtió completa: ni proveedor ni registro.
    expect((await repo.listSuppliers({ limit: 10, offset: 0 })).total).toBe(0);
    expect(repo.audits).toHaveLength(0);
  });

  it('reemplaza la lista de marcas completa', async () => {
    const uno = repo.seedBrand({ slug: 'uno', name: 'Uno' });
    const dos = repo.seedBrand({ slug: 'dos', name: 'Dos' });
    const supplier = await service.createSupplier({ name: 'Andina', brandIds: [uno.id] }, AUTHOR);

    await service.updateSupplier(supplier.id, { brandIds: [dos.id] }, AUTHOR);

    expect((await repo.findSupplier(supplier.id))?.brands).toEqual([{ id: dos.id, name: 'Dos' }]);
  });
});

describe('líneas de producto', () => {
  it('crea en borrador con los valores por defecto', async () => {
    const brand = repo.seedBrand();

    const product = await service.createProduct(
      { slug: 'eco-pro', brandId: brand.id, category: 'disposables', name: 'ECO PRO' },
      AUTHOR
    );

    expect(product).toMatchObject({ status: 'draft', price: null, specs: {}, tags: [], brandName: 'LifePod' });
    expect(readiness(product)).toEqual({ canPublish: false, missing: ['price', 'imageKey', 'activeVariant'] });
  });

  it('dice qué falta para publicar en vez de solo negarse', async () => {
    const brand = repo.seedBrand();

    const error = await expectError(service.createProduct(
      { slug: 'eco-pro', brandId: brand.id, category: 'disposables', name: 'ECO PRO', status: 'published' },
      AUTHOR
    ), 'NOT_PUBLISHABLE');

    expect(error.details).toEqual(['price', 'imageKey', 'activeVariant']);
    // Y no quedó creada a medias.
    expect((await repo.listProducts({ limit: 10, offset: 0 })).total).toBe(0);
    expect(repo.audits).toHaveLength(0);
  });

  it('publica cuando están el precio, la imagen y una variante activa', async () => {
    const { productId } = await publishable();

    const product = await service.updateProduct(productId, { status: 'published' }, AUTHOR);

    expect(product.status).toBe('published');
    expect(repo.audits[0]).toMatchObject({ entity: 'product', action: 'product.publish' });
    expect(repo.audits[0]?.before).toEqual({ status: 'draft' });
  });

  it('no publica una línea sin variante activa', async () => {
    const brand = repo.seedBrand();
    const product = repo.seedProduct({ brandId: brand.id, price: 45_000, imageKey: 'k.webp' });
    repo.seedVariant({ productId: product.id, active: false });

    const error = await expectError(service.updateProduct(product.id, { status: 'published' }, AUTHOR), 'NOT_PUBLISHABLE');
    expect(error.details).toEqual(['activeVariant']);
    expect((await repo.findProduct(product.id))?.status).toBe('draft');
  });

  it('acepta publicar poniendo el precio en la misma petición', async () => {
    const brand = repo.seedBrand();
    const product = repo.seedProduct({ brandId: brand.id, imageKey: 'k.webp' });
    repo.seedVariant({ productId: product.id });

    const published = await service.updateProduct(product.id, { status: 'published', price: 45_000 }, AUTHOR);

    expect(published).toMatchObject({ status: 'published', price: 45_000 });
    // El estado manda sobre el precio al nombrar el cambio, y el registro lleva los dos.
    expect(repo.audits[0]?.action).toBe('product.publish');
    expect(repo.audits[0]?.after).toEqual({ status: 'published', price: 45_000 });
  });

  it('nombra el cambio de precio como tal', async () => {
    const { productId } = await publishable();

    await service.updateProduct(productId, { price: 49_000 }, AUTHOR);

    expect(repo.audits[0]).toMatchObject({ action: 'product.price' });
    expect(repo.audits[0]?.before).toEqual({ price: 45_000 });
  });

  it('exige que el precio anterior sea mayor que el actual', async () => {
    const { productId } = await publishable();

    await expectError(service.updateProduct(productId, { compareAtPrice: 40_000 }, AUTHOR), 'VALIDATION');
    await expectError(service.updateProduct(productId, { price: null, compareAtPrice: 50_000 }, AUTHOR), 'VALIDATION');
    await expect(service.updateProduct(productId, { compareAtPrice: 60_000 }, AUTHOR)).resolves.toMatchObject({
      compareAtPrice: 60_000
    });
  });

  it('no deja renombrar una línea publicada, pero sí un borrador', async () => {
    const { productId } = await publishable();
    await service.updateProduct(productId, { status: 'published' }, AUTHOR);

    await expectError(service.updateProduct(productId, { slug: 'eco-pro-2' }, AUTHOR), 'IMMUTABLE_SLUG');

    await service.updateProduct(productId, { status: 'draft' }, AUTHOR);
    await expect(service.updateProduct(productId, { slug: 'eco-pro-2' }, AUTHOR)).resolves.toMatchObject({
      slug: 'eco-pro-2'
    });
  });

  it('rechaza una marca inexistente', async () => {
    await expectError(service.createProduct(
      { slug: 'eco-pro', brandId: AUTHOR.userId, category: 'disposables', name: 'ECO PRO' },
      AUTHOR
    ), 'VALIDATION');
  });
});

describe('variantes', () => {
  it('crea la variante con stock en cero y la audita', async () => {
    const { productId } = await publishable();

    const variant = await service.createVariant(productId, { kind: 'flavor', name: 'Uva', slug: 'uva' }, AUTHOR);

    expect(variant).toMatchObject({ productId, name: 'Uva', active: true, stock: 0 });
    expect(repo.audits[0]).toMatchObject({ entity: 'variant', action: 'variant.create' });
  });

  it('no mezcla sabores y colores en la misma línea', async () => {
    const { productId } = await publishable();
    await expectError(
      service.createVariant(productId, { kind: 'color', name: 'Negro', slug: 'negro' }, AUTHOR),
      'CONFLICT'
    );
  });

  it('el slug es único dentro de la línea, no en todo el catálogo', async () => {
    const { brandId, productId } = await publishable();
    const otra = repo.seedProduct({ brandId, slug: 'eco-3', name: 'ECO 3' });

    await expectError(
      service.createVariant(productId, { kind: 'flavor', name: 'Mango', slug: 'mango-ice' }, AUTHOR),
      'DUPLICATE_SLUG'
    );
    await expect(
      service.createVariant(otra.id, { kind: 'flavor', name: 'Mango', slug: 'mango-ice' }, AUTHOR)
    ).resolves.toMatchObject({ slug: 'mango-ice' });
  });

  it('no deja a una línea publicada sin variantes activas', async () => {
    const { productId, variantId } = await publishable();
    await service.updateProduct(productId, { status: 'published' }, AUTHOR);

    await expectError(service.updateVariant(productId, variantId, { active: false }, AUTHOR), 'CONFLICT');

    // En borrador sí: la línea no está a la vista de nadie.
    await service.updateProduct(productId, { status: 'draft' }, AUTHOR);
    await expect(service.updateVariant(productId, variantId, { active: false }, AUTHOR))
      .resolves.toMatchObject({ active: false });
  });

  it('exige que la variante pertenezca a la línea de la ruta', async () => {
    const { brandId, variantId } = await publishable();
    const otra = repo.seedProduct({ brandId, slug: 'eco-3', name: 'ECO 3' });

    await expectError(service.updateVariant(otra.id, variantId, { name: 'Otro' }, AUTHOR), 'NOT_FOUND');
  });

  it('no permite escribir el stock: su dueño es StockService', async () => {
    const { productId, variantId } = await publishable();

    // `stock` no está en el esquema, así que se descarta y el PATCH queda vacío.
    const error = await expectError(
      service.updateVariant(productId, variantId, { stock: 999 }, AUTHOR),
      'VALIDATION'
    );
    expect(error.message).toContain('actualizar');
    expect((await repo.findProduct(productId))?.variants[0]?.stock).toBe(0);
  });
});
