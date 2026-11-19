import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp, AppOptions } from '../../app.js';
import { createAdminRouter } from './index.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { InMemoryUserRepository } from '../../repositories/in-memory-user.repository.js';
import { InMemoryStockViewRepository } from '../../repositories/in-memory-stock-view.repository.js';
import { StockRow } from '../../repositories/stock-view.repository.js';
import { AccessTokenClaims, TokenExpiredError, TokenInvalidError } from '../../services/token-verifier.js';
import { AuthError, CognitoSession, LoginResult } from '../../services/auth.service.js';
import { StockError } from '../../services/stock.service.js';
import { AdminUser } from '../../repositories/user.repository.js';
import { InMemorySiteContentRepository } from '../../repositories/in-memory-site-content.repository.js';
import { SettingsService } from '../../services/settings.service.js';
import { SiteRevalidator } from '../../services/site-revalidation.service.js';

/**
 * Verificación de A4: que la superficie autenticada responda 401 sin sesión,
 * 403 sin autorización y que el límite del admin salte antes que el público.
 *
 * Todo se prueba contra la aplicación real levantada en un puerto efímero, con
 * Cognito y la base sustituidos: lo que se comprueba es el cableado de Express
 * (orden de middlewares, cookies, códigos), que es justo donde fallan estas
 * cosas, no la lógica de los servicios, que tiene sus propios tests.
 */

const OWNER = '019299a4-0000-7000-8000-000000000001';
const OPERATOR = '019299a4-0000-7000-8000-000000000002';
const DISABLED = '019299a4-0000-7000-8000-000000000003';
const STRANGER = '019299a4-0000-7000-8000-00000000ffff';
const VARIANT = '019299a4-0000-7000-8000-0000000000aa';

const SEED: AdminUser[] = [
  { id: OWNER, email: 'owner@vapeupar.com', role: 'owner', active: true },
  { id: OPERATOR, email: 'operador@vapeupar.com', role: 'operator', active: true },
  { id: DISABLED, email: 'baja@vapeupar.com', role: 'operator', active: false }
];

/** Tokens de mentira: el texto del token es el `sub` que representa. */
const verify = async (token: string): Promise<AccessTokenClaims> => {
  if (token === 'expired') throw new TokenExpiredError();
  if (!token.startsWith('019299a4')) throw new TokenInvalidError('Token de prueba inválido');
  return { sub: token, username: `pool-${token}`, exp: Math.floor(Date.now() / 1000) + 3600 };
};

const STOCK_ROWS: StockRow[] = [
  {
    variantId: VARIANT, variantName: 'Mango Ice', variantSlug: 'mango-ice', kind: 'flavor',
    variantImageKey: null,
    active: true, stock: 2, productId: 'p1', productName: 'LifePod ECO 3', productSlug: 'lifepod-eco-3',
    category: 'disposables', status: 'published', price: 45000, brandId: 'b1', brandName: 'LifePod'
  },
  {
    variantId: 'v2', variantName: 'Space Gray', variantSlug: 'space-gray', kind: 'color',
    variantImageKey: 'products/lifepod-one/space-gray.webp',
    active: true, stock: 40, productId: 'p2', productName: 'LifePod ONE', productSlug: 'lifepod-one',
    category: 'pod-systems', status: 'published', price: 120000, brandId: 'b1', brandName: 'LifePod'
  }
];

interface Harness {
  url: string;
  recordMovement: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  inviteUser: ReturnType<typeof vi.fn>;
  disableUser: ReturnType<typeof vi.fn>;
  mfa: {
    respondMfa: ReturnType<typeof vi.fn>;
    startMfaSetup: ReturnType<typeof vi.fn>;
    verifyMfaSetup: ReturnType<typeof vi.fn>;
    enableTotp: ReturnType<typeof vi.fn>;
  };
  users: InMemoryUserRepository;
  revalidate: ReturnType<typeof vi.fn<SiteRevalidator>>;
}

const servers: Server[] = [];

