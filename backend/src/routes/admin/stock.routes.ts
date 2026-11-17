import { NextFunction, Request, Response, Router } from 'express';
import { StockService } from '../../services/stock.service.js';
import { StockViewRepository } from '../../repositories/stock-view.repository.js';
import {
  KardexQuerySchema, MovementBodySchema, StockQuerySchema, ThresholdBodySchema, VariantIdSchema
} from '../../schemas/admin/stock.schema.js';
import { requireRole } from '../../middleware/require-role.js';
import { SettingsError, SettingsReader } from '../../services/settings.service.js';
import { sendDomainError, sendValidationError } from './http.js';

/**
 * Inventario para la consola (plan A4.2). Es la superficie que consume la
 * pantalla de stock (A5.1), la primera que se usa a diario.
 *
 * Las dos rutas de lectura pasan por el repositorio de vista; la de escritura,
 * por `StockService`, que es el único autorizado a tocar el libro.
 */
export interface StockRoutesDeps {
  stockService: Pick<StockService, 'recordMovement' | 'getKardex'>;
  stockView: StockViewRepository;
  settings: SettingsReader;
}

export function createStockRouter(deps: StockRoutesDeps): Router {
  const router = Router();

  // GET /api/admin/stock
  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = StockQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error, 'Parámetros de consulta inválidos');
      return;
    }
    const { page, limit, threshold: requested, ...filter } = parsed.data;

    try {
      const configured = await deps.settings.getLowStockThreshold();
      const threshold = requested ?? configured;
      const result = await deps.stockView.list({ ...filter, threshold, limit, offset: (page - 1) * limit });
      res.json({
        success: true,
        data: result.rows,
        pagination: {
          total: result.total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(result.total / limit))
        },
        // `threshold`: el que se aplicó; `configuredThreshold`: el del dueño.
        meta: { threshold, configuredThreshold: configured }
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/admin/stock/threshold — umbral de bajo stock vigente.
  router.get('/threshold', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ success: true, data: { threshold: await deps.settings.getLowStockThreshold() } });
    } catch (error) {
      next(error);
    }
  });

  // PUT /api/admin/stock/threshold — solo el dueño lo cambia (decisión #5).
  router.put('/threshold', requireRole('owner'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = ThresholdBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error, 'Umbral inválido');
      return;
    }
    try {
      const threshold = await deps.settings.setLowStockThreshold(parsed.data.threshold, { userId: req.admin!.userId });
      res.json({ success: true, data: { threshold } });
    } catch (error) {
      if (error instanceof SettingsError) {
        res.status(error.code === 'CONFLICT' ? 409 : 400).json({ success: false, message: error.message, code: error.code });
        return;
      }
      next(error);
    }
  });

  // GET /api/admin/stock/image-alerts
  router.get('/image-alerts', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const variants = await deps.stockView.listMissingVariantImages();
      res.json({ success: true, data: variants, meta: { count: variants.length } });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/admin/stock/movements
  router.post('/movements', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = MovementBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error, 'Movimiento inválido');
      return;
    }
    // `req.admin` existe porque la ruta va detrás de `requireAuth`.
    const userId = req.admin!.userId;

    try {
      // El autor lo pone la sesión, nunca el cuerpo: un movimiento queda firmado
      // por quien lo hizo y eso es lo que audita `AuditLog`.
      const result = await deps.stockService.recordMovement({ ...parsed.data, userId });
      // 200 y no 201 cuando fue un reintento: no se creó nada nuevo.
      res.status(result.replayed ? 200 : 201).json({
        success: true,
        data: { movement: result.movement, stock: result.stock, replayed: result.replayed }
      });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  // GET /api/admin/stock/:variantId/kardex
  router.get('/:variantId/kardex', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = VariantIdSchema.safeParse(req.params);
    if (!params.success) {
      sendValidationError(res, params.error, 'Identificador de variante inválido');
      return;
    }
    const query = KardexQuerySchema.safeParse(req.query);
    if (!query.success) {
      sendValidationError(res, query.error, 'Rango de fechas inválido');
      return;
    }

    try {
      const kardex = await deps.stockService.getKardex(params.data.variantId, query.data);
      res.json({ success: true, data: kardex });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  return router;
}
