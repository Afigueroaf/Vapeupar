import { NextFunction, Request, Response, Router } from 'express';
import { requireOwnerOrFields, requireRole } from '../../middleware/require-role.js';
import { CatalogRepository } from '../../repositories/catalog.repository.js';
import {
  IdParamSchema, ProductBodySchema, ProductPatchSchema, ProductQuerySchema, VariantBodySchema,
  VariantParamsSchema, VariantPatchSchema
} from '../../schemas/admin/catalog.schema.js';
import { CatalogService, readiness } from '../../services/catalog.service.js';
import { parseOrFail, sendDomainError, sendPage } from './http.js';

/**
 * Líneas de producto y sus variantes (plan A4.2, pantalla A5.3).
 *
 * El detalle incluye `readiness`: qué le falta a la línea para poder
 * publicarse (precio, imagen, al menos una variante activa). Así la consola
 * puede avisar antes de que alguien intente publicar, que es lo que pide A5.3,
 * y la misma regla la impone el servicio al publicar de verdad.
 *
 * El **precio** solo se escribe por aquí, y cada cambio de precio o de estado
 * de publicación queda auditado con autor (A3.2).
 *
 * Escribir es de `owner`, salvo `imageKey` de la línea y de la variante, que
 * también puede cambiar el `operator` (§4.5 del traspaso de imágenes
 * 2026-10-27): es quien registra el ingreso y adjunta la foto.
 *
 * **No hay DELETE**: las variantes están referenciadas por el libro de
 * inventario con `onDelete: Restrict`. Retirar una variante es `active: false`
 * y retirar una línea es `status: 'draft'`.
 */
export interface ProductRoutesDeps {
  catalog: CatalogRepository;
  service: Pick<CatalogService, 'createProduct' | 'updateProduct' | 'createVariant' | 'updateVariant'>;
}

export function createProductsRouter(deps: ProductRoutesDeps): Router {
  const router = Router();

  // GET /api/admin/products
  router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = parseOrFail(ProductQuerySchema, req.query, res, 'Parámetros de consulta inválidos');
    if (!query) return;
    const { page, limit, ...filter } = query;

    try {
      sendPage(res, await deps.catalog.listProducts({ ...filter, limit, offset: (page - 1) * limit }), { page, limit });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/admin/products/:id
  router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(IdParamSchema, req.params, res, 'Identificador de línea inválido');
    if (!params) return;

    try {
      const product = await deps.catalog.findProduct(params.id);
      if (!product) {
        res.status(404).json({ success: false, message: 'Línea no encontrada' });
        return;
      }
      res.json({ success: true, data: product, meta: { readiness: readiness(product) } });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/admin/products
  router.post('/', requireRole('owner'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = parseOrFail(ProductBodySchema, req.body, res, 'Línea inválida');
    if (!body) return;

    try {
      const product = await deps.service.createProduct(body, { userId: req.admin!.userId });
      res.status(201).json({ success: true, data: product, meta: { readiness: readiness(product) } });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  // PATCH /api/admin/products/:id
  router.patch('/:id', requireOwnerOrFields('imageKey'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(IdParamSchema, req.params, res, 'Identificador de línea inválido');
    if (!params) return;
    const patch = parseOrFail(ProductPatchSchema, req.body, res, 'Cambios inválidos');
    if (!patch) return;

    try {
      const product = await deps.service.updateProduct(params.id, patch, { userId: req.admin!.userId });
      res.json({ success: true, data: product, meta: { readiness: readiness(product) } });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  // GET /api/admin/products/:id/variants
  router.get('/:id/variants', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(IdParamSchema, req.params, res, 'Identificador de línea inválido');
    if (!params) return;

    try {
      // Se comprueba la línea para distinguir «no existe» de «no tiene variantes».
      const product = await deps.catalog.findProduct(params.id);
      if (!product) {
        res.status(404).json({ success: false, message: 'Línea no encontrada' });
        return;
      }
      res.json({ success: true, data: product.variants });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/admin/products/:id/variants
  router.post('/:id/variants', requireRole('owner'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(IdParamSchema, req.params, res, 'Identificador de línea inválido');
    if (!params) return;
    const body = parseOrFail(VariantBodySchema, req.body, res, 'Variante inválida');
    if (!body) return;

    try {
      const variant = await deps.service.createVariant(params.id, body, { userId: req.admin!.userId });
      res.status(201).json({ success: true, data: variant });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  // PATCH /api/admin/products/:id/variants/:variantId
  router.patch('/:id/variants/:variantId', requireOwnerOrFields('imageKey'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(VariantParamsSchema, req.params, res, 'Identificadores inválidos');
    if (!params) return;
    const patch = parseOrFail(VariantPatchSchema, req.body, res, 'Cambios inválidos');
    if (!patch) return;

    try {
      // La línea va en la ruta: una variante no se edita sin decir de quién es,
      // y el servicio comprueba que de verdad le pertenece.
      const variant = await deps.service.updateVariant(params.id, params.variantId, patch, {
        userId: req.admin!.userId
      });
      res.json({ success: true, data: variant });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  return router;
}
