import express, { Express, NextFunction, Request, Response, Router } from 'express';
import cookieParser from 'cookie-parser';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { productRouter } from './routes/product.routes.js';
import { createAdminRouter } from './routes/admin/index.js';
import { createBrandsPublicRouter, createContentPublicRouter } from './routes/site.routes.js';
import { createOrdersPublicRouter } from './routes/order.routes.js';
import { DATA_POLICY_VERSION, isDraftPolicyVersion } from './schemas/order.schema.js';

/**
 * Armado de la aplicación, separado de `index.ts` para poder levantarla en un
 * puerto efímero desde los tests sin arrancar el proceso real.
 */
export interface AppOptions {
  /** Se sustituye en los tests por un router con dependencias en memoria. */
  adminRouter?: Router;
  /** Lectura pública de contenido y marcas aliadas; en los tests, en memoria. */
  contentRouter?: Router;
  brandsRouter?: Router;
  /** Pedidos públicos (ADR-003); en los tests, en memoria. */
  ordersRouter?: Router;
  /**
   * Interruptor de `POST /api/orders`. Por defecto, `ORDERS_ENABLED=true` en el
   * entorno; apagado, la ruta no existe (404). Se enciende solo con la
   * aprobación del dueño y la política de datos revisada (ADR-003 §5).
   */
  ordersEnabled?: boolean;
  /**
   * Versión vigente de la política de datos, para la guarda de abajo. Por
   * defecto `DATA_POLICY_VERSION`; los tests simulan una ya revisada.
   */
  dataPolicyVersion?: string;
  /** Límites por ventana; los valores por defecto son los de producción. */
  rateLimits?: { publicMax?: number; adminMax?: number; loginMax?: number; ordersMax?: number };
}

/** Cuerpo máximo del público. La edición de contenido del admin necesita más. */
const PUBLIC_BODY_LIMIT = '20kb';
const ADMIN_BODY_LIMIT = '256kb';

const rateLimitMessage = (message: string) => ({ success: false, message });

