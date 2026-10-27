import { randomUUID } from 'node:crypto';
import { AuditRecord } from '../services/audit.service.js';
import {
  AdminProductDetail, AdminProductRow, AdminVariantRow, BrandFilter, BrandPatch, BrandRow, CatalogRepository,
  CatalogTransaction, DuplicateSlugError, MissingReferenceError, NewBrand, NewProduct, NewSupplier, NewVariant,
  Page, ProductFilter, ProductPatch, SupplierDetail, SupplierFilter, SupplierPatch, SupplierRow, VariantPatch
} from './catalog.repository.js';

/** Fila de producto sin lo que se deriva de otras tablas. */
type ProductState = Omit<AdminProductRow, 'brandName' | 'variantCount' | 'activeVariantCount'>;

interface State {
  brands: Map<string, BrandRow>;
  suppliers: Map<string, SupplierRow>;
  /** Vínculo N↔N, como `brand_suppliers`. */
  links: Set<string>;
  products: Map<string, ProductState>;
  variants: Map<string, AdminVariantRow>;
  audits: AuditRecord[];
}

function clone(state: State): State {
  return {
    brands: new Map([...state.brands].map(([id, row]) => [id, { ...row }])),
    suppliers: new Map([...state.suppliers].map(([id, row]) => [id, { ...row }])),
    links: new Set(state.links),
    products: new Map([...state.products].map(([id, row]) => [id, { ...row, tags: [...row.tags] }])),
    variants: new Map([...state.variants].map(([id, row]) => [id, { ...row }])),
    audits: [...state.audits]
  };
}

function matches(haystack: string | null, needle: string): boolean {
  return (haystack ?? '').toLowerCase().includes(needle.toLowerCase());
}

function paginate<T>(rows: T[], limit: number, offset: number): Page<T> {
  return { rows: rows.slice(offset, offset + limit), total: rows.length };
}

/**
 * Implementación para tests. Reproduce lo que el servicio da por supuesto de
 * la base: los índices únicos (slug de marca y de línea, `[productId, slug]` en
 * variantes), las claves ajenas, y que una transacción se revierte completa si
 * lanza.
 */
export class InMemoryCatalogRepository implements CatalogRepository {
  private state: State = {
    brands: new Map(), suppliers: new Map(), links: new Set(),
    products: new Map(), variants: new Map(), audits: []
  };

  private queue: Promise<unknown> = Promise.resolve();

  /** Lo que en la base sale del libro de inventario: ingresos por proveedor. */
  private readonly inbounds = new Map<string, { last: Date; variants: Set<string> }>();

  // --- Ayudas de test ---

  public seedBrand(brand: Partial<BrandRow> = {}): BrandRow {
    const row: BrandRow = {
      id: brand.id ?? randomUUID(),
      name: brand.name ?? 'LifePod',
      slug: brand.slug ?? 'lifepod',
      logoKey: brand.logoKey ?? null,
      isPartner: brand.isPartner ?? false,
      sortOrder: brand.sortOrder ?? 0,
      active: brand.active ?? true,
      productCount: 0
    };
    this.state.brands.set(row.id, row);
    return { ...row };
  }

  public seedSupplier(supplier: Partial<SupplierRow> = {}): SupplierRow {
    const row: SupplierRow = {
      id: supplier.id ?? randomUUID(),
      name: supplier.name ?? 'Distribuidora Andina',
      taxId: supplier.taxId ?? null,
      contactName: supplier.contactName ?? null,
      whatsapp: supplier.whatsapp ?? null,
      paymentTerms: supplier.paymentTerms ?? null,
      notes: supplier.notes ?? null,
      active: supplier.active ?? true
    };
    this.state.suppliers.set(row.id, row);
    return { ...row };
  }

  public seedProduct(product: Partial<ProductState> & { brandId: string }): AdminProductDetail {
    const row: ProductState = {
      id: product.id ?? randomUUID(),
      slug: product.slug ?? 'eco-pro',
      brandId: product.brandId,
      category: product.category ?? 'disposables',
      name: product.name ?? 'ECO PRO',
      description: product.description ?? '',
      shortDescription: product.shortDescription ?? '',
      specs: product.specs ?? {},
      price: product.price ?? null,
      compareAtPrice: product.compareAtPrice ?? null,
      status: product.status ?? 'draft',
      imageKey: product.imageKey ?? null,
      featured: product.featured ?? false,
      isNewArrival: product.isNewArrival ?? false,
      isBestSeller: product.isBestSeller ?? false,
      tags: product.tags ?? []
    };
    this.state.products.set(row.id, row);
    return this.detail(this.state, row);
  }

