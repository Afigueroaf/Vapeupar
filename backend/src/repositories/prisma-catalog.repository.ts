import { Db, PrismaDbHandle, defaultDbHandle, prismaAuditSink } from '../db/handle.js';
import { isUuid } from '../db/uuid.js';
import { Prisma } from '../generated/prisma/client.js';
import { JsonValue } from '../services/audit.service.js';
import {
  AdminProductDetail, AdminProductRow, AdminVariantRow, ApiCategory, BrandFilter, BrandPatch, BrandRow,
  CatalogRepository, CatalogTransaction, DuplicateSlugError, MissingReferenceError, NewBrand, NewProduct,
  NewSupplier, NewVariant, Page, ProductFilter, ProductPatch, SupplierDetail, SupplierFilter, SupplierPatch,
  SupplierRow, VariantPatch
} from './catalog.repository.js';

const BRAND_INCLUDE = { _count: { select: { products: true } } } satisfies Prisma.BrandInclude;
const PRODUCT_INCLUDE = {
  brand: { select: { name: true } },
  variants: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }
} satisfies Prisma.ProductInclude;

type BrandPayload = Prisma.BrandGetPayload<{ include: typeof BRAND_INCLUDE }>;
type SupplierPayload = Prisma.SupplierGetPayload<object>;
type ProductPayload = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;
type VariantPayload = Prisma.VariantGetPayload<object>;

/** El enum de Prisma usa `pod_systems`; el contrato de la API, `pod-systems`. */
function toApiCategory(category: string): ApiCategory {
  return category.replace(/_/g, '-') as ApiCategory;
}

function toDbCategory(category: ApiCategory): Prisma.ProductCreateInput['category'] {
  return category.replace(/-/g, '_') as Prisma.ProductCreateInput['category'];
}

function toBrand(row: BrandPayload): BrandRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoKey: row.logoKey,
    isPartner: row.isPartner,
    sortOrder: row.sortOrder,
    active: row.active,
    productCount: row._count.products
  };
}

function toSupplier(row: SupplierPayload): SupplierRow {
  return {
    id: row.id,
    name: row.name,
    taxId: row.taxId,
    contactName: row.contactName,
    whatsapp: row.whatsapp,
    paymentTerms: row.paymentTerms,
    notes: row.notes,
    imageKey: row.imageKey,
    active: row.active
  };
}

function toVariant(row: VariantPayload): AdminVariantRow {
  return {
    id: row.id,
    productId: row.productId,
    kind: row.kind,
    name: row.name,
    slug: row.slug,
    imageKey: row.imageKey,
    active: row.active,
    sortOrder: row.sortOrder,
    stock: row.stockCache
  };
}

function toProduct(row: ProductPayload): AdminProductDetail {
  return {
    id: row.id,
    slug: row.slug,
    brandId: row.brandId,
    brandName: row.brand.name,
    category: toApiCategory(row.category),
    name: row.name,
    description: row.description,
    shortDescription: row.shortDescription,
    specs: row.specs as JsonValue,
    price: row.price,
    compareAtPrice: row.compareAtPrice,
    status: row.status,
    imageKey: row.imageKey,
    featured: row.featured,
    showcase: row.showcase,
    isNewArrival: row.isNewArrival,
    isBestSeller: row.isBestSeller,
    tags: row.tags,
    variantCount: row.variants.length,
    activeVariantCount: row.variants.filter(variant => variant.active).length,
    variants: row.variants.map(toVariant)
  };
}

/** Fila de listado: lo mismo sin las variantes, que ahí no se usan. */
function toProductRow(row: ProductPayload): AdminProductRow {
  const { variants, ...rest } = toProduct(row);
  return rest;
}

/** Quita `brandIds`, que no es columna, y crea el vínculo (A5.2). */
function supplierCreateData(data: NewSupplier): Prisma.SupplierUncheckedCreateInput {
  const { brandIds, ...columns } = data;
  return {
    ...columns,
    ...(brandIds && { brands: { create: brandIds.map(brandId => ({ brandId })) } })
  };
}

/**
 * Igual, pero reemplazando el vínculo entero: la lista de marcas llega
 * completa. `deleteMany` solo existe en una escritura anidada de actualización,
 * así que la creación tiene su propia función.
 */
function supplierUpdateData(patch: SupplierPatch): Prisma.SupplierUpdateInput {
  const { brandIds, ...columns } = patch;
  return {
    ...columns,
    ...(brandIds && { brands: { deleteMany: {}, create: brandIds.map(brandId => ({ brandId })) } })
  };
}

