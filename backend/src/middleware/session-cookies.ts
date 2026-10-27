import { CookieOptions, Request, Response } from 'express';

/**
 * Sesión de la consola en cookies, no en el navegador (plan A4.1): el frontend
 * nunca ve un token, así que un XSS en la consola no se lleva la sesión.
 *
 * - `httpOnly`: JavaScript no las lee.
 * - `sameSite: 'strict'`: no viajan en peticiones iniciadas por otro sitio. La
 *   consola y la API comparten dominio registrable (el puerto no cuenta para
 *   SameSite), así que `strict` no estorba ni en desarrollo.
 * - `path`: limitado a la superficie del admin; el sitio público nunca las
 *   recibe.
 * - `secure`: en producción siempre. En desarrollo se apaga porque `next dev`
 *   sirve por HTTP desde otros equipos de la red Wi-Fi (`allowedDevOrigins`),
 *   donde una cookie `Secure` no llegaría.
 */
export const ACCESS_COOKIE = 'vp_admin_at';
export const REFRESH_COOKIE = 'vp_admin_rt';
/** Nombre de usuario real en el pool: hace falta para el SECRET_HASH al renovar. */
export const USERNAME_COOKIE = 'vp_admin_un';
/** Reto NEW_PASSWORD_REQUIRED en curso. De un solo uso y de vida corta. */
export const CHALLENGE_COOKIE = 'vp_admin_ch';

const COOKIE_PATH = '/api/admin';
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: COOKIE_PATH
  };
}

export interface SessionCookies {
  accessToken: string;
  /** Ausente al renovar: el refresh token no se reemplaza. */
  refreshToken?: string;
  username?: string;
  /** Segundos de validez del access token. */
  expiresIn: number;
}

export function setSessionCookies(res: Response, session: SessionCookies): void {
  res.cookie(ACCESS_COOKIE, session.accessToken, { ...baseOptions(), maxAge: session.expiresIn * 1000 });
  if (session.refreshToken) {
    // 7 días, igual que `refreshTokenValidity` del cliente del pool.
    res.cookie(REFRESH_COOKIE, session.refreshToken, { ...baseOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
  }
  if (session.username) {
    res.cookie(USERNAME_COOKIE, session.username, { ...baseOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
  }
}

export function clearSessionCookies(res: Response): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, USERNAME_COOKIE, CHALLENGE_COOKIE]) {
    res.clearCookie(name, baseOptions());
  }
}

export function setChallengeCookie(res: Response, challengeSession: string): void {
  res.cookie(CHALLENGE_COOKIE, challengeSession, { ...baseOptions(), maxAge: CHALLENGE_TTL_MS });
}

export function clearChallengeCookie(res: Response): void {
  res.clearCookie(CHALLENGE_COOKIE, baseOptions());
}

/** Lectura tolerante: sin `cookie-parser` montado, `req.cookies` no existe. */
export function readCookie(req: Request, name: string): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
