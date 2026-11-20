import { randomInt } from 'node:crypto';
import { recordAudit } from './audit.service.js';
import { operationKeyConflict, recordMovementIn } from './stock.service.js';
import { DuplicateOperationKeyError } from '../repositories/stock.repository.js';
import { DuplicateOrderError, OrderFilter, OrderRepository, OrderTransaction } from '../repositories/order.repository.js';
import { PrismaOrderRepository } from '../repositories/prisma-order.repository.js';
import { AdminUser } from '../repositories/user.repository.js';
import { DATA_POLICY_VERSION, DATA_PURPOSE, PublicOrderBody } from '../schemas/order.schema.js';
import { Order } from '../types/order.types.js';

/**
 * Pedidos guardados en la base (ADR-003). Crea el pedido que llega del sitio y
 * lo lleva por sus estados desde la consola. Confirmar y cancelar un pedido
 * confirmado escriben en el libro con `recordMovementIn`, dentro de la misma
 * transacción que el cambio de estado: todas las líneas o ninguna.
 *
 * La auditoría nunca copia nombre, teléfono ni barrio (ADR-003 §4).
 */

export type OrderErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  /** Alguna línea no se puede pedir o no tiene stock; `details` dice cuál. */
  | 'UNAVAILABLE'
  | 'INSUFFICIENT_STOCK'
  /** La transición no sale del estado actual. */
  | 'INVALID_STATE'
  /** Reintento con datos distintos de la operación ya hecha. */
  | 'CONFLICT'
  | 'FORBIDDEN';

export interface OrderLineIssue {
  variantId: string;
  reason: 'unavailable' | 'insufficient_stock';
  /** Disponible actual, en las de stock insuficiente. */
  available?: number;
}

export class OrderError extends Error {
  constructor(
    public readonly code: OrderErrorCode,
    message: string,
    public readonly details?: OrderLineIssue[]
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

/** Plazo de conservación propuesto (ADR-003 §4), ajustable tras la revisión legal. */
export const RETENTION = {
  /** Días tras entregar o cancelar hasta anonimizar. */
  closedDays: 365,
  /** Días que un pedido recibido sin confirmar espera antes de caducar. */
  receivedDays: 30
} as const;

export const EXPIRED_REASON = 'Caducado sin confirmar';

/** Mismo alfabeto que `frontend/src/lib/order-message.ts`: sin 0/O ni 1/I/L. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const REFERENCE_PATTERN = /^VP-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

export function generateReference(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `VP-${code}`;
}

/** Intentos ante una colisión de referencia: con 31^6 combinaciones, dos ya es raro. */
const REFERENCE_ATTEMPTS = 5;

export interface Actor {
  userId: string;
  role: AdminUser['role'];
}

export interface ConfirmInput {
  deliveryFee: number;
  lines?: { variantId: string; unitPrice: number }[];
}

export interface TransitionResult {
  order: Order;
  /** `true` si el pedido ya estaba así con los mismos datos: no se escribió nada. */
  replayed: boolean;
  /** Si la operación movió stock (para avisar al sitio). */
  stockChanged: boolean;
}

export interface SubmitResult {
  reference: string;
  subtotal: number;
  replayed: boolean;
}

const saleKey = (orderId: string, variantId: string) => `order:${orderId}:sale:${variantId}`;
const returnKey = (orderId: string, variantId: string) => `order:${orderId}:return:${variantId}`;

const DAY_MS = 24 * 60 * 60 * 1000;

function sameLines(order: Order, body: PublicOrderBody): boolean {
  if (order.lines.length !== body.lines.length) return false;
  const wanted = new Map(body.lines.map(l => [l.variantId, l.quantity]));
  return order.lines.every(l => wanted.get(l.variantId) === l.quantity);
}

export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly options: { now?: () => Date; reference?: () => string } = {}
  ) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  // ---- Público

