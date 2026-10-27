import { z } from 'zod';
import { getPrisma } from '../db/prisma.js';
import { isUuid } from '../db/uuid.js';
import { Prisma } from '../generated/prisma/client.js';
import { Product, ProductCategory } from '../types/product.types.js';
import { ProductRepository } from './product.repository.js';

// Visible en el sitio: publicado y con precio. El precio es obligatorio para
// publicar, pero se exige también aquí para no servir nunca un `price: null`.
const PUBLIC_WHERE = { status: 'published', price: { not: null } } satisfies Prisma.ProductWhereInput;

const PRODUCT_INCLUDE = {
  brand: { select: { name: true } },
  variants: { where: { active: true }, select: { stockCache: true } }
} satisfies Prisma.ProductInclude;

export type ProductRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

// `specs` es JSON libre editado desde la consola: se toma solo lo que encaja
// con el contrato y se descarta el resto en vez de fallar la respuesta.
const SpecsSchema = z.object({
  puffCount: z.number().int().nonnegative().optional().catch(undefined),
  nicotineStrength: z.string().catch(''),
  flavorProfile: z.string().optional().catch(undefined),
  liquidCapacity: z.string().optional().catch(undefined),
  batteryCapacity: z.string().optional().catch(undefined),
  resistance: z.string().optional().catch(undefined),
  rechargeable: z.boolean().optional().catch(undefined)
}).catch({ nicotineStrength: '' });

/** El enum de Prisma usa `pod_systems`; el contrato de la API, `pod-systems`. */
function toApiCategory(category: string): ProductCategory {
  return category.replace(/_/g, '-') as ProductCategory;
}

/** Hasta A8 el bucket puede estar vacío: sin CDN_DOMAIN o sin clave, URL vacía. */
function imageUrl(key: string | null): string {
  const domain = process.env.CDN_DOMAIN;
  return domain && key ? `https://${domain}/${key}` : '';
}

/** Fila de Prisma -> contrato de la API. Exportada para sus tests. */
export function toProduct(row: ProductRow): Product {
  const stock = row.variants.reduce((sum, v) => sum + Math.max(v.stockCache, 0), 0);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    brand: row.brand.name,
    category: toApiCategory(row.category),
    description: row.description,
    shortDescription: row.shortDescription,
    price: row.price ?? 0,
    ...(row.compareAtPrice !== null && { compareAtPrice: row.compareAtPrice }),
    inStock: stock > 0,
    stock,
    imageUrl: imageUrl(row.imageKey),
    featured: row.featured,
    isNewArrival: row.isNewArrival,
    isBestSeller: row.isBestSeller,
    specs: SpecsSchema.parse(row.specs),
    tags: row.tags
  };
}

export class PrismaProductRepository implements ProductRepository {
  public async findAll(): Promise<Product[]> {
    const rows = await getPrisma().product.findMany({
      where: PUBLIC_WHERE,
      include: PRODUCT_INCLUDE,
      orderBy: { createdAt: 'asc' }
    });
    return rows.map(toProduct);
  }

  public async findBySlug(slug: string): Promise<Product | undefined> {
    const row = await getPrisma().product.findFirst({
      where: { ...PUBLIC_WHERE, slug },
      include: PRODUCT_INCLUDE
    });
    return row ? toProduct(row) : undefined;
  }

  public async findById(id: string): Promise<Product | undefined> {
    if (!isUuid(id)) return undefined;
    const row = await getPrisma().product.findFirst({
      where: { ...PUBLIC_WHERE, id },
      include: PRODUCT_INCLUDE
    });
    return row ? toProduct(row) : undefined;
  }

  public async countByCategory(): Promise<Partial<Record<ProductCategory, number>>> {
    const groups = await getPrisma().product.groupBy({
      by: ['category'],
      where: PUBLIC_WHERE,
      _count: { _all: true }
    });
    const counts: Partial<Record<ProductCategory, number>> = {};
    for (const g of groups) {
      counts[toApiCategory(g.category)] = g._count._all;
    }
    return counts;
  }
}
