import { StockFilter, StockPage, StockRow, StockViewRepository } from './stock-view.repository.js';

/** Implementación para tests: mismo orden y mismos filtros, sobre un arreglo. */
export class InMemoryStockViewRepository implements StockViewRepository {
  constructor(private readonly rows: StockRow[] = []) {}

  public async list(filter: StockFilter): Promise<StockPage> {
    const q = filter.q?.toLowerCase();
    const matches = this.rows.filter(row => {
      if (filter.lowStock && row.stock > filter.threshold) return false;
      if (filter.brandId && row.brandId !== filter.brandId) return false;
      if (q && !row.variantName.toLowerCase().includes(q) && !row.productName.toLowerCase().includes(q)) return false;
      return true;
    });

    const ordered = [...matches].sort((a, b) =>
      a.stock - b.stock
      || a.productName.localeCompare(b.productName)
      || a.variantName.localeCompare(b.variantName));

    return {
      rows: ordered.slice(filter.offset, filter.offset + filter.limit).map(row => ({ ...row })),
      total: ordered.length
    };
  }
}
