import { AdminIdentity } from '../middleware/require-auth.js';

/**
 * `req.admin` lo escribe `requireAuth` y lo leen las rutas de `/api/admin`.
 * Es opcional en el tipo a propósito: fuera de esa superficie no existe, y así
 * el compilador obliga a comprobarlo en cualquier otro sitio.
 */
declare global {
  namespace Express {
    interface Request {
      admin?: AdminIdentity;
    }
  }
}

export {};
