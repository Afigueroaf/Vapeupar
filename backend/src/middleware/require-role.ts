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