async function start(options: {
  rateLimits?: AppOptions['rateLimits'];
  login?: () => Promise<LoginResult>;
  requireMfa?: boolean;
  revalidate?: SiteRevalidator;
} = {}): Promise<Harness> {
  const revalidate = vi.fn<SiteRevalidator>(options.revalidate ?? (async () => true));
  const users = new InMemoryUserRepository(SEED);
  const recordMovement = vi.fn(async (input: { variantId: string; userId: string }) => ({
    movement: { id: 'm1', variantId: input.variantId, userId: input.userId } as never,
    stock: 7,
    replayed: false
  }));
  const session: CognitoSession = { accessToken: OWNER, refreshToken: 'rt', expiresIn: 3600 };
  const login = vi.fn(options.login ?? (async (): Promise<LoginResult> => ({ status: 'authenticated', session })));
  const inviteUser = vi.fn(async (email: string) => ({ sub: STRANGER, email, username: 'pool-new' }));
  const disableUser = vi.fn(async () => undefined);

  const mfa = {
    respondMfa: vi.fn(async (_email: string, code: string) => {
      if (code !== '123456') throw new AuthError('INVALID_MFA_CODE', 'El código no es válido');
      return session;
    }),
    startMfaSetup: vi.fn(async () => ({ secret: 'SECRETOTOTP' })),
    verifyMfaSetup: vi.fn(async (_source: unknown, code: string) => {
      if (code !== '123456') throw new AuthError('INVALID_MFA_CODE', 'El código no es válido');
      return {};
    }),
    enableTotp: vi.fn(async () => undefined)
  };

  const auth = {
    login,
    completeNewPassword: vi.fn(async (): Promise<LoginResult> => ({ status: 'authenticated', session })),
    signOut: vi.fn(async () => undefined),
    inviteUser,
    disableUser,
    ...mfa,
    completeMfaSetup: vi.fn(async () => session)
  };

  const app = createApp({
    rateLimits: options.rateLimits,
    adminRouter: createAdminRouter({
      users,
      verify,
      auth,
      requireMfa: options.requireMfa ?? false,
      guard: createRequireAuth({
        verify,
        users,
        renew: async (refreshToken: string) => {
          if (refreshToken !== 'rt') throw new AuthError('SESSION_EXPIRED', 'La sesión expiró');
          return { accessToken: OPERATOR, expiresIn: 3600 };
        }
      }),
      stockService: {
        recordMovement: recordMovement as never,
        getKardex: vi.fn(async (variantId: string) => {
          if (variantId !== VARIANT) throw new StockError('NOT_FOUND', 'Variante no encontrada');
          return { variantId, openingBalance: 0, entries: [], closingBalance: 0 };
        }) as never
      },
      stockView: new InMemoryStockViewRepository(STOCK_ROWS),
      settings: new SettingsService(new InMemorySiteContentRepository()),
      revalidate
    })
  });

  const server = await new Promise<Server>(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, recordMovement, login, inviteUser, disableUser, mfa, users, revalidate };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))));
});

interface CallOptions {
  method?: string;
  body?: unknown;
  cookies?: Record<string, string>;
}

