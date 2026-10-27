import { z } from 'zod';
import { Author, JsonValue, recordAudit } from './audit.service.js';
import {
  AdminProductDetail, AdminVariantRow, BrandRow, CatalogRepository, CatalogTransaction, DuplicateSlugError,
  MissingReferenceError, NewProduct, ProductPatch, SupplierRow
} from '../repositories/catalog.repository.js';
import { PrismaCatalogRepository } from '../repositories/prisma-catalog.repository.js';
import {
  BrandBodySchema, BrandPatchSchema, ProductBodySchema, ProductPatchSchema, SupplierBodySchema,
  SupplierPatchSchema, VariantBodySchema, VariantPatchSchema
} from '../schemas/admin/catalog.schema.js';

/**
 * Único punto autorizado a escribir el catálogo desde la consola (plan A4.2,
 * pantallas A5.2 y A5.3). Aquí viven las reglas que el esquema de la base
 * documenta pero no puede imponer:
 *
 * - **El precio solo se escribe aquí** (riesgo registrado en el plan: nadie
 *   edita precio ni stock por fuera de `src/services/`).
 * - Para publicar una línea hacen falta precio, imagen y al menos una variante
 *   activa (A5.3). La respuesta dice qué falta, no solo que no se puede.
 * - El slug de una línea publicada es inmutable: renombrarla exige una
 *   redirección 301 (`schema.prisma`).
 * - Una línea tiene variantes de un solo tipo: de sabor o de color.
 * - `Variant.stockCache` no se toca; su dueño es `StockService`.
 *
 * Toda escritura queda auditada en la misma transacción (ADR-002, plan A3.2),
 * firmada por el usuario de la sesión: el autor nunca viene del cuerpo.
 *
 * No hay borrado: el libro de inventario referencia variantes con
 * `onDelete: Restrict`, así que lo que se «borra» se desactiva (`active:
 * false`) y una línea se retira pasándola a `draft`.
 */

export type CatalogErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'DUPLICATE_SLUG'
  | 'IMMUTABLE_SLUG'
  | 'NOT_PUBLISHABLE'
  | 'CONFLICT';

/** Error de dominio; la capa HTTP lo traduce a 400 / 404 / 409. */
export class CatalogError extends Error {
  constructor(
    public readonly code: CatalogErrorCode,
    message: string,
    /** Lo que falta, cuando la respuesta puede ser accionable (publicación). */
    public readonly details?: string[]
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

/** Lo que le falta a una línea para poder publicarse (A5.3). */
export interface Readiness {
  canPublish: boolean;
  missing: string[];
}

export function readiness(product: AdminProductDetail): Readiness {
  const missing: string[] = [];
  if (product.price === null) missing.push('price');
  if (!product.imageKey) missing.push('imageKey');
  if (!product.variants.some(variant => variant.active)) missing.push('activeVariant');
  return { canPublish: missing.length === 0, missing };
}

function validate<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new CatalogError(
      'VALIDATION',
      parsed.error.issues.map(issue => `${issue.path.join('.') || 'cuerpo'}: ${issue.message}`).join('; ')
    );
  }
  return parsed.data;
}

type Fields = Record<string, unknown>;

/** Campos que cambian de verdad, comparados como JSON por `tags` y `specs`. */
function changedFields(before: Fields, patch: Fields): string[] {
  return Object.keys(patch).filter(key =>
    patch[key] !== undefined && JSON.stringify(patch[key] ?? null) !== JSON.stringify(before[key] ?? null));
}

/** Antes y después recortados a lo que cambió: el registro queda legible. */
function pick(source: Fields, keys: string[]): Record<string, JsonValue> {
  return Object.fromEntries(keys.map(key => [key, (source[key] ?? null) as JsonValue]));
}

/** `undefined` deja el valor como está; `null` lo borra. */
function valueAfter<T>(patched: T | null | undefined, current: T | null): T | null {
  return patched === undefined ? current : patched;
}