  public seedVariant(variant: Partial<AdminVariantRow> & { productId: string }): AdminVariantRow {
    const row: AdminVariantRow = {
      id: variant.id ?? randomUUID(),
      productId: variant.productId,
      kind: variant.kind ?? 'flavor',
      name: variant.name ?? 'Menta',
      slug: variant.slug ?? 'menta',
      imageKey: variant.imageKey ?? null,
      active: variant.active ?? true,
      sortOrder: variant.sortOrder ?? 0,
      stock: variant.stock ?? 0
    };
    this.state.variants.set(row.id, row);
    return { ...row };
  }

  public seedInbound(supplierId: string, at: Date, variantId = randomUUID()): void {
    const entry = this.inbounds.get(supplierId) ?? { last: at, variants: new Set<string>() };
    if (at >= entry.last) entry.last = at;
    entry.variants.add(variantId);
    this.inbounds.set(supplierId, entry);
  }

  public get audits(): readonly AuditRecord[] {
    return this.state.audits;
  }

  // --- CatalogRepository ---

  public transaction<T>(work: (tx: CatalogTransaction) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const draft = clone(this.state);
      const result = await work(this.transactionOps(draft));
      this.state = draft;
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  public async listBrands(filter: BrandFilter): Promise<Page<BrandRow>> {
    const rows = [...this.state.brands.values()]
      .filter(b => (filter.active === undefined || b.active === filter.active)
        && (filter.isPartner === undefined || b.isPartner === filter.isPartner)
        && (!filter.q || matches(b.name, filter.q)))
      .map(b => this.withCount(this.state, b))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return paginate(rows, filter.limit, filter.offset);
  }

  public async findBrand(id: string): Promise<BrandRow | undefined> {
    const row = this.state.brands.get(id);
    return row ? this.withCount(this.state, row) : undefined;
  }

  public async listSuppliers(filter: SupplierFilter): Promise<Page<SupplierRow>> {
    const rows = [...this.state.suppliers.values()]
      .filter(s => (filter.active === undefined || s.active === filter.active)
        && (!filter.q || matches(s.name, filter.q) || matches(s.contactName, filter.q)))
      .map(s => ({ ...s }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return paginate(rows, filter.limit, filter.offset);
  }

  public async findSupplier(id: string): Promise<SupplierDetail | undefined> {
    const row = this.state.suppliers.get(id);
    if (!row) return undefined;
    const brands = [...this.state.links]
      .filter(link => link.endsWith(`:${id}`))
      .map(link => this.state.brands.get(link.split(':')[0]!))
      .filter((brand): brand is BrandRow => brand !== undefined)
      .map(brand => ({ id: brand.id, name: brand.name }));
    const inbound = this.inbounds.get(id);
    return {
      ...row,
      brands,
      lastInboundAt: inbound?.last ?? null,
      suppliedVariantCount: inbound?.variants.size ?? 0
    };
  }

  public async listProducts(filter: ProductFilter): Promise<Page<AdminProductRow>> {
    const rows = [...this.state.products.values()]
      .filter(p => (!filter.brandId || p.brandId === filter.brandId)
        && (!filter.category || p.category === filter.category)
        && (!filter.status || p.status === filter.status)
        && (!filter.q || matches(p.name, filter.q) || matches(p.slug, filter.q)))
      .map(p => {
        const { variants, ...row } = this.detail(this.state, p);
        return row;
      })
      .sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name));
    return paginate(rows, filter.limit, filter.offset);
  }

  public async findProduct(id: string): Promise<AdminProductDetail | undefined> {
    const row = this.state.products.get(id);
    return row ? this.detail(this.state, row) : undefined;
  }

  // --- Interno ---

  private variantsOf(state: State, productId: string): AdminVariantRow[] {
    return [...state.variants.values()]
      .filter(v => v.productId === productId)
      .map(v => ({ ...v }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  private withCount(state: State, brand: BrandRow): BrandRow {
    const productCount = [...state.products.values()].filter(p => p.brandId === brand.id).length;
    return { ...brand, productCount };
  }

  private detail(state: State, product: ProductState): AdminProductDetail {
    const brand = state.brands.get(product.brandId);
    const variants = this.variantsOf(state, product.id);
    return {
      ...product,
      tags: [...product.tags],
      brandName: brand?.name ?? '',
      variantCount: variants.length,
      activeVariantCount: variants.filter(variant => variant.active).length,
      variants
    };
  }

  private transactionOps(draft: State): CatalogTransaction {
    const requireBrand = (brandId: string): void => {
      if (!draft.brands.has(brandId)) throw new MissingReferenceError('brandId', brandId);
    };
    const setLinks = (supplierId: string, brandIds: string[]): void => {
      for (const brandId of brandIds) requireBrand(brandId);
      for (const link of [...draft.links]) {
        if (link.endsWith(`:${supplierId}`)) draft.links.delete(link);
      }
      for (const brandId of brandIds) draft.links.add(`${brandId}:${supplierId}`);
    };

    return {
      findBrand: async id => {
        const row = draft.brands.get(id);
        return row ? this.withCount(draft, row) : undefined;
      },

      createBrand: async (data: NewBrand) => {
        if ([...draft.brands.values()].some(b => b.slug === data.slug)) {
          throw new DuplicateSlugError('marca', data.slug);
        }
        const row: BrandRow = {
          id: randomUUID(),
          name: data.name,
          slug: data.slug,
          logoKey: data.logoKey ?? null,
          isPartner: data.isPartner ?? false,
          sortOrder: data.sortOrder ?? 0,
          active: data.active ?? true,
          productCount: 0
        };
        draft.brands.set(row.id, row);
        return { ...row };
      },

      updateBrand: async (id, patch: BrandPatch) => {
        const row = draft.brands.get(id);
        if (!row) return undefined;
        if (patch.slug && [...draft.brands.values()].some(b => b.slug === patch.slug && b.id !== id)) {
          throw new DuplicateSlugError('marca', patch.slug);
        }
        Object.assign(row, patch);
        return this.withCount(draft, row);
      },

      findSupplier: async id => {
        const row = draft.suppliers.get(id);
        return row ? { ...row } : undefined;
      },

      createSupplier: async (data: NewSupplier) => {
        const row: SupplierRow = {
          id: randomUUID(),
          name: data.name,
          taxId: data.taxId ?? null,
          contactName: data.contactName ?? null,
          whatsapp: data.whatsapp ?? null,
          paymentTerms: data.paymentTerms ?? null,
          notes: data.notes ?? null,
          active: data.active ?? true
        };
        if (data.brandIds) setLinks(row.id, data.brandIds);
        draft.suppliers.set(row.id, row);
        return { ...row };
      },

      updateSupplier: async (id, patch: SupplierPatch) => {
        const row = draft.suppliers.get(id);
        if (!row) return undefined;
        const { brandIds, ...columns } = patch;
        if (brandIds) setLinks(id, brandIds);
        Object.assign(row, columns);
        return { ...row };
      },

      findProduct: async id => {
        const row = draft.products.get(id);
        return row ? this.detail(draft, row) : undefined;
      },

      createProduct: async (data: NewProduct) => {
        if ([...draft.products.values()].some(p => p.slug === data.slug)) {
          throw new DuplicateSlugError('producto', data.slug);
        }
        requireBrand(data.brandId);
        const row: ProductState = {
          id: randomUUID(),
          slug: data.slug,
          brandId: data.brandId,
          category: data.category,
          name: data.name,
          description: data.description ?? '',
          shortDescription: data.shortDescription ?? '',
          specs: data.specs ?? {},
          price: data.price ?? null,
          compareAtPrice: data.compareAtPrice ?? null,
          status: data.status ?? 'draft',
          imageKey: data.imageKey ?? null,
          featured: data.featured ?? false,
          isNewArrival: data.isNewArrival ?? false,
          isBestSeller: data.isBestSeller ?? false,
          tags: data.tags ?? []
        };
        draft.products.set(row.id, row);
        return this.detail(draft, row);
      },

      updateProduct: async (id, patch: ProductPatch) => {
        const row = draft.products.get(id);
        if (!row) return undefined;
        if (patch.slug && [...draft.products.values()].some(p => p.slug === patch.slug && p.id !== id)) {
          throw new DuplicateSlugError('producto', patch.slug);
        }
        if (patch.brandId) requireBrand(patch.brandId);
        Object.assign(row, patch);
        return this.detail(draft, row);
      },

      findVariant: async id => {
        const row = draft.variants.get(id);
        return row ? { ...row } : undefined;
      },

      createVariant: async (data: NewVariant) => {
        if (!draft.products.has(data.productId)) {
          throw new MissingReferenceError('productId', data.productId);
        }
        if ([...draft.variants.values()].some(v => v.productId === data.productId && v.slug === data.slug)) {
          throw new DuplicateSlugError('variante', data.slug);
        }
        const row: AdminVariantRow = {
          id: randomUUID(),
          productId: data.productId,
          kind: data.kind,
          name: data.name,
          slug: data.slug,
          imageKey: data.imageKey ?? null,
          active: data.active ?? true,
          sortOrder: data.sortOrder ?? 0,
          stock: 0
        };
        draft.variants.set(row.id, row);
        return { ...row };
      },

      updateVariant: async (id, patch: VariantPatch) => {
        const row = draft.variants.get(id);
        if (!row) return undefined;
        if (patch.slug && [...draft.variants.values()]
          .some(v => v.productId === row.productId && v.slug === patch.slug && v.id !== id)) {
          throw new DuplicateSlugError('variante', patch.slug);
        }
        Object.assign(row, patch);
        return { ...row };
      },

      audit: {
        write: async record => {
          draft.audits.push(record);
        }
      }
    };
  }
}
