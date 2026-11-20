import { AuditSink } from '../services/audit.service.js';
import { Order, OrderCustomer, OrderLine, OrderStatus } from '../types/order.types.js';
import { StockTransaction } from './stock.repository.js';

/** Lo que el catálogo dice de una variante al recibir un pedido. */
export interface OrderableVariant {
  variantId: string;
  variantName: string;
  productName: string;
  /** Activa la variante y publicada su línea. */
  orderable: boolean;
  /** Precio de la línea; nulo si no tiene. */
  price: number | null;
  stock: number;
}

export interface NewOrder {
  reference: string;
  submissionKey: string;
  customer: OrderCustomer;
  subtotal: number;
  lines: Omit<OrderLine, 'id' | 'unitPrice'>[];
  consent: { policyVersion: string; purpose: string };
}

/** Lo que cambian las transiciones y la anonimización (columnas con UPDATE para el rol de la app). */
export interface OrderPatch {
  status?: OrderStatus;
  /** `null` anonimiza. */
  customer?: null;
  deliveryFee?: number;
  cancelReason?: string | null;
  confirmedAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  anonymizedAt?: Date;
}

/** Choque con un índice único al insertar: referencia o clave de envío. */
export class DuplicateOrderError extends Error {
  constructor() {
    super('Ya existe un pedido con esa referencia o clave de envío');
    this.name = 'DuplicateOrderError';
  }
}

export interface OrderTransaction {
  /** Libro de inventario en la misma transacción: solo `recordMovementIn` lo usa. */
  stock: StockTransaction;
  /** Lanza `DuplicateOrderError` si choca la referencia o la clave de envío. */
  insertOrder(order: NewOrder): Promise<Order>;
  /** Bloquea el pedido hasta el fin de la transacción. `undefined` si no existe. */
  lockOrder(id: string): Promise<Order | undefined>;
  updateOrder(id: string, patch: OrderPatch): Promise<Order>;
  setLineUnitPrice(lineId: string, unitPrice: number): Promise<void>;
  audit: AuditSink;
}

export interface OrderFilter {
  status?: OrderStatus;
  /** Referencia, nombre o teléfono del cliente. */
  q?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface RetentionCutoffs {
  /** Entregados o cancelados antes de esta fecha. */
  closedBefore: Date;
  /** Recibidos (nunca confirmados) antes de esta fecha. */
  receivedBefore: Date;
}

export interface OrderRepository {
  transaction<T>(work: (tx: OrderTransaction) => Promise<T>): Promise<T>;
  /** Solo las que existen; el orden no importa. */
  findOrderableVariants(variantIds: string[]): Promise<OrderableVariant[]>;
  findById(id: string): Promise<Order | undefined>;
  findBySubmissionKey(submissionKey: string): Promise<Order | undefined>;
  /** Del más reciente al más antiguo. */
  list(filter: OrderFilter): Promise<{ rows: Order[]; total: number }>;
  /** Pedidos sin anonimizar que han superado el plazo de conservación. */
  listRetentionCandidates(cutoffs: RetentionCutoffs): Promise<{ id: string; status: OrderStatus }[]>;
}

/** Precio cobrado más domicilio, o nulo mientras falte alguno. */
export function orderTotal(lines: Pick<OrderLine, 'quantity' | 'unitPrice'>[], deliveryFee: number | null): number | null {
  if (deliveryFee === null || lines.some(l => l.unitPrice === null)) return null;
  return lines.reduce((sum, l) => sum + l.quantity * (l.unitPrice ?? 0), 0) + deliveryFee;
}
