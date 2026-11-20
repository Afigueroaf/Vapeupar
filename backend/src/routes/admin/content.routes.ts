import { NextFunction, Request, Response, Router } from 'express';
import { requireRole } from '../../middleware/require-role.js';
import {
  ContentBodySchema, ContentKeyParamSchema, ContentVersionParamSchema, ContentVersionsQuerySchema, CONTENT_KEYS
} from '../../schemas/admin/content.schema.js';
import { ContentService } from '../../services/content.service.js';
import { SiteRevalidator } from '../../services/site-revalidation.service.js';
import { parseOrFail, revalidateSite, sendDomainError } from './http.js';

/**
 * Contenido editable del sitio (plan A4.2). Las claves son una lista cerrada:
 * una clave fuera de ella es 400, no una fila nueva.
 *
 * Publicar añade una versión en vez de sobrescribir, así que el texto anterior
 * sigue disponible; `GET /:key/versions` lo lista para poder volver atrás desde
 * la consola (A5.4). `POST /:key/versions/:version/restore` vuelve a publicar
 * una de ellas como versión nueva, sin reescribir el historial.
 *
 * Publicar refresca el sitio al momento (A7.3): `meta.revalidated` dice si el
 * frontend lo confirmó; si es `false`, el cambio se verá en ≤60 s.
 */
export interface ContentRoutesDeps {
  service: Pick<ContentService, 'get' | 'publish' | 'restore' | 'listVersions'>;
  revalidate: SiteRevalidator;
}

export function createContentRouter(deps: ContentRoutesDeps): Router {
  const router = Router();

  // GET /api/admin/content
  router.get('/', (_req: Request, res: Response): void => {
    res.json({ success: true, data: CONTENT_KEYS });
  });

  // GET /api/admin/content/:key
  router.get('/:key', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(ContentKeyParamSchema, req.params, res, 'Clave de contenido desconocida');
    if (!params) return;

    try {
      res.json({ success: true, data: await deps.service.get(params.key) });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  // GET /api/admin/content/:key/versions
  router.get('/:key/versions', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(ContentKeyParamSchema, req.params, res, 'Clave de contenido desconocida');
    if (!params) return;
    const query = parseOrFail(ContentVersionsQuerySchema, req.query, res, 'Parámetros de consulta inválidos');
    if (!query) return;

    try {
      res.json({ success: true, data: await deps.service.listVersions(params.key, query.limit) });
    } catch (error) {
      next(error);
    }
  });

  // PUT /api/admin/content/:key
  router.put('/:key', requireRole('owner'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(ContentKeyParamSchema, req.params, res, 'Clave de contenido desconocida');
    if (!params) return;
    const body = parseOrFail(ContentBodySchema, req.body, res, 'Contenido inválido');
    if (!body) return;

    try {
      // 201: publicar crea una versión nueva, no reemplaza la anterior.
      const version = await deps.service.publish(params.key, body, { userId: req.admin!.userId });
      const revalidated = await revalidateSite(deps.revalidate, ['contenido']);
      res.status(201).json({ success: true, data: version, meta: { revalidated } });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  // POST /api/admin/content/:key/versions/:version/restore
  router.post('/:key/versions/:version/restore', requireRole('owner'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = parseOrFail(ContentVersionParamSchema, req.params, res, 'Clave o versión inválida');
    if (!params) return;

    try {
      const version = await deps.service.restore(params.key, params.version, { userId: req.admin!.userId });
      const revalidated = await revalidateSite(deps.revalidate, ['contenido']);
      res.status(201).json({ success: true, data: version, meta: { revalidated } });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  return router;
}
