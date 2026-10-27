import { Response } from 'express';
import { ZodError } from 'zod';
import { AuthError, AuthErrorCode } from '../../services/auth.service.js';
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
  return false;
}
