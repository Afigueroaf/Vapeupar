import { NextFunction, Request, Response, Router } from 'express';
import * as cognito from '../../services/auth.service.js';
import { verifyAccessToken } from '../../services/token-verifier.js';
import { LoginSchema, MfaCodeSchema, NewPasswordSchema } from '../../schemas/admin/auth.schema.js';
import {
  ACCESS_COOKIE,
  CHALLENGE_COOKIE,
  clearChallengeCookie,
  clearMfaCookies,
  clearSessionCookies,
  readCookie,
  readMfaCookie,
  setChallengeCookie,
  setMfaCookie,
  setSessionCookies
} from '../../middleware/session-cookies.js';
import { UserRepository } from '../../repositories/user.repository.js';
import { sendDomainError, sendValidationError } from './http.js';

/**
 * Inicio y cierre de sesión (plan A4.1). Son las únicas rutas de `/api/admin`
 * sin `requireAuth` delante, por razones obvias; a cambio llevan el límite de
 * peticiones más estricto de todo el backend (ver `app.ts`).
 *
 * MFA (TOTP). El pool vivo tiene MFA opcional y Cognito no deja pasarlo a
 * obligatoria sin recrearlo, así que la obligación la pone este router: con
 * `requireMfa`, una sesión que llega sin reto de MFA —la cuenta no tiene TOTP—
 * no se abre; se enrola TOTP primero y solo entonces se dejan las cookies de
 * sesión. Las cuentas que ya tienen TOTP llegan con el reto `SOFTWARE_TOKEN_MFA`
 * y lo resuelven con el código. Si algún día el pool pasa a MFA obligatoria,
 * Cognito manda `MFA_SETUP` y el mismo flujo lo resuelve.
 */
export type AuthService = Pick<
  typeof cognito,
  | 'login'
  | 'completeNewPassword'
  | 'signOut'
  | 'respondMfa'
  | 'startMfaSetup'
  | 'verifyMfaSetup'
  | 'completeMfaSetup'
  | 'enableTotp'
>;

export interface AuthRoutesDeps {
  users: UserRepository;
  auth?: Partial<AuthService> & Pick<AuthService, 'login' | 'completeNewPassword' | 'signOut'>;
  verify?: typeof verifyAccessToken;
  /**
   * Exigir TOTP a toda cuenta. Por defecto: `ADMIN_MFA_REQUIRED` si está
   * definida, si no, solo en producción (en desarrollo se entra sin teléfono).
   */
  requireMfa?: boolean;
}

export function isMfaRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ADMIN_MFA_REQUIRED !== undefined) return env.ADMIN_MFA_REQUIRED === 'true';
  return env.NODE_ENV === 'production';
}

