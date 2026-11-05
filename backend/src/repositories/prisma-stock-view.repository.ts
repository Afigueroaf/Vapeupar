import { getPrisma } from '../db/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { StockFilter, StockPage, StockRow, StockViewRepository } from './stock-view.repository.js';

const VARIANT_INCLUDE = {
  product: { select: { id: true, name: true, slug: true, category: true, status: true, price: true, brand: { select: { id: true, name: true } } } }
} satisfies Prisma.VariantInclude;

type VariantRow = Prisma.VariantGetPayload<{ include: typeof VARIANT_INCLUDE }>;

/** El enum de Prisma usa `pod_systems`; el contrato de la API, `pod-systems`. */
function toRow(row: VariantRow): StockRow {
  return {
    variantId: row.id,
    variantName: row.name,
    variantSlug: row.slug,
    variantImageKey: row.imageKey,
    kind: row.kind,
    active: row.active,
    stock: row.stockCache,
    productId: row.product.id,
    productName: row.product.name,
    productSlug: row.product.slug,
    category: row.product.category.replace(/_/g, '-'),
    status: row.product.status,
    price: row.product.price,
    brandId: row.product.brand.id,
    brandName: row.product.brand.name
  };
}

export class PrismaStockViewRepository implements StockViewRepository {
  public async list(filter: StockFilter): Promise<StockPage> {
    const where: Prisma.VariantWhereInput = {};

    if (filter.lowStock) where.stockCache = { lte: filter.threshold };
    if (filter.brandId) where.product = { brandId: filter.brandId };
    if (filter.q) {
      where.OR = [
        { name: { contains: filter.q, mode: 'insensitive' } },
        { product: { name: { contains: filter.q, mode: 'insensitive' } } }
      ];
    }

    const prisma = getPrisma();
    // Las dos consultas van en una transacción de solo lectura para que el
    // total y la página no se contradigan si alguien escribe en medio.
    const [rows, total] = await prisma.$transaction([
      prisma.variant.findMany({
        where,
        include: VARIANT_INCLUDE,
        orderBy: [{ stockCache: 'asc' }, { product: { name: 'asc' } }, { name: 'asc' }],
        skip: filter.offset,
        take: filter.limit
      }),
      prisma.variant.count({ where })
    ]);

    return { rows: rows.map(toRow), total };
  }

  public async listMissingVariantImages(): Promise<StockRow[]> {
    const rows = await getPrisma().variant.findMany({
      where: {
        stockCache: { gt: 0 },
        OR: [{ imageKey: null }, { imageKey: '' }],
        product: { status: 'published' }
      },
      include: VARIANT_INCLUDE,
      orderBy: [{ product: { name: 'asc' } }, { name: 'asc' }]
    });
    return rows.map(toRow);
  }
}
