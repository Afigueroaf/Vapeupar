import { createHmac, randomUUID } from 'node:crypto';
import {
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminUserGlobalSignOutCommand,
  AuthFlowType,
  ChallengeNameType,
  CognitoIdentityProviderClient,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { getCognitoConfig } from '../config/cognito.js';

/**
 * Único archivo del sistema que importa el SDK de Cognito (ADR-002,
 * Consecuencias): el resto del backend habla de sesiones y roles, no de
 * `InitiateAuth`. Si se cambia de proveedor, se reescribe este archivo.
 */

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'PASSWORD_REJECTED'
  | 'SESSION_EXPIRED'
  | 'UNSUPPORTED_CHALLENGE'
  | 'ALREADY_EXISTS'
  | 'THROTTLED'
  | 'UPSTREAM';

/** La capa HTTP lo traduce a 401 / 400 / 409 / 429. */
export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface CognitoSession {
  accessToken: string;
  refreshToken: string;
  /** Segundos de validez del access token (60 min en el pool actual). */
  expiresIn: number;
}

export type LoginResult =
  | { status: 'authenticated'; session: CognitoSession }
  /**
   * Primer acceso: la contraseña de la invitación es temporal y Cognito exige
   * cambiarla. `challengeSession` es de un solo uso y no sirve para leer nada.
   */
  | { status: 'new_password_required'; challengeSession: string };

let client: CognitoIdentityProviderClient | undefined;

function getClient(): CognitoIdentityProviderClient {
  if (!client) client = new CognitoIdentityProviderClient({ region: getCognitoConfig().region });
  return client;
}

/** SECRET_HASH del cliente confidencial: HMAC-SHA256 de usuario + clientId. */
function secretHash(username: string): string {
  const { clientId, clientSecret } = getCognitoConfig();
  return createHmac('sha256', clientSecret).update(username + clientId).digest('base64');
}

/**
 * El pool tiene `preventUserExistenceErrors`, así que un usuario inexistente y
 * una contraseña incorrecta llegan aquí igual: ambos salen como
 * INVALID_CREDENTIALS y la consola no puede distinguirlos.
 */
function translate(error: unknown): AuthError {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
    case 'UserNotConfirmedException':
      return new AuthError('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos');
    case 'InvalidPasswordException':
    case 'PasswordResetRequiredException':
      return new AuthError('PASSWORD_REJECTED', 'La contraseña no cumple la política del pool');
    case 'CodeMismatchException':
    case 'ExpiredCodeException':
      return new AuthError('SESSION_EXPIRED', 'El reto de cambio de contraseña venció; vuelve a iniciar sesión');
    case 'UsernameExistsException':
    case 'AliasExistsException':
      return new AuthError('ALREADY_EXISTS', 'Ya existe un usuario con ese correo');
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return new AuthError('THROTTLED', 'Demasiados intentos; espera un momento');
    default:
      return new AuthError('UPSTREAM', error instanceof Error ? error.message : 'Error de Cognito');
  }
}

function toSession(
  result: { AccessToken?: string; RefreshToken?: string; ExpiresIn?: number } | undefined
): CognitoSession {
  if (!result?.AccessToken || !result.RefreshToken) {
    throw new AuthError('UPSTREAM', 'Cognito no devolvió los tokens de la sesión');
  }
  return {
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    expiresIn: result.ExpiresIn ?? 3600
  };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const { clientId } = getCognitoConfig();
  try {
    const response = await getClient().send(new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: { USERNAME: email, PASSWORD: password, SECRET_HASH: secretHash(email) }
    }));

    if (response.ChallengeName === ChallengeNameType.NEW_PASSWORD_REQUIRED) {
      if (!response.Session) throw new AuthError('UPSTREAM', 'Cognito no devolvió la sesión del reto');
      return { status: 'new_password_required', challengeSession: response.Session };
    }
    if (response.ChallengeName) {
      // MFA es opcional en dev y obligatoria en prod: cuando se active habrá que
      // resolver SOFTWARE_TOKEN_MFA aquí antes de desplegar la consola.
      throw new AuthError('UNSUPPORTED_CHALLENGE', `Reto no soportado todavía: ${response.ChallengeName}`);
    }
    return { status: 'authenticated', session: toSession(response.AuthenticationResult) };
  } catch (error) {
    throw error instanceof AuthError ? error : translate(error);
  }
}