/** URI que leen las apps autenticadoras (y el QR de la consola). */
export function otpauthUri(email: string, secret: string): string {
  const label = encodeURIComponent(`Vapeupar:${email}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=Vapeupar`;
}

export function createAuthRouter(deps: AuthRoutesDeps): Router {
  const auth = { ...cognito, ...deps.auth } as AuthService;
  const verify = deps.verify ?? verifyAccessToken;
  const requireMfa = deps.requireMfa ?? isMfaRequired();
  const router = Router();

  /**
   * Autorización contra la tabla `User`. Se comprueba antes de abrir la sesión
   * y antes de enrolar MFA: sin fila activa no se deja ninguna cookie puesta ni
   * se le asocia un TOTP a una cuenta que no tiene acceso.
   */
  async function authorize(res: Response, accessToken: string) {
    const claims = await verify(accessToken);
    const user = await deps.users.findById(claims.sub);
    if (!user || !user.active) {
      clearSessionCookies(res);
      res.status(403).json({ success: false, message: 'Esta cuenta no tiene acceso a la consola' });
      return undefined;
    }
    return { claims, user };
  }

  async function openSession(res: Response, session: cognito.CognitoSession): Promise<void> {
    const authorized = await authorize(res, session.accessToken);
    if (!authorized) return;
    clearMfaCookies(res);
    setSessionCookies(res, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      username: authorized.claims.username,
      expiresIn: session.expiresIn
    });
    res.json({ success: true, data: { email: authorized.user.email, role: authorized.user.role } });
  }

  function sendSetup(res: Response, email: string, secret: string): void {
    res.status(200).json({
      success: true,
      data: { status: 'mfa_setup', secret, otpauthUri: otpauthUri(email, secret) },
      message: 'Configura la verificación en dos pasos con tu app autenticadora'
    });
  }

  /** Decide el siguiente paso a partir de lo que respondió Cognito. */
  async function continueLogin(res: Response, email: string, result: cognito.LoginResult): Promise<void> {
    switch (result.status) {
      case 'new_password_required':
        // El reto viaja en cookie, no en el cuerpo: así ningún token ni sesión
        // de Cognito llega al JavaScript de la consola.
        setChallengeCookie(res, result.challengeSession);
        res.status(200).json({
          success: true,
          data: { status: 'new_password_required' },
          message: 'La contraseña de la invitación es temporal: define una nueva'
        });
        return;

      case 'mfa_required':
        setMfaCookie(res, { kind: 'challenge', session: result.challengeSession });
        res.status(200).json({
          success: true,
          data: { status: 'mfa_required' },
          message: 'Escribe el código de tu app autenticadora'
        });
        return;

      case 'mfa_setup_required': {
        const setup = await auth.startMfaSetup({ session: result.challengeSession });
        setMfaCookie(res, { kind: 'setup-challenge', session: setup.session ?? result.challengeSession });
        sendSetup(res, email, setup.secret);
        return;
      }

      case 'authenticated': {
        if (!requireMfa) {
          await openSession(res, result.session);
          return;
        }
        // Sin reto de MFA = la cuenta no tiene TOTP. No se abre la sesión.
        if (!(await authorize(res, result.session.accessToken))) return;
        const setup = await auth.startMfaSetup({ accessToken: result.session.accessToken });
        setMfaCookie(res, {
          kind: 'setup-token',
          accessToken: result.session.accessToken,
          refreshToken: result.session.refreshToken
        });
        sendSetup(res, email, setup.secret);
        return;
      }
    }
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
      await continueLogin(res, parsed.data.email, result);
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
      const result = await auth.completeNewPassword(parsed.data.email, parsed.data.password, challengeSession);
      clearChallengeCookie(res);
      await continueLogin(res, parsed.data.email, result);
    } catch (error) {
      if (sendDomainError(res, error)) return;
      next(error);
    }
  });

  /**
   * POST /api/admin/auth/mfa — el código de 6 dígitos, sea para entrar con una
   * cuenta que ya tiene TOTP o para terminar de enrolarlo. Qué toca hacer lo
   * dice la cookie del paso en curso, no el cliente.
   */
  router.post('/mfa', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = MfaCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error, 'Código inválido');
      return;
    }
    const state = readMfaCookie(req);
    if (!state) {
      res.status(400).json({
        success: false,
        message: 'No hay una verificación en curso; vuelve a iniciar sesión'
      });
      return;
    }
    const { email, code } = parsed.data;

    try {
      switch (state.kind) {
        case 'challenge':
          await openSession(res, await auth.respondMfa(email, code, state.session));
          return;

        case 'setup-challenge': {
          const verified = await auth.verifyMfaSetup({ session: state.session }, code);
          await openSession(res, await auth.completeMfaSetup(email, verified.session ?? state.session));
          return;
        }

        case 'setup-token': {
          await auth.verifyMfaSetup({ accessToken: state.accessToken }, code);
          await auth.enableTotp(state.accessToken);
          if (!state.refreshToken) {
            // Sin refresh token no se puede dar una sesión de 7 días: el TOTP
            // ya quedó activo, así que basta con volver a entrar.
            clearMfaCookies(res);
            res.json({
              success: true,
              data: { status: 'mfa_enrolled' },
              message: 'Verificación en dos pasos activada; vuelve a iniciar sesión'
            });
            return;
          }
          // El token es de antes de enrolar, pero quien lo trae acaba de probar
          // la contraseña y la posesión del TOTP: ya cumple lo que se exige.
          await openSession(res, { accessToken: state.accessToken, refreshToken: state.refreshToken, expiresIn: 3600 });
          return;
        }
      }
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
