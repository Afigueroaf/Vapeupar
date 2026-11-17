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
/**
 * Paso de MFA en curso: el reto de Cognito o, al enrolar con el pool opcional,
 * los tokens de una sesión que todavía no se da por abierta. Nombres propios a
 * propósito: `requireAuth` no los lee, así que con ellos no se entra a nada.
 */
export const MFA_COOKIE = 'vp_admin_mfa';
export const MFA_REFRESH_COOKIE = 'vp_admin_mfa_rt';

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
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, USERNAME_COOKIE, CHALLENGE_COOKIE, MFA_COOKIE, MFA_REFRESH_COOKIE]) {
    res.clearCookie(name, baseOptions());
  }
}

export function setChallengeCookie(res: Response, challengeSession: string): void {
  res.cookie(CHALLENGE_COOKIE, challengeSession, { ...baseOptions(), maxAge: CHALLENGE_TTL_MS });
}

export function clearChallengeCookie(res: Response): void {
  res.clearCookie(CHALLENGE_COOKIE, baseOptions());
}

/**
 * Estado del paso de MFA, 10 minutos como el del cambio de contraseña:
 * - `challenge`: sesión del reto `SOFTWARE_TOKEN_MFA`.
 * - `setup-challenge`: sesión del reto `MFA_SETUP` (pool de MFA obligatoria).
 * - `setup-token`: access token de una sesión sin MFA que el backend no abre
 *   hasta que se enrole TOTP; el refresh token va en su propia cookie.
 */
export type MfaState =
  | { kind: 'challenge'; session: string }
  | { kind: 'setup-challenge'; session: string }
  | { kind: 'setup-token'; accessToken: string; refreshToken?: string };

// Ni `s:` ni `j:`: cookie-parser reserva esos prefijos (firmadas y JSON).
const MFA_PREFIX = { challenge: 'c:', 'setup-challenge': 'e:', 'setup-token': 't:' } as const;

export function setMfaCookie(res: Response, state: MfaState): void {
  const value = state.kind === 'setup-token' ? state.accessToken : state.session;
  res.cookie(MFA_COOKIE, MFA_PREFIX[state.kind] + value, { ...baseOptions(), maxAge: CHALLENGE_TTL_MS });
  if (state.kind === 'setup-token' && state.refreshToken) {
    res.cookie(MFA_REFRESH_COOKIE, state.refreshToken, { ...baseOptions(), maxAge: CHALLENGE_TTL_MS });
  }
}

export function readMfaCookie(req: Request): MfaState | undefined {
  const raw = readCookie(req, MFA_COOKIE);
  if (!raw) return undefined;
  const value = raw.slice(2);
  if (!value) return undefined;
  switch (raw.slice(0, 2)) {
    case MFA_PREFIX.challenge: return { kind: 'challenge', session: value };
    case MFA_PREFIX['setup-challenge']: return { kind: 'setup-challenge', session: value };
    case MFA_PREFIX['setup-token']:
      return { kind: 'setup-token', accessToken: value, refreshToken: readCookie(req, MFA_REFRESH_COOKIE) };
    default: return undefined;
  }
}

export function clearMfaCookies(res: Response): void {
  res.clearCookie(MFA_COOKIE, baseOptions());
  res.clearCookie(MFA_REFRESH_COOKIE, baseOptions());
}

/** Lectura tolerante: sin `cookie-parser` montado, `req.cookies` no existe. */
export function readCookie(req: Request, name: string): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
