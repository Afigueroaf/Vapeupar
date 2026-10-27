import { NextFunction, Request, Response, Router } from 'express';
import * as cognito from '../../services/auth.service.js';
import { requireRole } from '../../middleware/require-role.js';
import { InviteSchema, UserIdSchema } from '../../schemas/admin/auth.schema.js';
import { DuplicateUserError, UserRepository } from '../../repositories/user.repository.js';
import { sendDomainError, sendValidationError } from './http.js';

/**
 * Alta y baja de usuarios de la consola (plan A4.1). Todo aquí es solo para
 * `owner`: quien opera el inventario no decide quién más entra.
 *
 * Las dos mitades (Cognito y la tabla `User`) no son una transacción. El orden
 * es deliberado en cada caso y está comentado donde importa.
 */
export interface UsersRoutesDeps {
  users: UserRepository;
  auth?: Pick<typeof cognito, 'inviteUser' | 'disableUser'>;
}

export function createUsersRouter(deps: UsersRoutesDeps): Router {
  const auth = deps.auth ?? cognito;
  const router = Router();

  router.use(requireRole('owner'));

  // POST /api/admin/users/invite
  router.post('/invite', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = InviteSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error, 'Invitación inválida');
      return;
    }
    const { email, role } = parsed.data;

    try {
      const existing = await deps.users.findByEmail(email);
      if (existing) {
        res.status(409).json({ success: false, message: 'Ya existe un usuario con ese correo' });
        return;
      }

      // Primero Cognito, porque de ahí sale el `sub` que es la clave de la fila.
      // Si lo segundo falla, queda un usuario del pool sin fila: no puede entrar
      // (`requireAuth` responde 403) y reinvitar lo arregla.
      const invited = await auth.inviteUser(email);
      const user = await deps.users.create({ id: invited.sub, email, role, active: true });

      res.status(201).json({ success: true, data: user });
    } catch (error) {
      if (error instanceof DuplicateUserError) {
        res.status(409).json({ success: false, message: error.message });
        return;
      }
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  // POST /api/admin/users/:id/deactivate
  router.post('/:id/deactivate', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = UserIdSchema.safeParse(req.params);
    if (!parsed.success) {
      sendValidationError(res, parsed.error, 'Identificador de usuario inválido');
      return;
    }
    if (parsed.data.id === req.admin!.userId) {
      res.status(409).json({ success: false, message: 'No puedes desactivar tu propia cuenta' });
      return;
    }

    try {
      // Primero la base: es lo que lee `requireAuth` en cada petición, así que
      // en cuanto se escribe, la persona ya no entra aunque Cognito falle luego.
      const user = await deps.users.deactivate(parsed.data.id);
      if (!user) {
        res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        return;
      }
      // Los administrativos de Cognito aceptan el `sub` como nombre de usuario.
      await auth.disableUser(parsed.data.id);

      res.json({ success: true, data: user });
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  return router;
}
