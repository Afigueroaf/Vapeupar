import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AuthError, refresh as refreshSession } from '../services/auth.service.js';
import {
  AccessTokenClaims,
  AccessTokenVerifier,
  TokenExpiredError,
  verifyAccessToken
} from '../services/token-verifier.js';
import { PrismaUserRepository } from '../repositories/prisma-user.repository.js';
import { AdminUser, UserRepository } from '../repositories/user.repository.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  USERNAME_COOKIE,
  clearSessionCookies,
  readCookie,
  setSessionCookies
} from './session-cookies.js';

/**
 * Puerta de `/api/admin` (plan A4.1). Dos comprobaciones, en este orden:
 *
 * 1. **Cognito** dice que el access token es auténtico y no venció. Si venció,
 *    se renueva con el refresh token y la petición continúa sin que el usuario
 *    note nada; si tampoco eso funciona, 401 y cookies borradas.
 * 2. **La tabla `User`** dice si ese `sub` puede entrar. Un usuario del pool sin
 *    fila activa recibe 403: desactivar a alguien es una escritura en la base,
 *    sin tocar Cognito.
 *
 * Las dependencias entran por parámetro para poder probarlo sin red ni base.
 */
export interface AdminIdentity {
  userId: string;
  email: string;
  role: AdminUser['role'];
  /** Nombre de usuario en el pool, para las operaciones administrativas. */
  username: string;
}

export interface RequireAuthDeps {
  verify?: AccessTokenVerifier;
  renew?: (refreshToken: string, username: string) => Promise<{ accessToken: string; expiresIn: number }>;
  users?: UserRepository;
}

function unauthorized(res: Response, message: string): void {
  clearSessionCookies(res);
  res.status(401).json({ success: false, message });
}

export function createRequireAuth(deps: RequireAuthDeps = {}): RequestHandler {
  const verify = deps.verify ?? verifyAccessToken;
  const renew = deps.renew ?? refreshSession;
  const users = deps.users ?? new PrismaUserRepository();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const accessToken = readCookie(req, ACCESS_COOKIE);
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    const username = readCookie(req, USERNAME_COOKIE);

    const renewAndVerify = async (): Promise<AccessTokenClaims> => {
      if (!refreshToken || !username) throw new AuthError('SESSION_EXPIRED', 'No hay sesión activa');
      const renewed = await renew(refreshToken, username);
      setSessionCookies(res, { accessToken: renewed.accessToken, expiresIn: renewed.expiresIn });
      return verify(renewed.accessToken);
    };

    let claims: AccessTokenClaims;
    try {
      if (accessToken) {
        try {
          claims = await verify(accessToken);
        } catch (error) {
          if (!(error instanceof TokenExpiredError)) throw error;
          claims = await renewAndVerify();
        }
      } else {
        // Sin access token pero con refresh: es una sesión viva cuya cookie de
        // acceso ya caducó en el navegador.
        claims = await renewAndVerify();
      }
    } catch (error) {
      if (error instanceof AuthError) {
        unauthorized(res, error.message);
        return;
      }
      unauthorized(res, 'Sesión inválida o expirada');
      return;
    }

    const user = await users.findById(claims.sub);
    if (!user || !user.active) {
      // 403 y no 401: la identidad es correcta, lo que falta es la autorización,
      // así que reintentar el login no cambiaría nada.
      res.status(403).json({
        success: false,
        message: 'Esta cuenta no tiene acceso a la consola'
      });
      return;
    }

    req.admin = {
      userId: user.id,
      email: user.email,
      role: user.role,
      username: claims.username
    };
    next();
  };
}

/** Instancia por defecto, con Cognito y Prisma reales. */
export const requireAuth = createRequireAuth();
