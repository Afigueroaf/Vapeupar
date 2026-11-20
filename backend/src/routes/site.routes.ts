import { NextFunction, Request, Response, Router } from 'express';
import { CatalogRepository } from '../repositories/catalog.repository.js';
import { PrismaCatalogRepository } from '../repositories/prisma-catalog.repository.js';
import { ContentKeyParamSchema } from '../schemas/admin/content.schema.js';
import { ContentReader, contentService as defaultContentService } from '../services/content.service.js';

/**
 * Lectura pública del contenido del sitio y de las marcas aliadas (plan A7.2 y
 * A7.4). Sin sesión, como el catálogo: es lo que el frontend pinta en la
 * portada, así que no expone nada que no esté ya a la vista.
 *
 * - `GET /api/content/:key`: el texto vigente de la clave, o el valor por
 *   defecto si nunca se publicó. Nunca 404 por una clave conocida.
 * - `GET /api/brands/partners`: nombre y slug de las marcas aliadas activas,
 *   que el sitio usa para generar la enumeración de la FAQ (ADR-002 §5).
 */
export interface SiteRoutesDeps {
  content?: ContentReader;
  catalog?: CatalogRepository;
}

/** Ninguna tienda razonable tiene más aliadas que esto; es un tope, no una página. */
const MAX_PARTNERS = 50;

export function createContentPublicRouter(deps: SiteRoutesDeps = {}): Router {
  const content = deps.content ?? defaultContentService;
  const router = Router();

  // GET /api/content/:key
  router.get('/:key', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = ContentKeyParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ success: false, message: 'Clave de contenido desconocida' });
      return;
    }

    try {
      res.json({ success: true, data: await content.getPublic(params.data.key) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function createBrandsPublicRouter(deps: SiteRoutesDeps = {}): Router {
  const catalog = deps.catalog ?? new PrismaCatalogRepository();
  const router = Router();

  // GET /api/brands/partners
  router.get('/partners', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = await catalog.listBrands({ active: true, isPartner: true, limit: MAX_PARTNERS, offset: 0 });
      res.json({ success: true, data: page.rows.map(({ name, slug }) => ({ name, slug })) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