export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  // ---- Marcas ----

  public async createBrand(input: unknown, author: Author): Promise<BrandRow> {
    const data = validate(BrandBodySchema, input);
    return this.write(async tx => {
      const brand = await tx.createBrand(data);
      await recordAudit(tx.audit, {
        userId: author.userId,
        entity: 'brand',
        entityId: brand.id,
        action: 'brand.create',
        after: { ...brand }
      });
      return brand;
    });
  }

  public async updateBrand(id: string, input: unknown, author: Author): Promise<BrandRow> {
    const patch = validate(BrandPatchSchema, input);
    return this.write(async tx => {
      const before = await tx.findBrand(id);
      if (!before) throw notFound('marca');

      const changed = changedFields(before as unknown as Fields, patch as Fields);
      const after = await tx.updateBrand(id, patch);
      if (!after) throw notFound('marca');

      if (changed.length > 0) {
        await recordAudit(tx.audit, {
          userId: author.userId,
          entity: 'brand',
          entityId: id,
          action: patch.active === false ? 'brand.deactivate' : 'brand.update',
          before: pick(before as unknown as Fields, changed),
          after: pick(after as unknown as Fields, changed)
        });
      }
      return after;
    });
  }

  // ---- Proveedores ----

  public async createSupplier(input: unknown, author: Author): Promise<SupplierRow> {
    const data = validate(SupplierBodySchema, input);
    return this.write(async tx => {
      const supplier = await tx.createSupplier(data);
      await recordAudit(tx.audit, {
        userId: author.userId,
        entity: 'supplier',
        entityId: supplier.id,
        action: 'supplier.create',
        after: { ...supplier, brandIds: data.brandIds ?? [] }
      });
      return supplier;
    });
  }

  public async updateSupplier(id: string, input: unknown, author: Author): Promise<SupplierRow> {
    const patch = validate(SupplierPatchSchema, input);
    return this.write(async tx => {
      const before = await tx.findSupplier(id);
      if (!before) throw notFound('proveedor');

      const { brandIds, ...columns } = patch;
      const changed = changedFields(before as unknown as Fields, columns as Fields);
      const after = await tx.updateSupplier(id, patch);
      if (!after) throw notFound('proveedor');

      if (changed.length > 0 || brandIds) {
        await recordAudit(tx.audit, {
          userId: author.userId,
          entity: 'supplier',
          entityId: id,
          action: patch.active === false ? 'supplier.deactivate' : 'supplier.update',
          before: pick(before as unknown as Fields, changed),
          // El vínculo con marcas se reemplaza completo: se guarda la lista nueva.
          after: { ...pick(after as unknown as Fields, changed), ...(brandIds && { brandIds }) }
        });
      }
      return after;
    });
  }

  // ---- Líneas de producto ----

  public async createProduct(input: unknown, author: Author): Promise<AdminProductDetail> {
    const data = validate(ProductBodySchema, input);
    checkOffer(data.price ?? null, data.compareAtPrice ?? null);

    return this.write(async tx => {
      const product = await tx.createProduct(data as NewProduct);
      // Una línea nueva no tiene variantes, así que nacer publicada es
      // imposible: la respuesta dice qué falta en vez de un «no se puede».
      if (data.status === 'published') {
        const state = readiness(product);
        if (!state.canPublish) throw notPublishable(state.missing);
      }
      await recordAudit(tx.audit, {
        userId: author.userId,
        entity: 'product',
        entityId: product.id,
        action: 'product.create',
        after: auditable(product)
      });
      return product;
    });
  }

  public async updateProduct(id: string, input: unknown, author: Author): Promise<AdminProductDetail> {
    const patch = validate(ProductPatchSchema, input);

    return this.write(async tx => {
      const before = await tx.findProduct(id);
      if (!before) throw notFound('línea');

      if (patch.slug && patch.slug !== before.slug && before.status === 'published') {
        throw new CatalogError(
          'IMMUTABLE_SLUG',
          'El slug de una línea publicada no se cambia: su URL ya está indexada y renombrarla '
          + 'exige una redirección 301. Pásala a borrador si de verdad hay que renombrarla'
        );
      }

      const price = valueAfter(patch.price, before.price);
      const compareAtPrice = valueAfter(patch.compareAtPrice, before.compareAtPrice);
      checkOffer(price, compareAtPrice);

      // La publicación se juzga sobre el estado resultante, no sobre el anterior.
      if (patch.status === 'published' && before.status !== 'published') {
        const state = readiness({
          ...before,
          price,
          imageKey: valueAfter(patch.imageKey, before.imageKey)
        });
        if (!state.canPublish) throw notPublishable(state.missing);
      }

      const changed = changedFields(before as unknown as Fields, patch as Fields);
      const after = await tx.updateProduct(id, patch as ProductPatch);
      if (!after) throw notFound('línea');

      if (changed.length > 0) {
        await recordAudit(tx.audit, {
          userId: author.userId,
          entity: 'product',
          entityId: id,
          action: productAction(changed, after.status),
          before: pick(before as unknown as Fields, changed),
          after: pick(after as unknown as Fields, changed)
        });
      }
      return after;
    });
  }

  // ---- Variantes ----

  public async createVariant(productId: string, input: unknown, author: Author): Promise<AdminVariantRow> {
    const data = validate(VariantBodySchema, input);

    return this.write(async tx => {
      const product = await tx.findProduct(productId);
      if (!product) throw notFound('línea');
      checkKind(product, data.kind);

      const variant = await tx.createVariant({ ...data, productId });
      await recordAudit(tx.audit, {
        userId: author.userId,
        entity: 'variant',
        entityId: variant.id,
        action: 'variant.create',
        after: { ...variant }
      });
      return variant;
    });
  }

  public async updateVariant(
    productId: string,
    variantId: string,
    input: unknown,
    author: Author
  ): Promise<AdminVariantRow> {
    const patch = validate(VariantPatchSchema, input);

    return this.write(async tx => {
      const product = await tx.findProduct(productId);
      if (!product) throw notFound('línea');

      const before = product.variants.find(variant => variant.id === variantId);
      if (!before) throw notFound('variante');

      if (patch.kind && patch.kind !== before.kind && product.variants.length > 1) {
        throw new CatalogError(
          'CONFLICT',
          'Una línea tiene variantes de un solo tipo: cambiar el tipo afectaría a toda la línea'
        );
      }

      // Desactivar la última variante activa de una línea publicada dejaría una
      // tarjeta sin nada que elegir, que es justo lo que impide publicar.
      if (patch.active === false && before.active && product.status === 'published') {
        const remaining = product.variants.filter(v => v.active && v.id !== variantId);
        if (remaining.length === 0) {
          throw new CatalogError(
            'CONFLICT',
            'Es la última variante activa de una línea publicada: pasa la línea a borrador primero'
          );
        }
      }

      const changed = changedFields(before as unknown as Fields, patch as Fields);
      const after = await tx.updateVariant(variantId, patch);
      if (!after) throw notFound('variante');

      if (changed.length > 0) {
        await recordAudit(tx.audit, {
          userId: author.userId,
          entity: 'variant',
          entityId: variantId,
          action: patch.active === undefined
            ? 'variant.update'
            : patch.active ? 'variant.activate' : 'variant.deactivate',
          before: pick(before as unknown as Fields, changed),
          after: pick(after as unknown as Fields, changed)
        });
      }
      return after;
    });
  }

  /** Traduce los errores del repositorio a errores de dominio, en un solo sitio. */
  private async write<T>(work: (tx: CatalogTransaction) => Promise<T>): Promise<T> {
    try {
      return await this.repository.transaction(work);
    } catch (error) {
      if (error instanceof DuplicateSlugError) {
        throw new CatalogError('DUPLICATE_SLUG', error.message);
      }
      if (error instanceof MissingReferenceError) {
        throw new CatalogError('VALIDATION', error.message);
      }
      throw error;
    }
  }
}