/** Error de `body-parser` (lo usa `express.json`): `type` `entity.*` o `encoding.*`/`charset.*` y un 4xx. */
function isBodyParserError(err: unknown): err is { type: string; status: number } {
  if (typeof err !== 'object' || err === null) return false;
  const { type, status } = err as { type?: unknown; status?: unknown };
  return typeof type === 'string'
    && /^(entity|encoding|charset|request)\./.test(type)
    && typeof status === 'number' && status >= 400 && status < 500;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const limits = options.rateLimits ?? {};

  // Detrás de un balanceador, `express-rate-limit` necesita saber cuántos saltos
  // de proxy puede creerse para no contar a todo el mundo bajo la misma IP.
  // Sin configurar no se confía en ninguno, que es lo correcto en local: creerse
  // un `X-Forwarded-For` sin proxy delante permitiría saltarse el límite.
  const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
  if (trustProxy > 0) app.set('trust proxy', trustProxy);

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));

  // --- Límite de peticiones, del más estricto al más laxo ---
  // El orden importa: el primero que coincide es el primero que corta, así que
  // una ráfaga contra el login se detiene por el límite del login y no por el
  // general. Todos los que coinciden se aplican, y por eso el del admin salta antes que el
  // público aunque la ruta esté bajo `/api`.
  app.use('/api/admin/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: limits.loginMax ?? 10,
    standardHeaders: true,
    legacyHeaders: false,
    // Contar solo los intentos fallidos: a quien acierta no se le penaliza.
    skipSuccessfulRequests: true,
    message: rateLimitMessage('Demasiados intentos de inicio de sesión. Espera unos minutos.')
  }));

  // Crear pedidos es la única escritura pública (ADR-003 §5). Solo cuenta un
  // POST que creó o repitió un pedido: ni la comprobación previa de CORS
  // (OPTIONS) ni los rechazos (4xx: un teléfono mal escrito, una línea
  // agotada). En redes móviles con CGNAT muchos clientes comparten IP, y un
  // error de tecleo no debe gastarles el cupo; el spam con cuerpos inválidos no
  // escribe nada y lo frena el límite general de `/api`. 10 por IP cada 15
  // minutos deja margen a varios clientes tras la misma IP y sigue cortando
  // una ráfaga de pedidos falsos.
  // Guarda: mientras la política de datos sea un borrador sin revisión legal,
  // no se registran pedidos con datos personales aunque el interruptor esté
  // encendido. Mismo 404 que con el interruptor apagado (ADR-003 §5): para el
  // público, la función sencillamente no existe todavía.
  const ordersSwitch = options.ordersEnabled ?? process.env.ORDERS_ENABLED === 'true';
  const draftPolicy = isDraftPolicyVersion(options.dataPolicyVersion ?? DATA_POLICY_VERSION);
  if (ordersSwitch && draftPolicy) {
    console.warn('[pedidos] ORDERS_ENABLED está encendido, pero la política de datos es un borrador: POST /api/orders sigue apagado');
  }
  const ordersEnabled = ordersSwitch && !draftPolicy;
  if (ordersEnabled) {
    app.use('/api/orders', rateLimit({
      windowMs: 15 * 60 * 1000,
      max: limits.ordersMax ?? 10,
      standardHeaders: true,
      legacyHeaders: false,
      skip: req => req.method !== 'POST',
      skipFailedRequests: true,
      message: rateLimitMessage('Demasiados pedidos seguidos desde esta conexión. Escríbenos por WhatsApp o espera unos minutos.')
    }));
  }

  app.use('/api/admin', rateLimit({
    windowMs: 1 * 60 * 1000,
    max: limits.adminMax ?? 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage('Demasiadas solicitudes a la consola. Espera un minuto.')
  }));

  app.use('/api', rateLimit({
    windowMs: 1 * 60 * 1000,
    max: limits.publicMax ?? 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage('Demasiadas solicitudes desde esta IP, por favor intenta nuevamente en un minuto.')
  }));

  // --- CORS: dos políticas, un solo middleware ---
  // Montar dos `cors()` duplicaría las cabeceras `Access-Control-Allow-Origin`,
  // que es justo lo que invalida la respuesta para el navegador. Por eso el
  // origen permitido se decide por petición.
  const publicOrigins = [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:3000'];
  const adminOrigins = [process.env.ADMIN_URL || 'http://localhost:3000'];

  app.use(cors((req, callback): void => {
    const isAdmin = req.path.startsWith('/api/admin');
    const allowed = isAdmin ? adminOrigins : publicOrigins;
    const origin = req.headers.origin;

    const options: CorsOptions = {
      // La consola siempre manda cookies, así que su origen tiene que ser
      // explícito: con credenciales, un `*` no vale.
      origin: isAdmin
        ? (!!origin && allowed.includes(origin))
        : (!origin || allowed.includes(origin)),
      credentials: true
    };
    callback(null, options);
  }));

  // --- Cuerpos ---
  // El del admin va primero y solo sobre su prefijo; el global ve el cuerpo ya
  // consumido y lo deja pasar.
  app.use(cookieParser());
  app.use('/api/admin', express.json({ limit: ADMIN_BODY_LIMIT }));
  app.use(express.json({ limit: PUBLIC_BODY_LIMIT }));

  // Health check endpoint (outside rate limit for monitoring)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'vapeupar-backend',
      timestamp: new Date().toISOString()
    });
  });

  app.use('/api/products', productRouter);
  app.use('/api/content', options.contentRouter ?? createContentPublicRouter());
  app.use('/api/brands', options.brandsRouter ?? createBrandsPublicRouter());
  // Apagado, la ruta no se monta y responde el 404 genérico de abajo: igual que
  // cualquier ruta inexistente, sin anunciar una función que aún no está abierta.
  if (ordersEnabled) app.use('/api/orders', options.ordersRouter ?? createOrdersPublicRouter());
  app.use('/api/admin', options.adminRouter ?? createAdminRouter());

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      message: 'Endpoint no encontrado'
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Cuerpo que `express.json` rechaza (JSON mal formado, demasiado grande,
    // codificación). El error lleva el cuerpo crudo en `err.body`, que en un
    // pedido trae nombre y teléfono: se registra solo el tipo, nunca el error
    // entero, y se responde su 4xx en vez de un 500.
    if (isBodyParserError(err)) {
      console.warn(`[petición] cuerpo rechazado: ${err.type}`);
      res.status(err.status).json({
        success: false,
        message: err.status === 413 ? 'El cuerpo de la petición es demasiado grande' : 'El cuerpo de la petición no es JSON válido'
      });
      return;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const errorMessage = err instanceof Error ? err.message : 'Error interno del servidor';

    console.error(`[ERROR] ${new Date().toISOString()}:`, err);

    res.status(500).json({
      success: false,
      message: isProduction ? 'Ocurrió un error inesperado' : errorMessage
    });
  });

  return app;
}
