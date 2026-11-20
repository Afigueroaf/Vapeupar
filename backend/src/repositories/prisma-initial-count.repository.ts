import { CountSupplier, CountVariant } from '../catalog/initial-count.js';
import { getPrisma } from '../db/prisma.js';
import { InitialCountSource } from '../services/initial-count.service.js';

/** Lectura del catálogo para la planilla del conteo inicial. Solo lee. */
export class PrismaInitialCountSource implements InitialCountSource {
  public async listVariants(): Promise<CountVariant[]> {
    const rows = await getPrisma().variant.findMany({
      select: {
        id: true, slug: true, name: true, active: true, stockCache: true, sortOrder: true,
        product: { select: { slug: true, name: true, brand: { select: { name: true } } } }
      }
    });
    return rows.map(v => ({
      id: v.id,
      slug: v.slug,
      name: v.name,
      active: v.active,
      stockCache: v.stockCache,
      sortOrder: v.sortOrder,
      productSlug: v.product.slug,
      productName: v.product.name,
      brandName: v.product.brand.name
    }));
  }

  public async listSuppliers(): Promise<CountSupplier[]> {
    return getPrisma().supplier.findMany({ select: { id: true, name: true, active: true } });
  }
}