/** `brandId` y `specs` son los dos que no se copian tal cual. */
function productData(patch: ProductPatch): Prisma.ProductUncheckedUpdateInput {
  const { category, specs, ...columns } = patch;
  return {
    ...columns,
    ...(category && { category: toDbCategory(category) }),
    ...(specs !== undefined && { specs: specs as Prisma.InputJsonValue })
  };
}

function isKnownError(error: unknown, code: string): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * Traduce los errores de Prisma a los del repositorio. `P2025` en una
 * actualización significa «no hay fila», que no es un error sino `undefined`;
 * quien llama decide si eso es un 404.
 */
async function translate<T>(
  work: () => Promise<T>,
  context: { entity: string; slug?: string; reference?: string }
): Promise<T | undefined> {
  try {
    return await work();
  } catch (error) {
    if (isKnownError(error, 'P2002') && context.slug !== undefined) {
      throw new DuplicateSlugError(context.entity, context.slug);
    }
    if (isKnownError(error, 'P2003') && context.reference) {
      throw new MissingReferenceError(context.reference, 'desconocido');
    }
    if (isKnownError(error, 'P2025')) return undefined;
    throw error;
  }
}

/** Como `translate`, pero para una creación: ahí `undefined` no es una opción. */
async function translateCreate<T>(
  work: () => Promise<T>,
  context: { entity: string; slug?: string; reference?: string }
): Promise<T> {
  const result = await translate(work, context);
  if (result === undefined) {
    // P2025 en una creación es una relación `connect` que no existe.
    throw new MissingReferenceError(context.reference ?? context.entity, 'desconocido');
  }
  return result;
}

async function lastInboundAt(db: Db, supplierId: string): Promise<Date | null> {
  const row = await db.stockMovement.findFirst({
    where: { supplierId, type: 'inbound' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true }
  });
  return row?.createdAt ?? null;
}

/**
 * Cuántas variantes distintas ha abastecido (A5.2). Se agrupa en la base en vez
 * de traer el libro entero: lo que interesa es el número de grupos.
 */
async function suppliedVariantCount(db: Db, supplierId: string): Promise<number> {
  const groups = await db.stockMovement.groupBy({ by: ['variantId'], where: { supplierId } });
  return groups.length;
}

