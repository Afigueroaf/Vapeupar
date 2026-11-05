import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AdminUser } from '../repositories/user.repository.js';

/**
 * Restringe una ruta por rol (plan A4.1). Va siempre detrás de `requireAuth`,
 * que es quien pone `req.admin`; si falta, la ruta está mal montada y eso es un
 * error del servidor, no del cliente.
 */
export function requireRole(...roles: AdminUser['role'][]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      next(new Error('requireRole exige requireAuth delante'));
      return;
    }
    if (!roles.includes(req.admin.role)) {
      res.status(403).json({
        success: false,
        message: `Esta operación exige rol ${roles.join(' o ')}`
      });
      return;
    }
    next();
  };
}

/**
 * Deja pasar a `owner` siempre, y a `operator` solo si el cuerpo no toca más
 * que los campos indicados (decisión de imágenes de inventario, §4.5 del
 * traspaso 2026-10-27: quien registra el ingreso diario puede adjuntar la
 * imagen, pero no cambiar precio, estado ni ningún otro dato).
 *
 * La comprobación es sobre el cuerpo **sin validar**: un `operator` que mande
 * un campo de más recibe 403 en lugar de que Zod lo descarte en silencio y la
 * petición pase como si solo trajera la imagen.
 */
export function requireOwnerOrFields(...fields: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      next(new Error('requireOwnerOrFields exige requireAuth delante'));
      return;
    }
    if (req.admin.role === 'owner') {
      next();
      return;
    }
    const keys = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? Object.keys(req.body as Record<string, unknown>)
      : [];
    if (req.admin.role === 'operator' && keys.length > 0 && keys.every(key => fields.includes(key))) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      message: `Con rol ${req.admin.role} solo puedes cambiar: ${fields.join(', ')}`
    });
  };
}
