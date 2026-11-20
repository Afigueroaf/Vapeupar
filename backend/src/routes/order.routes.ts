import { NextFunction, Request, Response, Router } from 'express';
import { PublicOrderBodySchema } from '../schemas/order.schema.js';
import { OrderService, orderService as defaultOrderService } from '../services/order.service.js';
import { sendDomainError, sendValidationError } from './admin/http.js';

/**
 * `POST /api/orders`: el sitio registra el pedido antes de abrir WhatsApp
 * (ADR-003). Público y sin sesión, por eso:
 *
 * - tiene su propio límite de peticiones, más estricto que el general (en `app.ts`);
 * - el cuerpo es estricto y no trae precio: lo pone el catálogo;
 * - la respuesta es solo la referencia y el subtotal. Ni identificadores
 *   internos, ni datos del cliente, ni nada de otros pedidos.
 */
export interface OrderRoutesDeps {
  service?: Pick<OrderService, 'submit'>;
}

export function createOrdersPublicRouter(deps: OrderRoutesDeps = {}): Router {
  const service = deps.service ?? defaultOrderService;
  const router = Router();

  // POST /api/orders
  router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = PublicOrderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error, 'Pedido inválido');
      return;
    }
    try {
      const result = await service.submit(parsed.data);
      // 200 y no 201 en un reintento: no se creó nada nuevo.
      res.status(result.replayed ? 200 : 201).json({
        success: true,
        data: { reference: result.reference, subtotal: result.subtotal }
      });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  return router;
}
