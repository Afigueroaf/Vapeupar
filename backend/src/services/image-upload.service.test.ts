import { CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryCatalogRepository } from '../repositories/in-memory-catalog.repository.js';
import { ImageUploadError, ImageUploadService } from './image-upload.service.js';

describe('ImageUploadService', () => {
  it('deriva la clave de variante desde la entidad y firma solo el MIME permitido', async () => {
    const catalog = new InMemoryCatalogRepository();
    const brand = catalog.seedBrand();
    const product = catalog.seedProduct({ brandId: brand.id, slug: 'eco-pro' });
    const variant = catalog.seedVariant({ productId: product.id, slug: 'mango-ice' });
    const sign = vi.fn(async () => 'https://upload.example/signed');
    const service = new ImageUploadService({ catalog, bucket: 'catalog', sign });

    await expect(service.presign({
      target: 'variant-image', entityId: variant.id, contentType: 'image/webp', size: 1024
    })).resolves.toMatchObject({ key: 'productos/eco-pro/mango-ice.webp', uploadUrl: 'https://upload.example/signed' });
    await expect(service.presign({
      target: 'variant-image', entityId: variant.id, contentType: 'image/gif', size: 1024
    })).rejects.toBeInstanceOf(ImageUploadError);
    await expect(service.presign({
      target: 'variant-image', entityId: variant.id, contentType: 'image/png', size: 5 * 1024 * 1024 + 1
    })).rejects.toBeInstanceOf(ImageUploadError);
  });

  it('usa una sola convención de claves, la misma que la semilla', async () => {
    const catalog = new InMemoryCatalogRepository();
    const brand = catalog.seedBrand({ slug: 'lifepod' });
    const product = catalog.seedProduct({ brandId: brand.id, slug: 'eco-pro' });
    const supplier = catalog.seedSupplier();
    const sign = vi.fn(async () => 'https://upload.example/signed');
    const service = new ImageUploadService({ catalog, bucket: 'catalog', sign });

    const claves = await Promise.all([
      service.presign({ target: 'brand-logo', entityId: brand.id, contentType: 'image/webp', size: 10 }),
      service.presign({ target: 'product-line-image', entityId: product.id, contentType: 'image/webp', size: 10 }),
      service.presign({ target: 'supplier-image', entityId: supplier.id, contentType: 'image/jpeg', size: 10 })
    ]);

    expect(claves.map(c => c.key)).toEqual([
      'marcas/lifepod/logo.webp',
      'productos/eco-pro/linea.webp',
      `proveedores/${supplier.id}/logo.jpg`
    ]);
  });

  it('invalida una ruta concreta del catálogo, no un comodín', async () => {
    const catalog = new InMemoryCatalogRepository();
    const enviadas: CreateInvalidationCommand[] = [];
    const service = new ImageUploadService({
      catalog, bucket: 'catalog', distributionId: 'E123',
      invalidate: async command => { enviadas.push(command); return 'I123'; }
    });

    await expect(service.invalidate('productos/eco-pro/mango-ice.webp'))
      .resolves.toEqual({ invalidationId: 'I123', path: '/productos/eco-pro/mango-ice.webp' });
    expect(enviadas[0].input.DistributionId).toBe('E123');
    expect(enviadas[0].input.InvalidationBatch?.Paths)
      .toMatchObject({ Quantity: 1, Items: ['/productos/eco-pro/mango-ice.webp'] });

    // Nada fuera del catálogo, y el comodín jamás: vaciaría la caché entera.
    for (const clave of ['otra-cosa/x.webp', 'productos/*', '*', 'productos/../secreto.webp']) {
      await expect(service.invalidate(clave)).rejects.toMatchObject({ code: 'INVALID_UPLOAD' });
    }
    expect(enviadas).toHaveLength(1);
  });

  it('sin distribución configurada lo dice en vez de fallar en silencio', async () => {
    const invalidate = vi.fn(async () => 'I123');
    const service = new ImageUploadService({
      catalog: new InMemoryCatalogRepository(), bucket: 'catalog', distributionId: '', invalidate
    });

    await expect(service.invalidate('productos/eco-pro/mango-ice.webp'))
      .rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('no firma nada si la entidad no existe ni si falta el bucket', async () => {
    const catalog = new InMemoryCatalogRepository();
    const sign = vi.fn(async () => 'https://upload.example/signed');

    const service = new ImageUploadService({ catalog, bucket: 'catalog', sign });
    await expect(service.presign({
      target: 'variant-image', entityId: '019299a4-0000-7000-8000-0000000000ff', contentType: 'image/webp', size: 10
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const brand = catalog.seedBrand();
    const sinBucket = new ImageUploadService({ catalog, bucket: '', sign });
    await expect(sinBucket.presign({
      target: 'brand-logo', entityId: brand.id, contentType: 'image/webp', size: 10
    })).rejects.toMatchObject({ code: 'UNAVAILABLE' });

    expect(sign).not.toHaveBeenCalled();
  });
});
