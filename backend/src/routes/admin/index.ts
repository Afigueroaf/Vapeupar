import { Request, RequestHandler, Response, Router } from 'express';
import * as cognito from '../../services/auth.service.js';
import { verifyAccessToken } from '../../services/token-verifier.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { PrismaUserRepository } from '../../repositories/prisma-user.repository.js';
import { PrismaStockViewRepository } from '../../repositories/prisma-stock-view.repository.js';
import { StockViewRepository } from '../../repositories/stock-view.repository.js';
import { UserRepository } from '../../repositories/user.repository.js';
import { StockService, stockService as defaultStockService } from '../../services/stock.service.js';
import { createAuthRouter } from './auth.routes.js';
import { createStockRouter } from './stock.routes.js';
import { createUsersRouter } from './users.routes.js';

/**
 * Superficie `/api/admin` (plan A4.2).
 *
 * El orden de montaje es la frontera de seguridad: `/auth` queda delante del
 * guardián y **todo lo que se monta después exige sesión**. Añadir una ruta
 * nueva detrás de esta línea no requiere acordarse de protegerla.
 */
export interface AdminRouterDeps {
  users?: UserRepository;
  stockService?: Pick<StockService, 'recordMovement' | 'getKardex'>;
  stockView?: StockViewRepository;
  auth?: Pick<typeof cognito, 'login' | 'completeNewPassword' | 'signOut' | 'inviteUser' | 'disableUser'>;
  verify?: typeof verifyAccessToken;
  /** Se sustituye en los tests para no hablar con Cognito ni con la base. */
  guard?: RequestHandler;
}

export function createAdminRouter(deps: AdminRouterDeps = {}): Router {
  const users = deps.users ?? new PrismaUserRepository();
  const router = Router();

  router.use('/auth', createAuthRouter({ users, auth: deps.auth, verify: deps.verify }));

  // ---- A partir de aquí, sesión obligatoria ----
  router.use(deps.guard ?? requireAuth);

  // GET /api/admin/me
  router.get('/me', (req: Request, res: Response): void => {
    const { userId, email, role } = req.admin!;
    res.json({ success: true, data: { userId, email, role } });
  });

  router.use('/stock', createStockRouter({
    stockService: deps.stockService ?? defaultStockService,
    stockView: deps.stockView ?? new PrismaStockViewRepository()
  }));

  router.use('/users', createUsersRouter({ users, auth: deps.auth }));

  return router;
}
