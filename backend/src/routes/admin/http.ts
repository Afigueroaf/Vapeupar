import { Response } from 'express';
import { z, ZodError } from 'zod';
import { AuthError, AuthErrorCode } from '../../services/auth.service.js';
import { CatalogError, CatalogErrorCode } from '../../services/catalog.service.js';
import { ContentError, ContentErrorCode } from '../../services/content.service.js';
import { StockError, StockErrorCode } from '../../services/stock.service.js';

/**
 * Traducción de errores de dominio a HTTP, en un solo sitio: los servicios
 * devuelven códigos y ninguno conoce el protocolo (plan A3/A4).
 */

const STOCK_STATUS: Record<StockErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  INSUFFICIENT_STOCK: 409,
  OPERATION_KEY_CONFLICT: 409
};

const AUTH_STATUS: Record<AuthErrorCode, number> = {
  INVALID_CREDENTIALS: 401,
  PASSWORD_REJECTED: 400,
  SESSION_EXPIRED: 401,
  ALREADY_EXISTS: 409,
  THROTTLED: 429,
  // El reto existe en Cognito pero la consola aún no sabe resolverlo (MFA).
  UNSUPPORTED_CHALLENGE: 501,
  UPSTREAM: 502
};

const CATALOG_STATUS: Record<CatalogErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  // Los cuatro son conflictos con el estado actual del catálogo, no cuerpos
  // mal formados: el cliente no arregla nada reintentando igual.
  DUPLICATE_SLUG: 409,
  IMMUTABLE_SLUG: 409,
  NOT_PUBLISHABLE: 409,
  CONFLICT: 409
};

const CONTENT_STATUS: Record<ContentErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409
};

export function sendValidationError(res: Response, error: ZodError, message = 'Datos inválidos'): void {
  res.status(400).json({
    success: false,
    message,
    errors: error.issues.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }))
  });
}

/**
 * Devuelve `true` si el error era de dominio y ya se respondió. Lo demás se
 * pasa al manejador global, que no filtra detalles en producción.
 */
export function sendDomainError(res: Response, error: unknown): boolean {
  if (error instanceof StockError) {
    res.status(STOCK_STATUS[error.code]).json({ success: false, message: error.message, code: error.code });
    return true;
  }
  if (error instanceof AuthError) {
    res.status(AUTH_STATUS[error.code]).json({ success: false, message: error.message, code: error.code });
    return true;
  }
  if (error instanceof CatalogError) {
    res.status(CATALOG_STATUS[error.code]).json({
      success: false,
      message: error.message,
      code: error.code,
      // Qué falta para publicar: la consola lo muestra como lista (A5.3).
      ...(error.details && { missing: error.details })
    });
    return true;
  }
  if (error instanceof ContentError) {
    res.status(CONTENT_STATUS[error.code]).json({ success: false, message: error.message, code: error.code });
    return true;
  }
  return false;
}

/**
 * Valida y, si falla, responde 400 y devuelve `undefined`. Ahorra el mismo
 * `if (!parsed.success)` en cada ruta del CRUD, que son muchas.
 */
export function parseOrFail<T extends z.ZodType>(
  schema: T,
  input: unknown,
  res: Response,
  message: string
): z.output<T> | undefined {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    sendValidationError(res, parsed.error, message);
    return undefined;
  }
  return parsed.data;
}

/** Respuesta paginada, con la misma forma que `GET /api/admin/stock`. */
export function sendPage<T>(
  res: Response,
  page: { rows: T[]; total: number },
  paging: { page: number; limit: number }
): void {
  res.json({
    success: true,
    data: page.rows,
    pagination: {
      total: page.total,
      page: paging.page,
      limit: paging.limit,
      totalPages: Math.max(1, Math.ceil(page.total / paging.limit))
    }
  });
}
