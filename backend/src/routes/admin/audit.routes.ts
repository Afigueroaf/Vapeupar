import { NextFunction, Request, Response, Router } from 'express';
import { requireRole } from '../../middleware/require-role.js';
import { AuditViewRepository } from '../../repositories/audit-view.repository.js';
import { AuditQuerySchema } from '../../schemas/admin/audit.schema.js';
import { parseOrFail, sendPage } from './http.js';

/**
 * Registro de auditoría (plan A4.2). Solo lectura y solo para `owner`: es el
 * rastro de quién cambió qué, y no tendría sentido que lo editara quien queda
 * registrado en él. La tabla tampoco admite modificación ni borrado para el rol
 * de la aplicación (ADR-002).
 */
export interface AuditRoutesDeps {
  audit: AuditViewRepository;
}

export function createAuditRouter(deps: AuditRoutesDeps): Router {
  const router = Router();

  router.use(requireRole('owner'));

  // GET /api/admin/audit
  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = parseOrFail(AuditQuerySchema, req.query, res, 'Parámetros de consulta inválidos');
    if (!query) return;
    const { page, limit, ...filter } = query;

    try {
      sendPage(res, await deps.audit.list({ ...filter, limit, offset: (page - 1) * limit }), { page, limit });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