/** Resuelve NEW_PASSWORD_REQUIRED con la contraseña definitiva. */
export async function completeNewPassword(
  email: string,
  newPassword: string,
  challengeSession: string
): Promise<CognitoSession> {
  const { clientId } = getCognitoConfig();
  try {
    const response = await getClient().send(new RespondToAuthChallengeCommand({
      ClientId: clientId,
      ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
      Session: challengeSession,
      ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword, SECRET_HASH: secretHash(email) }
    }));
    return toSession(response.AuthenticationResult);
  } catch (error) {
    throw error instanceof AuthError ? error : translate(error);
  }
}

/**
 * Renueva el access token. El SECRET_HASH va con el **nombre de usuario real**,
 * no con el correo: con alias de correo, Cognito rechaza el hash calculado
 * sobre el alias.
 */
export async function refresh(
  refreshToken: string,
  username: string
): Promise<Omit<CognitoSession, 'refreshToken'>> {
  const { clientId } = getCognitoConfig();
  try {
    const response = await getClient().send(new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
      AuthParameters: { REFRESH_TOKEN: refreshToken, SECRET_HASH: secretHash(username) }
    }));
    const result = response.AuthenticationResult;
    if (!result?.AccessToken) throw new AuthError('SESSION_EXPIRED', 'La sesión expiró; vuelve a iniciar sesión');
    return { accessToken: result.AccessToken, expiresIn: result.ExpiresIn ?? 3600 };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    const translated = translate(error);
    // Un refresh token revocado o vencido llega como NotAuthorizedException: no
    // son credenciales malas, es una sesión que terminó.
    throw translated.code === 'INVALID_CREDENTIALS'
      ? new AuthError('SESSION_EXPIRED', 'La sesión expiró; vuelve a iniciar sesión')
      : translated;
  }
}

/** Cierre de sesión del propio usuario: revoca todos sus refresh tokens. */
export async function signOut(accessToken: string): Promise<void> {
  try {
    await getClient().send(new GlobalSignOutCommand({ AccessToken: accessToken }));
  } catch (error) {
    // Si el token ya no vale, la sesión ya está cerrada: no es un fallo.
    const translated = translate(error);
    if (translated.code !== 'INVALID_CREDENTIALS') throw translated;
  }
}

export interface InvitedUser {
  /** `sub` de Cognito: la clave de la fila en `User`. */
  sub: string;
  email: string;
  /** Nombre de usuario real en el pool, necesario para deshabilitarlo luego. */
  username: string;
}

/**
 * Invita a alguien a la consola. El nombre de usuario es un UUID y no el
 * correo: con el correo como alias, Cognito no admite nombres de usuario en
 * formato de correo. La contraseña temporal la genera y la envía Cognito, y
 * vence en 3 días (`tempPasswordValidity` del pool).
 */
export async function inviteUser(email: string): Promise<InvitedUser> {
  const { userPoolId } = getCognitoConfig();
  const username = randomUUID();
  try {
    const response = await getClient().send(new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: username,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' }
      ],
      DesiredDeliveryMediums: ['EMAIL']
    }));
    const sub = response.User?.Attributes?.find(a => a.Name === 'sub')?.Value;
    if (!sub) throw new AuthError('UPSTREAM', 'Cognito no devolvió el sub del usuario creado');
    return { sub, email, username };
  } catch (error) {
    throw error instanceof AuthError ? error : translate(error);
  }
}

/**
 * Cierra las sesiones abiertas y deshabilita la cuenta en el pool. El orden
 * importa: primero se revocan los tokens, porque un access token sin vencer
 * seguiría sirviendo después de deshabilitar la cuenta.
 */
export async function disableUser(username: string): Promise<void> {
  const { userPoolId } = getCognitoConfig();
  try {
    await getClient().send(new AdminUserGlobalSignOutCommand({ UserPoolId: userPoolId, Username: username }));
    await getClient().send(new AdminDisableUserCommand({ UserPoolId: userPoolId, Username: username }));
  } catch (error) {
    throw error instanceof AuthError ? error : translate(error);
  }
}

/** Solo para los tests: olvida el cliente memorizado. */
export function resetAuthClient(): void {
  client = undefined;
}
