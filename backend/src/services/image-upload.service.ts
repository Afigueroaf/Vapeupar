import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { imageKeys } from '../catalog/image-keys.js';
import { PrismaCatalogRepository } from '../repositories/prisma-catalog.repository.js';
import { CatalogRepository } from '../repositories/catalog.repository.js';

const CONTENT_TYPES = {
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
  'image/png': '.png'
} as const;

export type ImageUploadTarget = 'brand-logo' | 'supplier-image' | 'product-line-image' | 'variant-image';

export class ImageUploadError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'INVALID_UPLOAD' | 'UNAVAILABLE', message: string) {
    super(message);
    this.name = 'ImageUploadError';
  }
}

export interface ImageUploadDeps {
  catalog?: CatalogRepository;
  sign?: (command: PutObjectCommand) => Promise<string>;
  bucket?: string;
  distributionId?: string;
  invalidate?: (command: CreateInvalidationCommand) => Promise<string | undefined>;
}

/** Prefijos válidos del catálogo; nada fuera de aquí se puede invalidar. */
const KEY_PREFIXES = ['marcas/', 'proveedores/', 'productos/'];

/** The server, never the client, chooses the object key and permitted headers. */
export class ImageUploadService {
  private readonly catalog: CatalogRepository;
  private readonly bucket: string;
  private readonly sign: (command: PutObjectCommand) => Promise<string>;
  private readonly distributionId: string;
  private readonly invalidateCommand: (command: CreateInvalidationCommand) => Promise<string | undefined>;

  constructor(deps: ImageUploadDeps = {}) {
    this.catalog = deps.catalog ?? new PrismaCatalogRepository();
    this.bucket = deps.bucket ?? process.env.S3_CATALOG_BUCKET ?? '';
    const client = new S3Client({ region: process.env.AWS_REGION });
    this.sign = deps.sign ?? (command => getSignedUrl(client, command, { expiresIn: 300 }));

    this.distributionId = deps.distributionId ?? process.env.CDN_DISTRIBUTION_ID ?? '';
    const cdn = new CloudFrontClient({ region: process.env.AWS_REGION });
    this.invalidateCommand = deps.invalidate
      ?? (async command => (await cdn.send(command)).Invalidation?.Id);
  }

  /**
   * Invalida una clave en CloudFront.
   *
   * Hace falta porque la clave se deriva de la entidad: reemplazar una imagen
   * no cambia la URL, y la distribución (`CachingOptimized`, TTL de un día)
   * seguiría sirviendo la anterior. También limpia el `403` que quedó cacheado
   * de cuando el objeto no existía.
   *
   * Se invalida **una ruta concreta**, nunca un comodín: `/*` vaciaría la caché
   * del catálogo entero y toda la carga volvería al origen.
   */
  public async invalidate(key: string): Promise<{ invalidationId: string | null; path: string }> {
    if (!KEY_PREFIXES.some(prefix => key.startsWith(prefix)) || key.includes('*') || key.includes('..')) {
      throw new ImageUploadError('INVALID_UPLOAD', 'La clave no pertenece al catálogo');
    }
    if (!this.distributionId) {
      throw new ImageUploadError('UNAVAILABLE', 'La invalidación de caché no está configurada');
    }

    const path = `/${key}`;
    const invalidationId = await this.invalidateCommand(new CreateInvalidationCommand({
      DistributionId: this.distributionId,
      InvalidationBatch: {
        // Una marca de tiempo basta: dos invalidaciones de la misma clave en el
        // mismo milisegundo serían la misma operación, y eso es lo correcto.
        CallerReference: `${key}-${Date.now()}`,
        Paths: { Quantity: 1, Items: [path] }
      }
    }));
    return { invalidationId: invalidationId ?? null, path };
  }

  public async presign(input: { target: ImageUploadTarget; entityId: string; contentType: string; size: number }): Promise<{ key: string; uploadUrl: string; expiresIn: number }> {
    const extension = CONTENT_TYPES[input.contentType as keyof typeof CONTENT_TYPES];
    if (!extension || !Number.isInteger(input.size) || input.size <= 0 || input.size > 5 * 1024 * 1024) {
      throw new ImageUploadError('INVALID_UPLOAD', 'Solo se permiten imágenes WEBP, JPEG o PNG de hasta 5 MB');
    }
    if (!this.bucket) throw new ImageUploadError('UNAVAILABLE', 'La subida de imágenes no está configurada');

    const key = await this.keyFor(input.target, input.entityId, extension);
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: input.contentType, ContentLength: input.size });
    return { key, uploadUrl: await this.sign(command), expiresIn: 300 };
  }

  private async keyFor(target: ImageUploadTarget, entityId: string, extension: string): Promise<string> {
    if (target === 'brand-logo') {
      const brand = await this.catalog.findBrand(entityId);
      if (!brand) throw new ImageUploadError('NOT_FOUND', 'Marca no encontrada');
      return imageKeys.brandLogo(brand.slug, extension);
    }
    if (target === 'supplier-image') {
      const supplier = await this.catalog.findSupplier(entityId);
      if (!supplier) throw new ImageUploadError('NOT_FOUND', 'Proveedor no encontrado');
      return imageKeys.supplier(supplier.id, extension);
    }
    if (target === 'product-line-image') {
      const product = await this.catalog.findProduct(entityId);
      if (!product) throw new ImageUploadError('NOT_FOUND', 'Línea no encontrada');
      return imageKeys.productLine(product.slug, extension);
    }
    const variant = await this.catalog.findVariant(entityId);
    if (!variant) throw new ImageUploadError('NOT_FOUND', 'Variante no encontrada');
    const product = await this.catalog.findProduct(variant.productId);
    if (!product) throw new ImageUploadError('NOT_FOUND', 'Línea no encontrada');
    return imageKeys.variant(product.slug, variant.slug, extension);
  }
}
