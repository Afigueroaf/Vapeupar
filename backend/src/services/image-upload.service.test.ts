import { CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
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
    const service = new ImageUploadService({ catalog, bucket: 'catalog', sign, now: () => 36 ** 7 });

    await expect(service.presign({
      target: 'variant-image', entityId: variant.id, contentType: 'image/webp', size: 1024
    })).resolves.toMatchObject({ key: 'productos/eco-pro/mango-ice-10000000.webp', uploadUrl: 'https://upload.example/signed' });
    await expect(service.presign({
      target: 'variant-image', entityId: variant.id, contentType: 'image/gif', size: 1024
    })).rejects.toBeInstanceOf(ImageUploadError);
    await expect(service.presign({
      target: 'variant-image', entityId: variant.id, contentType: 'image/png', size: 5 * 1024 * 1024 + 1
    })).rejects.toBeInstanceOf(ImageUploadError);
  });

  it('usa la convención de la semilla con la versión de la carga como sufijo', async () => {
    const catalog = new InMemoryCatalogRepository();
    const brand = catalog.seedBrand({ slug: 'lifepod' });
    const product = catalog.seedProduct({ brandId: brand.id, slug: 'eco-pro' });
    const supplier = catalog.seedSupplier();
    const sign = vi.fn(async () => 'https://upload.example/signed');
    const service = new ImageUploadService({ catalog, bucket: 'catalog', sign, now: () => 36 ** 7 });

    const claves = await Promise.all([
      service.presign({ target: 'brand-logo', entityId: brand.id, contentType: 'image/webp', size: 10 }),
      service.presign({ target: 'product-line-image', entityId: product.id, contentType: 'image/webp', size: 10 }),
      service.presign({ target: 'supplier-image', entityId: supplier.id, contentType: 'image/jpeg', size: 10 })
    ]);

    expect(claves.map(c => c.key)).toEqual([
      'marcas/lifepod/logo-10000000.webp',
      'productos/eco-pro/linea-10000000.webp',
      `proveedores/${supplier.id}/logo-10000000.jpg`
    ]);
  });

  it('cada carga de la misma imagen sale con una clave distinta', async () => {
    const catalog = new InMemoryCatalogRepository();
    const brand = catalog.seedBrand();
    const product = catalog.seedProduct({ brandId: brand.id, slug: 'eco-pro' });
    const variant = catalog.seedVariant({ productId: product.id, slug: 'mango-ice' });
    let clock = 1_700_000_000_000;
    const service = new ImageUploadService({
      catalog, bucket: 'catalog', sign: async () => 'https://upload.example/signed', now: () => clock++
    });

    const input = { target: 'variant-image' as const, entityId: variant.id, contentType: 'image/webp', size: 10 };
    const first = await service.presign(input);
    const second = await service.presign(input);

    expect(first.key).not.toBe(second.key);
    expect(first.key).toMatch(/^productos\/eco-pro\/mango-ice-[0-9a-z]{8}\.webp$/);
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
  it('borra solo objetos del catálogo, y en su bucket', async () => {
    const sent: DeleteObjectCommand[] = [];
    const service = new ImageUploadService({
      catalog: new InMemoryCatalogRepository(), bucket: 'catalog', remove: async command => { sent.push(command); }
    });

    await service.remove('productos/eco-pro/mango-ice.webp');
    expect(sent.map(c => c.input)).toEqual([{ Bucket: 'catalog', Key: 'productos/eco-pro/mango-ice.webp' }]);

    for (const key of ['otra-cosa/x.webp', 'productos/*', 'productos/../config.json', '']) {
      await expect(service.remove(key)).rejects.toBeInstanceOf(ImageUploadError);
    }
    expect(sent).toHaveLength(1);
  });
});
