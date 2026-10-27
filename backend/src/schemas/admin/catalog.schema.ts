import { z } from 'zod';
import { API_CATEGORIES } from '../../repositories/catalog.repository.js';
import { jsonObject } from '../json.schema.js';

/**
 * Esquemas del catálogo en la consola (plan A4.2): marcas, proveedores, líneas
 * y variantes.
 *
 * Son también los que usa `CatalogService` para validar la forma de lo que
 * recibe, de modo que un script (la semilla de A1.3) tenga las mismas
 * garantías que una petición HTTP. Las **reglas de negocio** —qué falta para
 * publicar, qué es inmutable, qué tipo admite una línea— viven en el servicio,
 * que es su dueño; aquí solo se comprueba la forma.
 *
 * Cada entidad se declara una vez como «núcleo» sin valores por defecto, y de
 * ahí salen las dos variantes:
 *
 * - el cuerpo de creación, que es el núcleo **con** los defaults;
 * - el parche, que es el núcleo en `.partial()`, sin ellos.
 *
 * El orden importa: en zod 4 `.partial()` **conserva** el `.default()`, así que
 * derivar el parche del cuerpo convertiría un PATCH de un solo campo en una
 * sobrescritura de todos los demás con sus valores por defecto.
 */

/** Minúsculas, números y guiones. Es parte de la URL pública. */
const slug = z.string().trim().toLowerCase().min(2).max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'El slug va en minúsculas, con guiones y sin acentos');

const name = z.string().trim().min(1).max(120);

/** Clave en el bucket, no URL. `null` la borra; ausente la deja como está. */
const imageKey = z.string().trim().max(255).nullable();

const sortOrder = z.number().int().min(0).max(9999);

/** Pesos colombianos, entero. El tope evita un cero de más por accidente. */
const money = z.number().int().nonnegative().max(100_000_000);

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** `'true'` y `'false'` llegan como texto en la query; ausente es «sin filtro». */
const optionalBoolean = z.preprocess(
  value => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value),
  z.boolean().optional()
);

const page = z.coerce.number().int().positive().default(1);
const limit = z.coerce.number().int().positive().max(100).default(20);

/** Un PATCH vacío no es un error del servidor, pero tampoco una actualización. */
function patchOf<T extends z.ZodObject>(core: T) {
  return core.partial().refine(
    patch => Object.values(patch).some(value => value !== undefined),
    'No hay ningún campo que actualizar'
  );
}

export const CategorySchema = z.enum(API_CATEGORIES);

// ---- Marcas ----

const BrandCore = z.object({
  name,
  slug,
  logoKey: imageKey.optional(),
  /** Marca aliada: aparece en la landing y en la FAQ. */
  isPartner: z.boolean(),
  sortOrder,
  active: z.boolean()
});

export const BrandBodySchema = BrandCore.extend({
  isPartner: z.boolean().default(false),
  sortOrder: sortOrder.default(0),
  active: z.boolean().default(true)
});

export const BrandPatchSchema = patchOf(BrandCore);

export const BrandQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  active: optionalBoolean,
  isPartner: optionalBoolean,
  page,
  limit
});

// ---- Proveedores ----

const SupplierCore = z.object({
  name,
  /** NIT o cédula; sin formato impuesto, que varía por tipo de documento. */
  taxId: optionalText(40),
  contactName: optionalText(120),
  whatsapp: optionalText(30),
  paymentTerms: optionalText(120),
  notes: optionalText(2000),
  active: z.boolean(),
  /** Vínculo N↔N con marcas: la lista llega completa y reemplaza la anterior. */
  brandIds: z.array(z.uuid()).max(50).optional()
});

export const SupplierBodySchema = SupplierCore.extend({
  active: z.boolean().default(true)
});

export const SupplierPatchSchema = patchOf(SupplierCore);

export const SupplierQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  active: optionalBoolean,
  page,
  limit
});

// ---- Líneas de producto ----

const ProductCore = z.object({
  slug,
  brandId: z.uuid(),
  category: CategorySchema,
  name,
  description: z.string().trim().max(5000),
  shortDescription: z.string().trim().max(300),
  /** Ficha técnica. JSON libre: el contrato público toma lo que encaja. */
  specs: jsonObject(16 * 1024),
  /** Nulo en borrador; obligatorio para publicar (lo exige el servicio). */
  price: money.nullable().optional(),
  /** Precio tachado de la etiqueta «Oferta»: tiene que ser mayor que el precio. */
  compareAtPrice: money.nullable().optional(),
  status: z.enum(['draft', 'published']),
  imageKey: imageKey.optional(),
  featured: z.boolean(),
  isNewArrival: z.boolean(),
  isBestSeller: z.boolean(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20)
});

export const ProductBodySchema = ProductCore.extend({
  description: z.string().trim().max(5000).default(''),
  shortDescription: z.string().trim().max(300).default(''),
  specs: jsonObject(16 * 1024).default({}),
  status: z.enum(['draft', 'published']).default('draft'),
  featured: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([])
});

export const ProductPatchSchema = patchOf(ProductCore);

export const ProductQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  brandId: z.uuid().optional(),
  category: CategorySchema.optional(),
  status: z.enum(['draft', 'published']).optional(),
  page,
  limit
});

// ---- Variantes ----

/**
 * `stockCache` no está aquí **a propósito**: su dueño es `StockService` y solo
 * se mueve con un movimiento de inventario (ADR-002 §2).
 */
const VariantCore = z.object({
  /** Sabor o color: una línea tiene variantes de un solo tipo. */
  kind: z.enum(['flavor', 'color']),
  name,
  slug,
  imageKey: imageKey.optional(),
  active: z.boolean(),
  sortOrder
});

export const VariantBodySchema = VariantCore.extend({
  active: z.boolean().default(true),
  sortOrder: sortOrder.default(0)
});

export const VariantPatchSchema = patchOf(VariantCore);

// ---- Identificadores de ruta ----

export const IdParamSchema = z.object({ id: z.uuid() });

export const VariantParamsSchema = z.object({ id: z.uuid(), variantId: z.uuid() });

export type BrandBody = z.infer<typeof BrandBodySchema>;
export type BrandPatchBody = z.infer<typeof BrandPatchSchema>;
export type SupplierBody = z.infer<typeof SupplierBodySchema>;
export type SupplierPatchBody = z.infer<typeof SupplierPatchSchema>;
export type ProductBody = z.infer<typeof ProductBodySchema>;
export type ProductPatchBody = z.infer<typeof ProductPatchSchema>;
export type VariantBody = z.infer<typeof VariantBodySchema>;
export type VariantPatchBody = z.infer<typeof VariantPatchSchema>;
