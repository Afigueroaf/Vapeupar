import { NextFunction, Request, Response, Router } from 'express';
import * as cognito from '../../services/auth.service.js';
import { verifyAccessToken } from '../../services/token-verifier.js';
import { LoginSchema, NewPasswordSchema } from '../../schemas/admin/auth.schema.js';
import {
  ACCESS_COOKIE,
  CHALLENGE_COOKIE,
  clearChallengeCookie,
  clearSessionCookies,
  readCookie,
  setChallengeCookie,
  setSessionCookies
} from '../../middleware/session-cookies.js';
import { UserRepository } from '../../repositories/user.repository.js';
import { sendDomainError, sendValidationError } from './http.js';

/**
 * Inicio y cierre de sesión (plan A4.1). Son las únicas rutas de `/api/admin`
 * sin `requireAuth` delante, por razones obvias; a cambio llevan el límite de
 * peticiones más estricto de todo el backend (ver `app.ts`).
 */
export interface AuthRoutesDeps {
  users: UserRepository;
  auth?: Pick<typeof cognito, 'login' | 'completeNewPassword' | 'signOut'>;
  verify?: typeof verifyAccessToken;
}

export function createAuthRouter(deps: AuthRoutesDeps): Router {
  const auth = deps.auth ?? cognito;
  const verify = deps.verify ?? verifyAccessToken;
  const router = Router();

  /**
   * Abre la sesión a partir de los tokens de Cognito. La autorización se
   * comprueba aquí y no solo en `requireAuth`: sin fila activa en `User` no se
   * deja ninguna cookie puesta, para no dar por abierta una sesión que luego
   * va a rebotar con 403 en cada petición.
   */
  async function openSession(res: Response, session: cognito.CognitoSession): Promise<boolean> {
    const claims = await verify(session.accessToken);
    const user = await deps.users.findById(claims.sub);
    if (!user || !user.active) {
      clearSessionCookies(res);
      res.status(403).json({ success: false, message: 'Esta cuenta no tiene acceso a la consola' });
      return false;
    }
    setSessionCookies(res, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      username: claims.username,
      expiresIn: session.expiresIn
    });
    res.json({ success: true, data: { email: user.email, role: user.role } });
    return true;
  }

  // POST /api/admin/auth/login
  router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error, 'Credenciales inválidas');
      return;
    }

    try {
      const result = await auth.login(parsed.data.email, parsed.data.password);
      if (result.status === 'new_password_required') {
        // El reto viaja en cookie, no en el cuerpo: así ningún token ni sesión
        // de Cognito llega al JavaScript de la consola.
        setChallengeCookie(res, result.challengeSession);
        res.status(200).json({
          success: true,
          data: { status: 'new_password_required' },
          message: 'La contraseña de la invitación es temporal: define una nueva'
        });
        return;
      }
      await openSession(res, result.session);
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  // POST /api/admin/auth/new-password
  router.post('/new-password', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = NewPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error, 'La contraseña no cumple los requisitos');
      return;
    }
    const challengeSession = readCookie(req, CHALLENGE_COOKIE);
    if (!challengeSession) {
      res.status(400).json({
        success: false,
        message: 'No hay un cambio de contraseña en curso; vuelve a iniciar sesión'
      });
      return;
    }

    try {
      const session = await auth.completeNewPassword(parsed.data.email, parsed.data.password, challengeSession);
      clearChallengeCookie(res);
      await openSession(res, session);
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  // POST /api/admin/auth/logout
  router.post('/logout', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const accessToken = readCookie(req, ACCESS_COOKIE);
    try {
      // Revoca los refresh tokens en Cognito; sin esto, borrar la cookie dejaría
      // la sesión viva para quien hubiera copiado el token.
      if (accessToken) await auth.signOut(accessToken);
      clearSessionCookies(res);
      res.json({ success: true, message: 'Sesión cerrada' });
    } catch (error) {
      // Aunque Cognito falle, la sesión local se cierra igual.
      clearSessionCookies(res);
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  return router;
}