async function call(url: string, path: string, options: CallOptions = {}) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.cookies) {
    headers.cookie = Object.entries(options.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const response = await fetch(`${url}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) as Record<string, unknown> : undefined,
    setCookies: response.headers.getSetCookie()
  };
}

const asOwner = { vp_admin_at: OWNER };
const asOperator = { vp_admin_at: OPERATOR };

describe('superficie /api/admin', () => {
  describe('sin sesión', () => {
    it('responde 401 en lectura', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/me');
      expect(response.status).toBe(401);
    });

    it('responde 401 en escritura, sin llegar al servicio', async () => {
      const { url, recordMovement } = await start();
      const response = await call(url, '/api/admin/stock/movements', {
        method: 'POST',
        body: { variantId: VARIANT, type: 'inbound', quantity: 5, operationKey: 'clave-de-prueba' }
      });
      expect(response.status).toBe(401);
      expect(recordMovement).not.toHaveBeenCalled();
    });

    it('responde 401 con un token que no verifica', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/me', { cookies: { vp_admin_at: 'falsificado' } });
      expect(response.status).toBe(401);
    });
  });

  describe('sesión y autorización', () => {
    it('devuelve la identidad del usuario activo', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/me', { cookies: asOwner });
      expect(response.status).toBe(200);
      expect(response.body?.data).toEqual({ userId: OWNER, email: 'owner@vapeupar.com', role: 'owner' });
    });

    it('responde 403 a un usuario de Cognito sin fila en User', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/me', { cookies: { vp_admin_at: STRANGER } });
      expect(response.status).toBe(403);
    });

    it('responde 403 a un usuario desactivado', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/me', { cookies: { vp_admin_at: DISABLED } });
      expect(response.status).toBe(403);
    });

    it('renueva el access token vencido y deja seguir la petición', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/me', {
        cookies: { vp_admin_at: 'expired', vp_admin_rt: 'rt', vp_admin_un: 'pool-x' }
      });
      expect(response.status).toBe(200);
      expect(response.body?.data).toMatchObject({ userId: OPERATOR });
      // La cookie nueva llega en la misma respuesta.
      expect(response.setCookies.join(';')).toContain('vp_admin_at=');
    });

    it('responde 401 si el refresh token tampoco sirve', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/me', {
        cookies: { vp_admin_at: 'expired', vp_admin_rt: 'revocado', vp_admin_un: 'pool-x' }
      });
      expect(response.status).toBe(401);
    });
  });

  describe('restricción por rol', () => {
    it('un operador no puede invitar', async () => {
      const { url, inviteUser } = await start();
      const response = await call(url, '/api/admin/users/invite', {
        method: 'POST',
        cookies: asOperator,
        body: { email: 'nuevo@vapeupar.com' }
      });
      expect(response.status).toBe(403);
      expect(inviteUser).not.toHaveBeenCalled();
    });

    it('el owner invita y queda la fila en User', async () => {
      const { url, inviteUser, users } = await start();
      const response = await call(url, '/api/admin/users/invite', {
        method: 'POST',
        cookies: asOwner,
        body: { email: 'nuevo@vapeupar.com' }
      });
      expect(response.status).toBe(201);
      expect(inviteUser).toHaveBeenCalledWith('nuevo@vapeupar.com');
      expect(await users.findByEmail('nuevo@vapeupar.com')).toMatchObject({ role: 'operator', active: true });
    });

    it('el owner lista todas las cuentas, también las inactivas', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/users', { cookies: asOwner });
      expect(response.status).toBe(200);
      expect(response.body?.meta).toEqual({ count: 3 });
      expect((response.body?.data as AdminUser[]).map(u => [u.email, u.active])).toEqual([
        ['baja@vapeupar.com', false],
        ['operador@vapeupar.com', true],
        ['owner@vapeupar.com', true]
      ]);
    });

    it('un operador no ve la lista de cuentas', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/users', { cookies: asOperator });
      expect(response.status).toBe(403);
    });

    it('el owner desactiva a un operador: base primero, luego Cognito', async () => {
      const { url, disableUser, users } = await start();
      const response = await call(url, `/api/admin/users/${OPERATOR}/deactivate`, {
        method: 'POST',
        cookies: asOwner
      });
      expect(response.status).toBe(200);
      expect(disableUser).toHaveBeenCalledWith(OPERATOR);
      expect(await users.findById(OPERATOR)).toMatchObject({ active: false });
      // Sin fila activa, su sesión ya no pasa.
      const after = await call(url, '/api/admin/me', { cookies: asOperator });
      expect(after.status).toBe(403);
    });

    it('el owner no puede desactivarse a sí mismo', async () => {
      const { url, disableUser } = await start();
      const response = await call(url, `/api/admin/users/${OWNER}/deactivate`, {
        method: 'POST',
        cookies: asOwner
      });
      expect(response.status).toBe(409);
      expect(disableUser).not.toHaveBeenCalled();
    });

    it('un operador sí puede registrar movimientos: es su trabajo diario', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/stock/movements', {
        method: 'POST',
        cookies: asOperator,
        body: { variantId: VARIANT, type: 'inbound', quantity: 5, operationKey: 'clave-de-prueba' }
      });
      expect(response.status).toBe(201);
    });
  });

  describe('inventario', () => {
    it('firma el movimiento con la sesión e ignora el userId del cuerpo', async () => {
      const { url, recordMovement } = await start();
      const response = await call(url, '/api/admin/stock/movements', {
        method: 'POST',
        cookies: asOperator,
        body: {
          variantId: VARIANT, type: 'inbound', quantity: 5, operationKey: 'clave-de-prueba',
          userId: OWNER // intento de firmar como otro
        }
      });
      expect(response.status).toBe(201);
      expect(recordMovement).toHaveBeenCalledWith(expect.objectContaining({ userId: OPERATOR }));
    });

    // Decisión del dueño (A7.3): una venta que deja una variante en 0 tiene que
    // verse como «AGOTADO» al recargar, sin esperar el ISR.
    it('cada movimiento refresca `catalogo` en el sitio', async () => {
      const { url, revalidate } = await start();
      const response = await call(url, '/api/admin/stock/movements', {
        method: 'POST',
        cookies: asOperator,
        body: { variantId: VARIANT, type: 'sale', quantity: 1, operationKey: 'venta-de-prueba' }
      });
      expect(response.status).toBe(201);
      expect(response.body?.meta).toEqual({ revalidated: true });
      expect(revalidate).toHaveBeenCalledWith(['catalogo']);
    });

    it('si el sitio no confirma, el movimiento se registra igual', async () => {
      const { url, recordMovement } = await start({ revalidate: async () => false });
      const response = await call(url, '/api/admin/stock/movements', {
        method: 'POST',
        cookies: asOperator,
        body: { variantId: VARIANT, type: 'inbound', quantity: 5, operationKey: 'ingreso-de-prueba' }
      });
      expect(response.status).toBe(201);
      expect(response.body?.meta).toEqual({ revalidated: false });
      expect(recordMovement).toHaveBeenCalledOnce();
    });

    it('rechaza un cuerpo mal formado antes de tocar el servicio', async () => {
      const { url, recordMovement } = await start();
      const response = await call(url, '/api/admin/stock/movements', {
        method: 'POST',
        cookies: asOperator,
        body: { variantId: 'no-es-uuid', type: 'inbound', quantity: 5, operationKey: 'corta' }
      });
      expect(response.status).toBe(400);
      expect(recordMovement).not.toHaveBeenCalled();
    });

    it('traduce NOT_FOUND del servicio a 404', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/stock/019299a4-0000-7000-8000-0000000000bb/kardex', {
        cookies: asOperator
      });
      expect(response.status).toBe(404);
    });

    it('lista el stock de menor a mayor y filtra por bajo stock', async () => {
      const { url } = await start();
      const todo = await call(url, '/api/admin/stock', { cookies: asOperator });
      expect(todo.status).toBe(200);
      expect((todo.body?.data as StockRow[]).map(r => r.stock)).toEqual([2, 40]);

      const bajo = await call(url, '/api/admin/stock?lowStock=true&threshold=5', { cookies: asOperator });
      expect((bajo.body?.data as StockRow[]).map(r => r.variantName)).toEqual(['Mango Ice']);
    });

    it('el umbral de bajo stock es global y lo cambia solo el dueño', async () => {
      const { url } = await start();
      const initial = await call(url, '/api/admin/stock/threshold', { cookies: asOperator });
      expect(initial.body?.data).toEqual({ threshold: 5 });

      const denied = await call(url, '/api/admin/stock/threshold', {
        method: 'PUT', cookies: asOperator, body: { threshold: 1 }
      });
      expect(denied.status).toBe(403);

      const invalid = await call(url, '/api/admin/stock/threshold', {
        method: 'PUT', cookies: asOwner, body: { threshold: -1 }
      });
      expect(invalid.status).toBe(400);

      const saved = await call(url, '/api/admin/stock/threshold', {
        method: 'PUT', cookies: asOwner, body: { threshold: 1 }
      });
      expect(saved.status).toBe(200);
      expect(saved.body?.data).toEqual({ threshold: 1 });

      // Sin `threshold` en la consulta, el filtro usa el configurado: Mango Ice
      // (2 unidades) ya no está en bajo stock con umbral 1.
      const low = await call(url, '/api/admin/stock?lowStock=true', { cookies: asOperator });
      expect(low.body?.meta).toEqual({ threshold: 1, configuredThreshold: 1 });
      expect(low.body?.data).toEqual([]);
    });

    it('avisa sin bloquear sobre variantes publicadas con stock y sin imagen', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/stock/image-alerts', { cookies: asOperator });
      expect(response.status).toBe(200);
      expect(response.body?.meta).toEqual({ count: 1 });
      expect((response.body?.data as StockRow[]).map(row => row.variantId)).toEqual([VARIANT]);
    });
  });

  describe('inicio de sesión', () => {
    it('abre la sesión y deja las cookies httpOnly, sin devolver tokens', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/auth/login', {
        method: 'POST',
        body: { email: 'owner@vapeupar.com', password: 'una-contrasena-larga' }
      });
      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toContain(OWNER);
      const cookies = response.setCookies.join(';');
      expect(cookies).toContain('vp_admin_at=');
      expect(cookies).toContain('HttpOnly');
      expect(cookies).toContain('SameSite=Strict');
      expect(cookies).toContain('Path=/api/admin');
    });

    it('no abre sesión a quien no tiene fila en User', async () => {
      const { url } = await start({
        login: async () => ({
          status: 'authenticated',
          session: { accessToken: STRANGER, refreshToken: 'rt', expiresIn: 3600 }
        })
      });
      const response = await call(url, '/api/admin/auth/login', {
        method: 'POST',
        body: { email: 'ajeno@vapeupar.com', password: 'una-contrasena-larga' }
      });
      expect(response.status).toBe(403);
      // Ninguna cookie de sesión con valor: solo las de borrado.
      expect(response.setCookies.join(';')).not.toContain(`vp_admin_at=${STRANGER}`);
    });

    it('guarda el reto de contraseña temporal en cookie, no en el cuerpo', async () => {
      const { url } = await start({
        login: async () => ({ status: 'new_password_required', challengeSession: 'sesion-del-reto' })
      });
      const response = await call(url, '/api/admin/auth/login', {
        method: 'POST',
        body: { email: 'owner@vapeupar.com', password: 'temporal-de-invitacion' }
      });
      expect(response.status).toBe(200);
      expect(response.body?.data).toEqual({ status: 'new_password_required' });
      expect(JSON.stringify(response.body)).not.toContain('sesion-del-reto');
      expect(response.setCookies.join(';')).toContain('vp_admin_ch=sesion-del-reto');
    });

    it('exige el reto en curso para cambiar la contraseña', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/auth/new-password', {
        method: 'POST',
        body: { email: 'owner@vapeupar.com', password: 'contrasena-nueva-123' }
      });
      expect(response.status).toBe(400);
    });

    it('traduce las credenciales incorrectas a 401', async () => {
      const { url } = await start({
        login: async () => { throw new AuthError('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos'); }
      });
      const response = await call(url, '/api/admin/auth/login', {
        method: 'POST',
        body: { email: 'owner@vapeupar.com', password: 'equivocada-pero-larga' }
      });
      expect(response.status).toBe(401);
    });
  });

  describe('verificación en dos pasos (TOTP)', () => {
    const credentials = { email: 'owner@vapeupar.com', password: 'una-contrasena-larga' };

    it('con TOTP activo pide el código y no abre sesión hasta resolverlo', async () => {
      const { url } = await start({
        login: async () => ({ status: 'mfa_required', challengeSession: 'sesion-mfa' })
      });
      const response = await call(url, '/api/admin/auth/login', { method: 'POST', body: credentials });
      expect(response.status).toBe(200);
      expect(response.body?.data).toEqual({ status: 'mfa_required' });
      expect(JSON.stringify(response.body)).not.toContain('sesion-mfa');
      const cookies = response.setCookies.join(';');
      expect(cookies).toContain('vp_admin_mfa=c%3Asesion-mfa');
      expect(cookies).not.toContain('vp_admin_at=');
    });

    it('el código correcto abre la sesión', async () => {
      const { url, mfa } = await start();
      const response = await call(url, '/api/admin/auth/mfa', {
        method: 'POST',
        body: { email: 'owner@vapeupar.com', code: '123 456' },
        cookies: { vp_admin_mfa: 'c:sesion-mfa' }
      });
      expect(response.status).toBe(200);
      expect(mfa.respondMfa).toHaveBeenCalledWith('owner@vapeupar.com', '123456', 'sesion-mfa');
      expect(response.setCookies.join(';')).toContain(`vp_admin_at=${OWNER}`);
    });

    it('un código incorrecto responde 400 sin abrir sesión', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/auth/mfa', {
        method: 'POST',
        body: { email: 'owner@vapeupar.com', code: '000000' },
        cookies: { vp_admin_mfa: 'c:sesion-mfa' }
      });
      expect(response.status).toBe(400);
      expect(response.body?.code).toBe('INVALID_MFA_CODE');
      expect(response.setCookies.join(';')).not.toContain(`vp_admin_at=${OWNER}`);
    });

    it('sin un paso de MFA en curso no acepta códigos', async () => {
      const { url } = await start();
      const response = await call(url, '/api/admin/auth/mfa', {
        method: 'POST',
        body: { email: 'owner@vapeupar.com', code: '123456' }
      });
      expect(response.status).toBe(400);
    });

    it('rechaza códigos que no son 6 dígitos', async () => {
      const { url, mfa } = await start();
      const response = await call(url, '/api/admin/auth/mfa', {
        method: 'POST',
        body: { email: 'owner@vapeupar.com', code: '12ab56' },
        cookies: { vp_admin_mfa: 'c:sesion-mfa' }
      });
      expect(response.status).toBe(400);
      expect(mfa.respondMfa).not.toHaveBeenCalled();
    });

    it('si se exige MFA, una cuenta sin TOTP no entra: primero lo enrola', async () => {
      const { url, mfa } = await start({ requireMfa: true });
      const response = await call(url, '/api/admin/auth/login', { method: 'POST', body: credentials });
      expect(response.status).toBe(200);
      expect(response.body?.data).toMatchObject({ status: 'mfa_setup', secret: 'SECRETOTOTP' });
      expect((response.body?.data as { otpauthUri: string }).otpauthUri)
        .toBe('otpauth://totp/Vapeupar%3Aowner%40vapeupar.com?secret=SECRETOTOTP&issuer=Vapeupar');
      expect(mfa.startMfaSetup).toHaveBeenCalledWith({ accessToken: OWNER });
      const cookies = response.setCookies.join(';');
      expect(cookies).not.toContain('vp_admin_at=');
      expect(cookies).toContain(`vp_admin_mfa=t%3A${OWNER}`);
      expect(cookies).toContain('vp_admin_mfa_rt=rt');
    });

    it('al verificar el primer código activa TOTP y abre la sesión', async () => {
      const { url, mfa } = await start({ requireMfa: true });
      const response = await call(url, '/api/admin/auth/mfa', {
        method: 'POST',
        body: { email: 'owner@vapeupar.com', code: '123456' },
        cookies: { vp_admin_mfa: `t:${OWNER}`, vp_admin_mfa_rt: 'rt' }
      });
      expect(response.status).toBe(200);
      expect(mfa.verifyMfaSetup).toHaveBeenCalledWith({ accessToken: OWNER }, '123456');
      expect(mfa.enableTotp).toHaveBeenCalledWith(OWNER);
      const cookies = response.setCookies.join(';');
      expect(cookies).toContain(`vp_admin_at=${OWNER}`);
      expect(cookies).toContain('vp_admin_rt=rt');
    });

    it('la cookie de enrolamiento no sirve como sesión', async () => {
      const { url } = await start({ requireMfa: true });
      const response = await call(url, '/api/admin/me', { cookies: { vp_admin_mfa: `t:${OWNER}` } });
      expect(response.status).toBe(401);
    });

    it('no enrola TOTP a quien no tiene acceso a la consola', async () => {
      const { url, mfa } = await start({
        requireMfa: true,
        login: async () => ({
          status: 'authenticated',
          session: { accessToken: STRANGER, refreshToken: 'rt', expiresIn: 3600 }
        })
      });
      const response = await call(url, '/api/admin/auth/login', { method: 'POST', body: credentials });
      expect(response.status).toBe(403);
      expect(mfa.startMfaSetup).not.toHaveBeenCalled();
    });

    it('el enrolamiento que pide Cognito (MFA_SETUP) también se resuelve', async () => {
      const { url, mfa } = await start({
        requireMfa: true,
        login: async () => ({ status: 'mfa_setup_required', challengeSession: 'sesion-setup' })
      });
      const login = await call(url, '/api/admin/auth/login', { method: 'POST', body: credentials });
      expect(login.body?.data).toMatchObject({ status: 'mfa_setup' });
      expect(mfa.startMfaSetup).toHaveBeenCalledWith({ session: 'sesion-setup' });
      const done = await call(url, '/api/admin/auth/mfa', {
        method: 'POST',
        body: { email: 'owner@vapeupar.com', code: '123456' },
        cookies: { vp_admin_mfa: 'e:sesion-setup' }
      });
      expect(done.status).toBe(200);
      expect(done.setCookies.join(';')).toContain(`vp_admin_at=${OWNER}`);
    });
  });

  describe('límite de peticiones', () => {
    it('el del admin salta antes que el público', async () => {
      // El público va a 100 por minuto; el admin, a 3 en esta prueba.
      const { url } = await start({ rateLimits: { adminMax: 3, publicMax: 100 } });
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) {
        codes.push((await call(url, '/api/admin/me', { cookies: asOwner })).status);
      }
      expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
      expect(codes.slice(3)).toEqual([429, 429]);
    });

    it('el login tiene su propio límite, más estricto', async () => {
      const { url } = await start({
        rateLimits: { loginMax: 2, adminMax: 100 },
        login: async () => { throw new AuthError('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos'); }
      });
      const codes: number[] = [];
      for (let i = 0; i < 4; i++) {
        codes.push((await call(url, '/api/admin/auth/login', {
          method: 'POST',
          body: { email: 'owner@vapeupar.com', password: 'equivocada-pero-larga' }
        })).status);
      }
      expect(codes).toEqual([401, 401, 429, 429]);
    });
  });
});