  /** Crea el pedido que envía el sitio. El cuerpo ya viene validado por `PublicOrderBodySchema`. */
  public async submit(body: PublicOrderBody): Promise<SubmitResult> {
    const previous = await this.replayOf(body);
    if (previous) return previous;

    const variants = new Map(
      (await this.repository.findOrderableVariants(body.lines.map(l => l.variantId))).map(v => [v.variantId, v])
    );
    const issues: OrderLineIssue[] = [];
    for (const line of body.lines) {
      const variant = variants.get(line.variantId);
      if (!variant || !variant.orderable || variant.price === null) {
        issues.push({ variantId: line.variantId, reason: 'unavailable' });
      } else if (variant.stock < line.quantity) {
        issues.push({ variantId: line.variantId, reason: 'insufficient_stock', available: Math.max(variant.stock, 0) });
      }
    }
    if (issues.length > 0) {
      throw new OrderError('UNAVAILABLE', 'Algunos productos del pedido ya no están disponibles', issues);
    }

    const lines = body.lines.map(line => {
      const variant = variants.get(line.variantId)!;
      return {
        variantId: line.variantId,
        quantity: line.quantity,
        listPrice: variant.price!,
        productName: variant.productName,
        variantName: variant.variantName
      };
    });
    const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.listPrice, 0);