function notFound(what: string): CatalogError {
  return new CatalogError('NOT_FOUND', `No existe la ${what} indicada`);
}

function notPublishable(missing: string[]): CatalogError {
  return new CatalogError(
    'NOT_PUBLISHABLE',
    `Falta algo para publicar la línea: ${missing.join(', ')}`,
    missing
  );
}

/** El precio tachado solo tiene sentido si es mayor que el que se cobra. */
function checkOffer(price: number | null, compareAtPrice: number | null): void {
  if (compareAtPrice === null) return;
  if (price === null) {
    throw new CatalogError('VALIDATION', 'No hay precio anterior sin precio: una oferta necesita los dos');
  }
  if (compareAtPrice <= price) {
    throw new CatalogError('VALIDATION', 'El precio anterior tiene que ser mayor que el precio actual');
  }
}

function checkKind(product: AdminProductDetail, kind: 'flavor' | 'color'): void {
  const existing = product.variants[0];
  if (existing && existing.kind !== kind) {
    throw new CatalogError(
      'CONFLICT',
      `La línea tiene variantes de tipo "${existing.kind}": no admite una de tipo "${kind}"`
    );
  }
}

/**
 * Qué verbo describe mejor el cambio. El estado de publicación manda sobre el
 * precio, y el precio sobre el resto: así `?action=product.price` encuentra los
 * cambios de precio sin leer cada fila.
 */
function productAction(changed: string[], status: 'draft' | 'published'): string {
  if (changed.includes('status')) return status === 'published' ? 'product.publish' : 'product.unpublish';
  if (changed.includes('price') || changed.includes('compareAtPrice')) return 'product.price';
  return 'product.update';
}

/** La ficha completa sin las variantes, que tienen sus propios registros. */
function auditable(product: AdminProductDetail): Omit<AdminProductDetail, 'variants'> {
  const { variants, ...rest } = product;
  return rest;
}

/** Lo que consumen las rutas: el servicio entero, menos la forma de construirlo. */
export type CatalogWriter = Pick<
  CatalogService,
  'createBrand' | 'updateBrand' | 'createSupplier' | 'updateSupplier'
  | 'createProduct' | 'updateProduct' | 'createVariant' | 'updateVariant'
>;

export const catalogService = new CatalogService(new PrismaCatalogRepository());
