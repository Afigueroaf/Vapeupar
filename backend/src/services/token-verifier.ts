import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { getCognitoConfig } from '../config/cognito.js';

/**
 * Verificación de firma del access token contra el JWKS del pool
 * (plan A4.1). Aislado de `require-auth` para que el middleware se pueda
 * probar sin red: el test inyecta su propio verificador.
 */
export interface AccessTokenClaims {
  /** Identificador del usuario en Cognito; es la clave de la tabla `User`. */
  sub: string;
  /**
   * Nombre de usuario real, que no es el correo: el pool usa el correo como
   * alias (`signInAliases: { email: true }`), así que el usuario se crea con un
   * UUID. Hace falta para el `SECRET_HASH` de la renovación.
   */
  username: string;
  /** Vencimiento en segundos desde epoch. */
  exp: number;
}

/** El token es válido pero ya venció: se puede intentar renovar. */
export class TokenExpiredError extends Error {
  constructor() {
    super('El access token venció');
    this.name = 'TokenExpiredError';
  }
}

/** El token no es válido: firma, emisor, destinatario o formato. */
export class TokenInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenInvalidError';
  }
}

export type AccessTokenVerifier = (token: string) => Promise<AccessTokenClaims>;

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

function getVerifier() {
  if (!verifier) {
    const { userPoolId, clientId } = getCognitoConfig();
    verifier = CognitoJwtVerifier.create({ userPoolId, tokenUse: 'access', clientId });
  }
  return verifier;
}

export const verifyAccessToken: AccessTokenVerifier = async (token) => {
  try {
    const payload = await getVerifier().verify(token);
    return {
      sub: String(payload.sub),
      username: String(payload.username ?? payload['cognito:username'] ?? ''),
      exp: Number(payload.exp)
    };
  } catch (error) {
    // `aws-jwt-verify` distingue el vencimiento del resto por el nombre del
    // error; solo ese caso justifica gastar el refresh token.
    if (error instanceof Error && error.name === 'JwtExpiredError') {
      throw new TokenExpiredError();
    }
    throw new TokenInvalidError(error instanceof Error ? error.message : 'Token inválido');
  }
};

/** Solo para los tests: olvida el verificador memorizado. */
export function resetVerifier(): void {
  verifier = undefined;
}
