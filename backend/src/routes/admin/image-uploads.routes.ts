import { NextFunction, Request, Response, Router } from 'express';
import { requireRole } from '../../middleware/require-role.js';
import { ImageUploadService } from '../../services/image-upload.service.js';
import { ImageInvalidateBodySchema, ImageUploadBodySchema } from '../../schemas/admin/image-upload.schema.js';
import { parseOrFail, sendDomainError } from './http.js';

export function createImageUploadsRouter(deps: { service: ImageUploadService }): Router {
  const router = Router();
  router.post('/presign', requireRole('owner', 'operator'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = parseOrFail(ImageUploadBodySchema, req.body, res, 'Solicitud de imagen inválida');
    if (!body) return;
    try {
      res.json({ success: true, data: await deps.service.presign(body) });
    } catch (error) { if (!sendDomainError(res, error)) next(error); }
  });

  /**
   * Invalida la caché del CDN para una clave recién subida.
   *
   * Va aparte del presign porque el `PUT` lo hace el navegador: el backend no
   * sabe cuándo terminó. Y va aparte del PATCH que guarda la clave porque
   * reemplazar una imagen no cambia la clave, así que puede no haber PATCH.
   */
  router.post('/invalidate', requireRole('owner', 'operator'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = parseOrFail(ImageInvalidateBodySchema, req.body, res, 'Clave de imagen inválida');
    if (!body) return;
    try {
      res.json({ success: true, data: await deps.service.invalidate(body.key) });
    } catch (error) { if (!sendDomainError(res, error)) next(error); }
  });

  return router;
}
