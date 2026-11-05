import { NextFunction, Request, Response, Router } from 'express';
import { requireRole } from '../../middleware/require-role.js';
import { InventoryNoteService } from '../../services/inventory-note.service.js';
import { InventoryNoteBodySchema, InventoryNoteIdSchema, InventoryNoteQuerySchema } from '../../schemas/admin/inventory-note.schema.js';
import { parseOrFail, sendDomainError } from './http.js';

export function createInventoryNotesRouter(deps: { service: InventoryNoteService }): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = parseOrFail(InventoryNoteQuerySchema, req.query, res, 'Parámetros de consulta inválidos');
    if (!query) return;
    try {
      res.json({ success: true, data: await deps.service.list(query) });
    } catch (error) { next(error); }
  });

  router.post('/', requireRole('owner'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = parseOrFail(InventoryNoteBodySchema, req.body, res, 'Nota de inventario inválida');
    if (!body) return;
    try {
      res.status(201).json({ success: true, data: await deps.service.create({ variantId: body.variantId ?? null, text: body.text }, req.admin!.userId) });
    } catch (error) { if (!sendDomainError(res, error)) next(error); }
  });

  router.patch('/:id/resolve', requireRole('owner'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(InventoryNoteIdSchema, req.params, res, 'Identificador de nota inválido');
    if (!params) return;
    try {
      res.json({ success: true, data: await deps.service.resolve(params.id, req.admin!.userId) });
    } catch (error) { if (!sendDomainError(res, error)) next(error); }
  });
  return router;
}
