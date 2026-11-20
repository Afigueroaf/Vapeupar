/** Pedidos guardados en la base (ADR-003). Enum `OrderStatus` de Prisma. */
export type OrderStatus =
  | 'received'  // llegó desde el sitio; no reserva stock
  | 'confirmed' // confirmado por chat: ya descontó el stock
  | 'delivered' // entregado y cobrado
  | 'cancelled'; // cancelado; si estaba confirmado, devolvió el stock

export const ORDER_STATUSES = ['received', 'confirmed', 'delivered', 'cancelled'] as const satisfies readonly OrderStatus[];

/** Datos personales del cliente (Ley 1581). Nulo en un pedido anonimizado. */
export interface OrderCustomer {
  name: string;
  /** Móvil colombiano normalizado: `+573XXXXXXXXX`. */
  phone: string;
  neighborhood: string;
}

export interface OrderLine {
  id: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  /** Precio de catálogo al recibir el pedido, en pesos. */
  listPrice: number;
  /** Precio unitario cobrado; nulo hasta confirmar. */
  unitPrice: number | null;
}

export interface OrderConsent {
  policyVersion: string;
  purpose: string;
  acceptedAt: Date;
}

export interface Order {
  id: string;
  /** `VP-XXXXXX`. */
  reference: string;
  status: OrderStatus;
  customer: OrderCustomer | null;
  /** Suma de las líneas a precio de catálogo al recibir. */
  subtotal: number;
  /** Domicilio; nulo hasta confirmar. */
  deliveryFee: number | null;
  /** Precio cobrado más domicilio; nulo hasta confirmar. */
  total: number | null;
  cancelReason: string | null;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: OrderLine[];
  /** Nulo solo si faltara la fila de la autorización, que no debería ocurrir. */
  consent: OrderConsent | null;
}
