import { NextFunction, Request, Response, Router } from 'express';
import { requireOwnerOrFields, requireRole } from '../../middleware/require-role.js';
import { CatalogRepository } from '../../repositories/catalog.repository.js';
import {
  IdParamSchema, SupplierBodySchema, SupplierPatchSchema, SupplierQuerySchema
} from '../../schemas/admin/catalog.schema.js';
import { CatalogService } from '../../services/catalog.service.js';
import { parseOrFail, sendDomainError, sendPage } from './http.js';

/**
 * Proveedores (plan A4.2, pantalla A5.2). Marca y proveedor son entidades
 * distintas: un distribuidor puede traer varias marcas, y ese vínculo se envía
 * completo en `brandIds`.
 *
 * La ficha incluye el último ingreso que firmó, que es lo que A5.2 quiere ver
 * por proveedor. «Variantes abastecidas» queda para esa fase, que es la que
 * define cómo se presenta.
 *
 * Escribir es de `owner`, salvo `imageKey`, que también puede cambiar el
 * `operator` (§4.5 del traspaso de imágenes 2026-10-27).
 *
 * **No hay DELETE**: el libro de inventario referencia al proveedor con
 * `onDelete: Restrict`, así que retirarlo es `active: false`.
 */
export interface SupplierRoutesDeps {
  catalog: CatalogRepository;
  service: Pick<CatalogService, 'createSupplier' | 'updateSupplier'>;
}

export function createSuppliersRouter(deps: SupplierRoutesDeps): Router {
  const router = Router();

  // GET /api/admin/suppliers
  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = parseOrFail(SupplierQuerySchema, req.query, res, 'Parámetros de consulta inválidos');
    if (!query) return;
    const { page, limit, ...filter } = query;

    try {
      sendPage(res, await deps.catalog.listSuppliers({ ...filter, limit, offset: (page - 1) * limit }), { page, limit });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/admin/suppliers/:id
  router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(IdParamSchema, req.params, res, 'Identificador de proveedor inválido');
    if (!params) return;

    try {
      const supplier = await deps.catalog.findSupplier(params.id);
      if (!supplier) {
        res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
        return;
      }
      res.json({ success: true, data: supplier });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/admin/suppliers
  router.post('/', requireRole('owner'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = parseOrFail(SupplierBodySchema, req.body, res, 'Proveedor inválido');
    if (!body) return;

    try {
      const supplier = await deps.service.createSupplier(body, { userId: req.admin!.userId });
      res.status(201).json({ success: true, data: supplier });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  // PATCH /api/admin/suppliers/:id
  router.patch('/:id', requireOwnerOrFields('imageKey'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(IdParamSchema, req.params, res, 'Identificador de proveedor inválido');
    if (!params) return;
    const patch = parseOrFail(SupplierPatchSchema, req.body, res, 'Cambios inválidos');
    if (!patch) return;

    try {
      const supplier = await deps.service.updateSupplier(params.id, patch, { userId: req.admin!.userId });
      res.json({ success: true, data: supplier });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  return router;
}
