import { Request, RequestHandler, Response, Router } from 'express';
import * as cognito from '../../services/auth.service.js';
import { verifyAccessToken } from '../../services/token-verifier.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { PrismaUserRepository } from '../../repositories/prisma-user.repository.js';
import { PrismaStockViewRepository } from '../../repositories/prisma-stock-view.repository.js';
import { PrismaCatalogRepository } from '../../repositories/prisma-catalog.repository.js';
import { PrismaAuditViewRepository } from '../../repositories/prisma-audit-view.repository.js';
import { AuditViewRepository } from '../../repositories/audit-view.repository.js';
import { CatalogRepository } from '../../repositories/catalog.repository.js';
import { StockViewRepository } from '../../repositories/stock-view.repository.js';
import { UserRepository } from '../../repositories/user.repository.js';
import { CatalogWriter, catalogService as defaultCatalogService } from '../../services/catalog.service.js';
import { ContentWriter, contentService as defaultContentService } from '../../services/content.service.js';
import { StockService, stockService as defaultStockService } from '../../services/stock.service.js';
import { createAuditRouter } from './audit.routes.js';
import { createAuthRouter } from './auth.routes.js';
import { createBrandsRouter } from './brands.routes.js';
import { createContentRouter } from './content.routes.js';
import { createProductsRouter } from './products.routes.js';
import { createStockRouter } from './stock.routes.js';
import { createSuppliersRouter } from './suppliers.routes.js';
import { createUsersRouter } from './users.routes.js';
import { createInventoryNotesRouter } from './inventory-notes.routes.js';
import { createImageUploadsRouter } from './image-uploads.routes.js';
import { InventoryNoteService } from '../../services/inventory-note.service.js';
import { PrismaInventoryNoteRepository } from '../../repositories/prisma-inventory-note.repository.js';
import { ImageUploadService } from '../../services/image-upload.service.js';

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
  catalog?: CatalogRepository;
  catalogService?: CatalogWriter;
  contentService?: ContentWriter;
  auditView?: AuditViewRepository;
  inventoryNotes?: InventoryNoteService;
  imageUploads?: ImageUploadService;
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

  router.use('/inventory-notes', createInventoryNotesRouter({
    service: deps.inventoryNotes ?? new InventoryNoteService(new PrismaInventoryNoteRepository())
  }));

  const catalog = deps.catalog ?? new PrismaCatalogRepository();
  const catalogWriter = deps.catalogService ?? defaultCatalogService;

  router.use('/brands', createBrandsRouter({ catalog, service: catalogWriter }));
  router.use('/suppliers', createSuppliersRouter({ catalog, service: catalogWriter }));
  router.use('/products', createProductsRouter({ catalog, service: catalogWriter }));
  router.use('/uploads', createImageUploadsRouter({
    service: deps.imageUploads ?? new ImageUploadService({ catalog })
  }));
  router.use('/content', createContentRouter({ service: deps.contentService ?? defaultContentService }));
  router.use('/audit', createAuditRouter({ audit: deps.auditView ?? new PrismaAuditViewRepository() }));

  router.use('/users', createUsersRouter({ users, auth: deps.auth }));

  return router;
}
