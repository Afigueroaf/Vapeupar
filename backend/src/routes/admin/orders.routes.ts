import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/require-role.js';
import {
  CancelOrderBodySchema, ConfirmOrderBodySchema, EmptyBodySchema, OrderIdSchema, OrderListQuerySchema
} from '../../schemas/admin/order.schema.js';
import { Actor, OrderService, TransitionResult } from '../../services/order.service.js';
import { SiteRevalidator } from '../../services/site-revalidation.service.js';
import { parseOrFail, revalidateSite, sendDomainError, sendPage } from './http.js';

/**
 * Pedidos en la consola (ADR-003 §2). Todo va detrás de `requireAuth`.
 *
 * - Leer, confirmar, entregar y cancelar: owner y operator (es el trabajo
 *   diario). Cobrar otro precio que el de catálogo exige owner; lo comprueba el
 *   servicio, que es quien conoce el precio de lista.
 * - Anonimizar y aplicar el plazo de conservación: solo owner.
 *
 * Confirmar y cancelar un pedido confirmado mueven stock: tras la transacción
 * se avisa al sitio (`catalogo`, A7.3) sin que un fallo cambie la respuesta.
 */
export type OrderAdminService = Pick<
  OrderService, 'list' | 'get' | 'confirm' | 'deliver' | 'cancel' | 'anonymize' | 'applyRetention'
>;

export interface OrdersRoutesDeps {
  service: OrderAdminService;
  revalidate: SiteRevalidator;
}

function actorOf(req: Request): Actor {
  // `req.admin` existe porque la ruta va detrás de `requireAuth`.
  return { userId: req.admin!.userId, role: req.admin!.role };
}

export function createOrdersRouter(deps: OrdersRoutesDeps): Router {
  const router = Router();

  /** Una transición: valida id y cuerpo, ejecuta y responde con el pedido. */
  const transition = <S extends z.ZodType>(
    bodySchema: S,
    run: (id: string, body: z.output<S>, actor: Actor) => Promise<TransitionResult>
  ) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(OrderIdSchema, req.params, res, 'Identificador de pedido inválido');
    if (!params) return;
    const body = parseOrFail(bodySchema, req.body ?? {}, res, 'Datos inválidos');
    if (body === undefined) return;
    try {
      const result = await run(params.id, body, actorOf(req));
      // También en un reintento de confirmar: si el primer aviso se perdió, este lo repara.
      const revalidated = result.stockChanged || (result.replayed && result.order.status === 'confirmed')
        ? await revalidateSite(deps.revalidate, ['catalogo'])
        : false;
      res.json({ success: true, data: result.order, meta: { replayed: result.replayed, revalidated } });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  };

  // GET /api/admin/orders
  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = parseOrFail(OrderListQuerySchema, req.query, res, 'Parámetros de consulta inválidos');
    if (!query) return;
    const { page, limit, ...filter } = query;
    try {
      sendPage(res, await deps.service.list({ ...filter, limit, offset: (page - 1) * limit }), { page, limit });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/admin/orders/retention — plazo de conservación (ADR-003 §4).
  // Va antes de `/:id` para que «retention» no se lea como identificador.
  router.post('/retention', requireRole('owner'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (parseOrFail(EmptyBodySchema, req.body ?? {}, res, 'Esta operación no lleva datos') === undefined) return;
    try {
      res.json({ success: true, data: await deps.service.applyRetention(actorOf(req)) });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/admin/orders/:id
  router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(OrderIdSchema, req.params, res, 'Identificador de pedido inválido');
    if (!params) return;
    try {
      res.json({ success: true, data: await deps.service.get(params.id) });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  // POST /api/admin/orders/:id/confirm
  router.post('/:id/confirm', transition(ConfirmOrderBodySchema, (id, body, actor) => deps.service.confirm(id, body, actor)));

  // POST /api/admin/orders/:id/deliver
  router.post('/:id/deliver', transition(EmptyBodySchema, (id, _body, actor) => deps.service.deliver(id, actor)));

  // POST /api/admin/orders/:id/cancel
  router.post('/:id/cancel', transition(CancelOrderBodySchema, (id, body, actor) => deps.service.cancel(id, body, actor)));

  // POST /api/admin/orders/:id/anonymize — supresión a petición del titular.
  router.post('/:id/anonymize', requireRole('owner'),
    transition(EmptyBodySchema, (id, _body, actor) => deps.service.anonymize(id, actor)));

  return router;
}
