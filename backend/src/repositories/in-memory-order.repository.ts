import { randomUUID } from 'node:crypto';
import { Order, OrderStatus } from '../types/order.types.js';
import { InMemoryStockRepository } from './in-memory-stock.repository.js';
import {
  DuplicateOrderError, NewOrder, OrderFilter, OrderPatch, OrderRepository, OrderTransaction, OrderableVariant,
  RetentionCutoffs, orderTotal
} from './order.repository.js';

interface ProductState {
  price: number | null;
  published: boolean;
}

/** El pedido guardado lleva su clave de envío, que no forma parte del contrato de `Order`. */
type Stored = Order & { submissionKey: string };

function cloneOrder<T extends Order>(order: T): T {
  return {
    ...order,
    customer: order.customer && { ...order.customer },
    lines: order.lines.map(l => ({ ...l })),
    consent: order.consent && { ...order.consent }
  };
}

function toOrder(stored: Stored): Order {
  const { submissionKey: _key, ...order } = cloneOrder(stored);
  return { ...order, total: orderTotal(order.lines, order.deliveryFee) };
}

/**
 * Repositorio de pedidos en memoria para tests. Comparte el libro con un
 * `InMemoryStockRepository`: la transacción del pedido corre dentro de la del
 * libro, así que ambas se confirman juntas o se revierten juntas, y se
 * serializan como el bloqueo de fila.
 */
export class InMemoryOrderRepository implements OrderRepository {
  private orders = new Map<string, Stored>();
  private readonly products = new Map<string, ProductState>();

  constructor(
    private readonly stock: InMemoryStockRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  // --- Ayudas de test

  /** Precio y publicación de una línea; las variantes viven en el repositorio de stock. */
  public setProduct(productId: string, state: ProductState): void {
    this.products.set(productId, state);
  }

  /** Mueve fechas de un pedido para probar el plazo de conservación. */
  public backdate(id: string, dates: Partial<Pick<Order, 'createdAt' | 'deliveredAt' | 'cancelledAt'>>): void {
    const order = this.orders.get(id);
    if (order) Object.assign(order, dates);
  }

  public get all(): Order[] {
    return [...this.orders.values()].map(toOrder);
  }

  // --- OrderRepository

  public transaction<T>(work: (tx: OrderTransaction) => Promise<T>): Promise<T> {
    return this.stock.transaction(async stockTx => {
      const draft = new Map([...this.orders].map(([id, o]) => [id, cloneOrder(o)]));
      const result = await work(this.ops(draft, stockTx));
      this.orders = draft;
      return result;
    });
  }

  public async findOrderableVariants(variantIds: string[]): Promise<OrderableVariant[]> {
    const found: OrderableVariant[] = [];
    for (const id of variantIds) {
      const variant = this.stock.variant(id);
      if (!variant) continue;
      const product = this.products.get(variant.productId);
      found.push({
        variantId: variant.id,
        variantName: variant.name,
        productName: variant.productName,
        orderable: variant.active && !!product?.published,
        price: product?.price ?? null,
        stock: variant.stockCache
      });
    }
    return found;
  }

  public async findById(id: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    return order && toOrder(order);
  }

  public async findBySubmissionKey(submissionKey: string): Promise<Order | undefined> {
    const order = [...this.orders.values()].find(o => o.submissionKey === submissionKey);
    return order && toOrder(order);
  }

  public async list(filter: OrderFilter): Promise<{ rows: Order[]; total: number }> {
    const q = filter.q?.toLowerCase();
    const digits = filter.q?.replace(/\D/g, '');
    const matches = [...this.orders.values()].filter(o => {
      if (filter.status && o.status !== filter.status) return false;
      if (filter.from && o.createdAt < filter.from) return false;
      if (filter.to && o.createdAt > filter.to) return false;
      if (q) {
        const hit = o.reference.toLowerCase().includes(q)
          || (o.customer?.name.toLowerCase().includes(q) ?? false)
          || (!!digits && digits.length >= 3 && (o.customer?.phone.includes(digits) ?? false));
        if (!hit) return false;
      }
      return true;
    });
    const ordered = matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    return {
      rows: ordered.slice(filter.offset, filter.offset + filter.limit).map(o => toOrder(o)),
      total: matches.length
    };
  }

  public async listRetentionCandidates(cutoffs: RetentionCutoffs): Promise<{ id: string; status: OrderStatus }[]> {
    return [...this.orders.values()]
      .filter(o => {
        if (o.anonymizedAt) return false;
        if (o.status === 'received') return o.createdAt < cutoffs.receivedBefore;
        const closedAt = o.deliveredAt ?? o.cancelledAt;
        return (o.status === 'delivered' || o.status === 'cancelled') && !!closedAt && closedAt < cutoffs.closedBefore;
      })
      .map(o => ({ id: o.id, status: o.status }));
  }

  private ops(draft: Map<string, Stored>, stockTx: OrderTransaction['stock']): OrderTransaction {
    const get = (id: string): Stored => {
      const order = draft.get(id);
      if (!order) throw new Error(`Pedido ${id} inexistente`);
      return order;
    };
    return {
      stock: stockTx,
      audit: stockTx.audit,
      insertOrder: async (input: NewOrder) => {
        const taken = [...draft.values()].some(o => o.reference === input.reference || o.submissionKey === input.submissionKey);
        if (taken) throw new DuplicateOrderError();
        const now = this.now();
        const order: Stored = {
          id: randomUUID(),
          submissionKey: input.submissionKey,
          reference: input.reference,
          status: 'received',
          customer: { ...input.customer },
          subtotal: input.subtotal,
          deliveryFee: null,
          total: null,
          cancelReason: null,
          confirmedAt: null,
          deliveredAt: null,
          cancelledAt: null,
          anonymizedAt: null,
          createdAt: now,
          updatedAt: now,
          lines: input.lines.map(l => ({ ...l, id: randomUUID(), unitPrice: null })),
          consent: { ...input.consent, acceptedAt: now }
        };
        draft.set(order.id, order);
        return toOrder(order);
      },
      lockOrder: async id => {
        const order = draft.get(id);
        return order && toOrder(order);
      },
      updateOrder: async (id, patch: OrderPatch) => {
        const order = get(id);
        const { customer, ...rest } = patch;
        Object.assign(order, rest, { updatedAt: this.now() });
        if (customer === null) order.customer = null;
        return toOrder(order);
      },
      setLineUnitPrice: async (lineId, unitPrice) => {
        for (const order of draft.values()) {
          const line = order.lines.find(l => l.id === lineId);
          if (line) {
            line.unitPrice = unitPrice;
            return;
          }
        }
        throw new Error(`Línea ${lineId} inexistente`);
      }
    };
  }
}
