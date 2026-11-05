import { NextFunction, Request, Response, Router } from 'express';
import { requireOwnerOrFields, requireRole } from '../../middleware/require-role.js';
import { CatalogRepository } from '../../repositories/catalog.repository.js';
import { BrandPatchSchema, BrandBodySchema, BrandQuerySchema, IdParamSchema } from '../../schemas/admin/catalog.schema.js';
import { CatalogService } from '../../services/catalog.service.js';
import { parseOrFail, sendDomainError, sendPage } from './http.js';

/**
 * Marcas (plan A4.2, pantalla A5.2). Leer es para cualquier sesión; escribir,
 * solo para `owner`, con una excepción: el `operator` puede cambiar `logoKey`
 * y nada más, porque las imágenes las gestiona quien está en el inventario
 * diario (§4.5 del traspaso de imágenes 2026-10-27).
 *
 * **No hay DELETE**: `Product.brandId` referencia la marca con
 * `onDelete: Restrict`, así que retirar una marca es `active: false`.
 */
export interface BrandRoutesDeps {
  catalog: CatalogRepository;
  service: Pick<CatalogService, 'createBrand' | 'updateBrand'>;
}

export function createBrandsRouter(deps: BrandRoutesDeps): Router {
  const router = Router();

  // GET /api/admin/brands
  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = parseOrFail(BrandQuerySchema, req.query, res, 'Parámetros de consulta inválidos');
    if (!query) return;
    const { page, limit, ...filter } = query;

    try {
      sendPage(res, await deps.catalog.listBrands({ ...filter, limit, offset: (page - 1) * limit }), { page, limit });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/admin/brands/:id
  router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(IdParamSchema, req.params, res, 'Identificador de marca inválido');
    if (!params) return;

    try {
      const brand = await deps.catalog.findBrand(params.id);
      if (!brand) {
        res.status(404).json({ success: false, message: 'Marca no encontrada' });
        return;
      }
      res.json({ success: true, data: brand });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/admin/brands
  router.post('/', requireRole('owner'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Se valida aquí para responder campo a campo, y lo que viaja al servicio
    // es ya el dato validado: con los valores por defecto puestos y sin claves
    // de más. El servicio lo vuelve a validar porque también lo llaman scripts.
    const body = parseOrFail(BrandBodySchema, req.body, res, 'Marca inválida');
    if (!body) return;

    try {
      const brand = await deps.service.createBrand(body, { userId: req.admin!.userId });
      res.status(201).json({ success: true, data: brand });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  // PATCH /api/admin/brands/:id
  router.patch('/:id', requireOwnerOrFields('logoKey'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(IdParamSchema, req.params, res, 'Identificador de marca inválido');
    if (!params) return;
    const patch = parseOrFail(BrandPatchSchema, req.body, res, 'Cambios inválidos');
    if (!patch) return;

    try {
      const brand = await deps.service.updateBrand(params.id, patch, { userId: req.admin!.userId });
      res.json({ success: true, data: brand });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  return router;
}