function transactionOps(tx: Prisma.TransactionClient): CatalogTransaction {
  return {
    async findBrand(id) {
      if (!isUuid(id)) return undefined;
      const row = await tx.brand.findUnique({ where: { id }, include: BRAND_INCLUDE });
      return row ? toBrand(row) : undefined;
    },

    createBrand: (data: NewBrand) => translateCreate(
      async () => toBrand(await tx.brand.create({ data, include: BRAND_INCLUDE })),
      { entity: 'marca', slug: data.slug }
    ),

    async updateBrand(id, patch: BrandPatch) {
      if (!isUuid(id)) return undefined;
      return translate(
        async () => toBrand(await tx.brand.update({ where: { id }, data: patch, include: BRAND_INCLUDE })),
        { entity: 'marca', slug: patch.slug }
      );
    },

    async findSupplier(id) {
      if (!isUuid(id)) return undefined;
      const row = await tx.supplier.findUnique({ where: { id } });
      return row ? toSupplier(row) : undefined;
    },

    createSupplier: (data: NewSupplier) => translateCreate(
      async () => toSupplier(await tx.supplier.create({ data: supplierCreateData(data) })),
      { entity: 'proveedor', reference: 'brandIds' }
    ),

    async updateSupplier(id, patch: SupplierPatch) {
      if (!isUuid(id)) return undefined;
      return translate(
        async () => toSupplier(await tx.supplier.update({ where: { id }, data: supplierUpdateData(patch) })),
        { entity: 'proveedor', reference: 'brandIds' }
      );
    },

    async findProduct(id) {
      if (!isUuid(id)) return undefined;
      const row = await tx.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
      return row ? toProduct(row) : undefined;
    },

    createProduct: (data: NewProduct) => translateCreate(
      async () => toProduct(await tx.product.create({
        data: productData(data) as Prisma.ProductUncheckedCreateInput,
        include: PRODUCT_INCLUDE
      })),
      { entity: 'producto', slug: data.slug, reference: 'brandId' }
    ),

    async updateProduct(id, patch: ProductPatch) {
      if (!isUuid(id)) return undefined;
      return translate(
        async () => toProduct(await tx.product.update({
          where: { id },
          data: productData(patch),
          include: PRODUCT_INCLUDE
        })),
        { entity: 'producto', slug: patch.slug, reference: 'brandId' }
      );
    },

    async findVariant(id) {
      if (!isUuid(id)) return undefined;
      const row = await tx.variant.findUnique({ where: { id } });
      return row ? toVariant(row) : undefined;
    },

    createVariant: (data: NewVariant) => translateCreate(
      async () => toVariant(await tx.variant.create({ data })),
      { entity: 'variante', slug: data.slug, reference: 'productId' }
    ),

    async updateVariant(id, patch: VariantPatch) {
      if (!isUuid(id)) return undefined;
      return translate(
        async () => toVariant(await tx.variant.update({ where: { id }, data: patch })),
        { entity: 'variante', slug: patch.slug }
      );
    },

    audit: prismaAuditSink(tx)
  };
}

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly db: PrismaDbHandle = defaultDbHandle) {}

  public transaction<T>(work: (tx: CatalogTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(tx => work(transactionOps(tx)));
  }

  public async listBrands(filter: BrandFilter): Promise<Page<BrandRow>> {
    const where: Prisma.BrandWhereInput = {
      ...(filter.active !== undefined && { active: filter.active }),
      ...(filter.isPartner !== undefined && { isPartner: filter.isPartner }),
      ...(filter.q && { name: { contains: filter.q, mode: 'insensitive' } })
    };
    // Total y página en la misma transacción de lectura, para que no se
    // contradigan si alguien escribe en medio. Va por el handle y no por
    // `client()` porque este puede ser ya una transacción, y no se anidan.
    return this.db.transaction(async tx => {
      const rows = await tx.brand.findMany({
        where,
        include: BRAND_INCLUDE,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: filter.offset,
        take: filter.limit
      });
      return { rows: rows.map(toBrand), total: await tx.brand.count({ where }) };
    });
  }

  public async findBrand(id: string): Promise<BrandRow | undefined> {
    if (!isUuid(id)) return undefined;
    const row = await this.db.client().brand.findUnique({ where: { id }, include: BRAND_INCLUDE });
    return row ? toBrand(row) : undefined;
  }

  public async listSuppliers(filter: SupplierFilter): Promise<Page<SupplierRow>> {
    const where: Prisma.SupplierWhereInput = {
      ...(filter.active !== undefined && { active: filter.active }),
      ...(filter.q && {
        OR: [
          { name: { contains: filter.q, mode: 'insensitive' } },
          { contactName: { contains: filter.q, mode: 'insensitive' } }
        ]
      })
    };
    return this.db.transaction(async tx => {
      const rows = await tx.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: filter.offset,
        take: filter.limit
      });
      return { rows: rows.map(toSupplier), total: await tx.supplier.count({ where }) };
    });
  }

  public async findSupplier(id: string): Promise<SupplierDetail | undefined> {
    if (!isUuid(id)) return undefined;
    const db = this.db.client();
    const row = await db.supplier.findUnique({
      where: { id },
      include: { brands: { include: { brand: { select: { id: true, name: true } } } } }
    });
    if (!row) return undefined;
    const [lastInbound, supplied] = await Promise.all([
      lastInboundAt(db, id),
      suppliedVariantCount(db, id)
    ]);
    return {
      ...toSupplier(row),
      brands: row.brands.map(link => link.brand),
      lastInboundAt: lastInbound,
      suppliedVariantCount: supplied
    };
  }

  public async listProducts(filter: ProductFilter): Promise<Page<AdminProductRow>> {
    const where: Prisma.ProductWhereInput = {
      ...(filter.brandId && { brandId: filter.brandId }),
      ...(filter.category && { category: toDbCategory(filter.category) }),
      ...(filter.status && { status: filter.status }),
      ...(filter.showcase !== undefined && { showcase: filter.showcase }),
      ...(filter.q && {
        OR: [
          { name: { contains: filter.q, mode: 'insensitive' } },
          { slug: { contains: filter.q, mode: 'insensitive' } }
        ]
      })
    };
    return this.db.transaction(async tx => {
      const rows = await tx.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        // Borrador antes que publicado: el enum está declarado en ese orden.
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip: filter.offset,
        take: filter.limit
      });
      return { rows: rows.map(toProductRow), total: await tx.product.count({ where }) };
    });
  }

  public async findProduct(id: string): Promise<AdminProductDetail | undefined> {
    if (!isUuid(id)) return undefined;
    const row = await this.db.client().product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
    return row ? toProduct(row) : undefined;
  }

  public async findVariant(id: string): Promise<AdminVariantRow | undefined> {
    if (!isUuid(id)) return undefined;
    const row = await this.db.client().variant.findUnique({ where: { id } });
    return row ? toVariant(row) : undefined;
  }
}