    for (let attempt = 1; ; attempt++) {
      const reference = (this.options.reference ?? generateReference)();
      try {
        const order = await this.repository.transaction(async tx => {
          const created = await tx.insertOrder({
            reference,
            submissionKey: body.submissionKey,
            customer: body.customer,
            subtotal,
            lines,
            consent: { policyVersion: body.consent.policyVersion, purpose: DATA_PURPOSE }
          });
          await recordAudit(tx.audit, {
            userId: null,
            entity: 'order',
            entityId: created.id,
            action: 'order.create',
            after: {
              reference: created.reference,
              status: created.status,
              subtotal,
              lines: lines.map(l => ({ variantId: l.variantId, quantity: l.quantity, listPrice: l.listPrice })),
              policyVersion: DATA_POLICY_VERSION
            }
          });
          return created;
        });
        return { reference: order.reference, subtotal: order.subtotal, replayed: false };
      } catch (error) {
        if (!(error instanceof DuplicateOrderError)) throw error;
        // La misma clave en paralelo: el otro envío ganó y este es su reintento.
        const replay = await this.replayOf(body);
        if (replay) return replay;
        if (attempt >= REFERENCE_ATTEMPTS) throw error;
      }
    }
  }

  private async replayOf(body: PublicOrderBody): Promise<SubmitResult | undefined> {
    const existing = await this.repository.findBySubmissionKey(body.submissionKey);
    if (!existing) return undefined;
    if (!sameLines(existing, body)) {
      throw new OrderError('CONFLICT', 'Ese envío ya se registró con otros productos');
    }
    return { reference: existing.reference, subtotal: existing.subtotal, replayed: true };
  }

  // ---- Consola

  public list(filter: OrderFilter): Promise<{ rows: Order[]; total: number }> {
    return this.repository.list(filter);
  }

  public async get(id: string): Promise<Order> {
    const order = await this.repository.findById(id);
    if (!order) throw new OrderError('NOT_FOUND', 'Pedido no encontrado');
    return order;
  }

  /**
   * `received` → `confirmed`: descuenta el stock de todas las líneas con el
   * precio cobrado y fija el domicilio. Cobrar otro precio que el de catálogo
   * exige owner.
   */
  public async confirm(id: string, input: ConfirmInput, actor: Actor): Promise<TransitionResult> {
    return this.inTransaction(async tx => {
      const order = await this.lock(tx, id);

      const overrides = new Map((input.lines ?? []).map(l => [l.variantId, l.unitPrice]));
      for (const variantId of overrides.keys()) {
        if (!order.lines.some(l => l.variantId === variantId)) {
          throw new OrderError('VALIDATION', `La variante ${variantId} no está en el pedido`);
        }
      }
      const prices = new Map(order.lines.map(l => [l.id, overrides.get(l.variantId) ?? l.listPrice]));
      if (actor.role !== 'owner' && order.lines.some(l => prices.get(l.id) !== l.listPrice)) {
        throw new OrderError('FORBIDDEN', 'Cobrar un precio distinto del de catálogo exige rol owner');
      }

      if (order.status === 'confirmed') {
        const same = order.deliveryFee === input.deliveryFee && order.lines.every(l => l.unitPrice === prices.get(l.id));
        if (!same) throw new OrderError('CONFLICT', 'El pedido ya se confirmó con otro domicilio o precio');
        return { order, replayed: true, stockChanged: false };
      }
      if (order.status !== 'received') {
        throw new OrderError('INVALID_STATE', `Un pedido ${order.status} no se puede confirmar`);
      }

      // En orden de variante: dos confirmaciones que comparten variantes las
      // bloquean en el mismo orden y no se interbloquean.
      const lines = [...order.lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
      const issues: OrderLineIssue[] = [];
      for (const line of lines) {
        const variant = await tx.stock.lockVariant(line.variantId);
        const available = variant?.stockCache ?? 0;
        if (available < line.quantity) {
          issues.push({ variantId: line.variantId, reason: 'insufficient_stock', available: Math.max(available, 0) });
        }
      }
      if (issues.length > 0) {
        const names = issues
          .map(i => order.lines.find(l => l.variantId === i.variantId)!)
          .map(l => `${l.productName} ${l.variantName}`)
          .join(', ');
        throw new OrderError('INSUFFICIENT_STOCK', `Sin stock suficiente: ${names}. No se registró ninguna línea`, issues);
      }

      const movements: string[] = [];
      for (const line of lines) {
        const unitPrice = prices.get(line.id)!;
        const result = await recordMovementIn(tx.stock, {
          variantId: line.variantId,
          type: 'sale',
          quantity: line.quantity,
          unitPrice,
          lot: order.reference,
          userId: actor.userId,
          operationKey: saleKey(order.id, line.variantId)
        });
        movements.push(result.movement.id);
        await tx.setLineUnitPrice(line.id, unitPrice);
      }

      const updated = await tx.updateOrder(order.id, {
        status: 'confirmed',
        deliveryFee: input.deliveryFee,
        confirmedAt: this.now()
      });
      await recordAudit(tx.audit, {
        userId: actor.userId,
        entity: 'order',
        entityId: order.id,
        action: 'order.confirm',
        before: { status: order.status },
        after: {
          status: updated.status,
          deliveryFee: updated.deliveryFee,
          total: updated.total,
          lines: updated.lines.map(l => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
          movements
        }
      });
      return { order: updated, replayed: false, stockChanged: true };
    });
  }

  /** `confirmed` → `delivered`. */
  public async deliver(id: string, actor: Actor): Promise<TransitionResult> {
    return this.inTransaction(async tx => {
      const order = await this.lock(tx, id);
      if (order.status === 'delivered') return { order, replayed: true, stockChanged: false };
      if (order.status !== 'confirmed') {
        throw new OrderError('INVALID_STATE', `Un pedido ${order.status} no se puede marcar entregado`);
      }
      const updated = await tx.updateOrder(order.id, { status: 'delivered', deliveredAt: this.now() });
      await recordAudit(tx.audit, {
        userId: actor.userId, entity: 'order', entityId: order.id, action: 'order.deliver',
        before: { status: order.status }, after: { status: updated.status }
      });
      return { order: updated, replayed: false, stockChanged: false };
    });
  }

  /**
   * `received` o `confirmed` → `cancelled`. Si estaba confirmado, devuelve el
   * stock de todas las líneas con movimientos `return` de la misma referencia.
   */
  public async cancel(id: string, input: { reason?: string }, actor: Actor): Promise<TransitionResult> {
    return this.inTransaction(tx => this.cancelIn(tx, id, input.reason ?? null, actor.userId));
  }

  private async cancelIn(tx: OrderTransaction, id: string, reason: string | null, userId: string | null): Promise<TransitionResult> {
    const order = await this.lock(tx, id);
    if (order.status === 'cancelled') return { order, replayed: true, stockChanged: false };
    if (order.status === 'delivered') {
      throw new OrderError(
        'INVALID_STATE',
        'Un pedido entregado no se cancela: registra la devolución como movimiento con la referencia en el lote'
      );
    }

    const wasConfirmed = order.status === 'confirmed';
    const movements: string[] = [];
    if (wasConfirmed) {
      if (!userId) throw new Error('Devolver stock exige un usuario');
      for (const line of [...order.lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
        const result = await recordMovementIn(tx.stock, {
          variantId: line.variantId,
          type: 'return',
          quantity: line.quantity,
          reason: `Cancelación del pedido ${order.reference}`,
          lot: order.reference,
          userId,
          operationKey: returnKey(order.id, line.variantId)
        });
        movements.push(result.movement.id);
      }
    }

    const updated = await tx.updateOrder(order.id, { status: 'cancelled', cancelledAt: this.now(), cancelReason: reason });
    await recordAudit(tx.audit, {
      userId,
      entity: 'order',
      entityId: order.id,
      action: 'order.cancel',
      // El motivo es texto libre y podría llevar datos del cliente: no se copia.
      before: { status: order.status },
      after: { status: updated.status, stockReturned: wasConfirmed, movements }
    });
    return { order: updated, replayed: false, stockChanged: wasConfirmed };
  }

  /** Supresión a petición del titular: solo pedidos cerrados (ADR-003 §4). */
  public async anonymize(id: string, actor: Actor): Promise<TransitionResult> {
    return this.inTransaction(tx => this.anonymizeIn(tx, id, actor.userId, 'order.anonymize'));
  }

  private async anonymizeIn(tx: OrderTransaction, id: string, userId: string | null, action: string): Promise<TransitionResult> {
    const order = await this.lock(tx, id);
    if (order.anonymizedAt) return { order, replayed: true, stockChanged: false };
    if (order.status !== 'delivered' && order.status !== 'cancelled') {
      throw new OrderError('INVALID_STATE', 'Solo se anonimiza un pedido entregado o cancelado: cancélalo primero');
    }
    // El motivo de cancelación es texto libre: se borra con el resto, salvo el
    // de caducidad, que pone el sistema y no dice nada del cliente.
    const cancelReason = order.cancelReason === EXPIRED_REASON ? EXPIRED_REASON : null;
    const updated = await tx.updateOrder(order.id, { customer: null, cancelReason, anonymizedAt: this.now() });
    await recordAudit(tx.audit, {
      userId, entity: 'order', entityId: order.id, action,
      before: { anonymized: false }, after: { anonymized: true }
    });
    return { order: updated, replayed: false, stockChanged: false };
  }

  /**
   * Aplica el plazo de conservación: anonimiza los cerrados hace más de
   * `RETENTION.closedDays` y cancela y anonimiza los recibidos sin confirmar
   * hace más de `RETENTION.receivedDays`. Un pedido por transacción: si uno
   * falla, los anteriores ya quedaron hechos y repetir continúa.
   */
  public async applyRetention(actor: Actor): Promise<{ cancelled: number; anonymized: number }> {
    const now = this.now().getTime();
    const candidates = await this.repository.listRetentionCandidates({
      closedBefore: new Date(now - RETENTION.closedDays * DAY_MS),
      receivedBefore: new Date(now - RETENTION.receivedDays * DAY_MS)
    });
    let cancelled = 0;
    let anonymized = 0;
    for (const candidate of candidates) {
      await this.inTransaction(async tx => {
        if (candidate.status === 'received') {
          const result = await this.cancelIn(tx, candidate.id, EXPIRED_REASON, actor.userId);
          if (!result.replayed) cancelled++;
        }
        const result = await this.anonymizeIn(tx, candidate.id, actor.userId, 'order.retention');
        if (!result.replayed) anonymized++;
      });
    }
    return { cancelled, anonymized };
  }

  private async lock(tx: OrderTransaction, id: string): Promise<Order> {
    const order = await tx.lockOrder(id);
    if (!order) throw new OrderError('NOT_FOUND', 'Pedido no encontrado');
    return order;
  }

  private async inTransaction<T>(work: (tx: OrderTransaction) => Promise<T>): Promise<T> {
    try {
      return await this.repository.transaction(work);
    } catch (error) {
      // Un `StockError` del libro sale tal cual: la transacción ya se revirtió.
      if (error instanceof DuplicateOperationKeyError) throw operationKeyConflict(error.operationKey);
      throw error;
    }
  }
}

export const orderService = new OrderService(new PrismaOrderRepository());
