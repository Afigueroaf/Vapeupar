import { createHmac } from 'node:crypto';
import {
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminUserGlobalSignOutCommand,
  AssociateSoftwareTokenCommand,
  AuthFlowType,
  ChallengeNameType,
  CognitoIdentityProviderClient,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  SetUserMFAPreferenceCommand,
  VerifySoftwareTokenCommand,
  VerifySoftwareTokenResponseType
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
  | 'INVALID_MFA_CODE'
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
  | { status: 'new_password_required'; challengeSession: string }
  /** La cuenta tiene TOTP: falta el código de 6 dígitos (`SOFTWARE_TOKEN_MFA`). */
  | { status: 'mfa_required'; challengeSession: string }
  /**
   * Cognito exige enrolar TOTP antes de dar tokens (`MFA_SETUP`). Solo ocurre
   * con un pool de MFA obligatoria; con el pool actual (opcional) la exigencia
   * la pone el backend, ver `routes/admin/auth.routes.ts`.
   */
  | { status: 'mfa_setup_required'; challengeSession: string };

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

/** Respuesta de `InitiateAuth` o `RespondToAuthChallenge`: tokens o el siguiente reto. */
function toLoginResult(response: {
  ChallengeName?: string;
  Session?: string;
  AuthenticationResult?: { AccessToken?: string; RefreshToken?: string; ExpiresIn?: number };
}): LoginResult {
  if (!response.ChallengeName) {
    return { status: 'authenticated', session: toSession(response.AuthenticationResult) };
  }
  if (!response.Session) throw new AuthError('UPSTREAM', 'Cognito no devolvió la sesión del reto');
  switch (response.ChallengeName) {
    case ChallengeNameType.NEW_PASSWORD_REQUIRED:
      return { status: 'new_password_required', challengeSession: response.Session };
    case ChallengeNameType.SOFTWARE_TOKEN_MFA:
      return { status: 'mfa_required', challengeSession: response.Session };
    case ChallengeNameType.MFA_SETUP:
      return { status: 'mfa_setup_required', challengeSession: response.Session };
    default:
      // SMS, correo o selección de factor: el pool solo tiene TOTP habilitado.
      throw new AuthError('UNSUPPORTED_CHALLENGE', `Reto no soportado: ${response.ChallengeName}`);
  }
}

/** Errores de los pasos de MFA: un código malo no es una sesión vencida. */
function translateMfa(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const name = error instanceof Error ? error.name : '';
  if (name === 'CodeMismatchException' || name === 'EnableSoftwareTokenMFAException') {
    return new AuthError('INVALID_MFA_CODE', 'El código no es válido; revisa la hora del teléfono y prueba con el siguiente');
  }
  if (name === 'NotAuthorizedException' || name === 'ExpiredCodeException') {
    return new AuthError('SESSION_EXPIRED', 'El paso de verificación venció; vuelve a iniciar sesión');
  }
  return translate(error);
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const { clientId } = getCognitoConfig();
  try {
    const response = await getClient().send(new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: { USERNAME: email, PASSWORD: password, SECRET_HASH: secretHash(email) }
    }));

    return toLoginResult(response);
  } catch (error) {
    throw error instanceof AuthError ? error : translate(error);
  }
}

/**
 * Resuelve NEW_PASSWORD_REQUIRED con la contraseña definitiva. Puede devolver
 * otro reto (MFA) en lugar de los tokens.
 */
export async function completeNewPassword(
  email: string,
  newPassword: string,
  challengeSession: string
): Promise<LoginResult> {
  const { clientId } = getCognitoConfig();
  try {
    const response = await getClient().send(new RespondToAuthChallengeCommand({
      ClientId: clientId,
      ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
      Session: challengeSession,
      ChallengeResponses: { USERNAME: email, NEW_PASSWORD: newPassword, SECRET_HASH: secretHash(email) }
    }));
    return toLoginResult(response);
  } catch (error) {
    throw error instanceof AuthError ? error : translate(error);
  }
}

/** Resuelve SOFTWARE_TOKEN_MFA con el código de la app autenticadora. */
export async function respondMfa(email: string, code: string, challengeSession: string): Promise<CognitoSession> {
  const { clientId } = getCognitoConfig();
  try {
    const response = await getClient().send(new RespondToAuthChallengeCommand({
      ClientId: clientId,
      ChallengeName: ChallengeNameType.SOFTWARE_TOKEN_MFA,
      Session: challengeSession,
      ChallengeResponses: { USERNAME: email, SOFTWARE_TOKEN_MFA_CODE: code, SECRET_HASH: secretHash(email) }
    }));
    const result = toLoginResult(response);
    if (result.status !== 'authenticated') {
      throw new AuthError('UNSUPPORTED_CHALLENGE', `Reto inesperado tras el código: ${result.status}`);
    }
    return result.session;
  } catch (error) {
    throw translateMfa(error);
  }
}

/**
 * Con qué se enrola TOTP: la sesión del reto `MFA_SETUP` (pool de MFA
 * obligatoria) o el access token de una sesión recién abierta sin MFA (pool
 * opcional con la exigencia puesta por el backend).
 */
export type MfaSetupSource = { session: string } | { accessToken: string };

function sourceParams(source: MfaSetupSource): { Session?: string; AccessToken?: string } {
  return 'session' in source ? { Session: source.session } : { AccessToken: source.accessToken };
}

/**
 * Pide a Cognito el secreto TOTP. Con una sesión de reto devuelve además la
 * sesión nueva, que es la que vale para el paso siguiente.
 */
export async function startMfaSetup(source: MfaSetupSource): Promise<{ secret: string; session?: string }> {
  try {
    const response = await getClient().send(new AssociateSoftwareTokenCommand(sourceParams(source)));
    if (!response.SecretCode) throw new AuthError('UPSTREAM', 'Cognito no devolvió el secreto TOTP');
    return { secret: response.SecretCode, session: response.Session };
  } catch (error) {
    throw translateMfa(error);
  }
}

/** Comprueba el primer código de la app. Con sesión de reto, devuelve la sesión nueva. */
export async function verifyMfaSetup(source: MfaSetupSource, code: string): Promise<{ session?: string }> {
  try {
    const response = await getClient().send(new VerifySoftwareTokenCommand({
      ...sourceParams(source),
      UserCode: code,
      FriendlyDeviceName: 'Consola Vapeupar'
    }));
    if (response.Status !== VerifySoftwareTokenResponseType.SUCCESS) {
      throw new AuthError('INVALID_MFA_CODE', 'El código no es válido; prueba con el siguiente');
    }
    return { session: response.Session };
  } catch (error) {
    throw translateMfa(error);
  }
}

/** Cierra el reto `MFA_SETUP` una vez verificado el código: entrega los tokens. */
export async function completeMfaSetup(email: string, challengeSession: string): Promise<CognitoSession> {
  const { clientId } = getCognitoConfig();
  try {
    const response = await getClient().send(new RespondToAuthChallengeCommand({
      ClientId: clientId,
      ChallengeName: ChallengeNameType.MFA_SETUP,
      Session: challengeSession,
      ChallengeResponses: { USERNAME: email, SECRET_HASH: secretHash(email) }
    }));
    const result = toLoginResult(response);
    if (result.status !== 'authenticated') {
      throw new AuthError('UNSUPPORTED_CHALLENGE', `Reto inesperado tras enrolar MFA: ${result.status}`);
    }
    return result.session;
  } catch (error) {
    throw translateMfa(error);
  }
}

/**
 * Deja TOTP activo y preferido para el usuario del token. A partir de aquí,
 * cada inicio de sesión llega con el reto `SOFTWARE_TOKEN_MFA`.
 */
export async function enableTotp(accessToken: string): Promise<void> {
  try {
    await getClient().send(new SetUserMFAPreferenceCommand({
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true }
    }));
  } catch (error) {
    throw translateMfa(error);
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
 * Invita a alguien a la consola. La contraseña temporal la genera y la envía
 * Cognito, y vence en 3 días (`tempPasswordValidity` del pool).
 *
 * **El nombre de usuario que se manda es el correo.** El pool se creó con
 * `signInAliases: { email: true }` y sin `username`, que en Cognito significa
 * `UsernameAttributes: ['email']`: el correo *es* el nombre de usuario, y
 * `AdminCreateUser` rechaza cualquier otra cosa con «Username should be an
 * email». Es lo contrario de un pool de alias (`AliasAttributes`), donde el
 * nombre de usuario va aparte y no puede tener forma de correo.
 *
 * El nombre real que asigna Cognito —un UUID— viene en la respuesta, y es el
 * que hay que guardar: el `SECRET_HASH` de `REFRESH_TOKEN_AUTH` se calcula con
 * él. En el flujo normal lo pone el claim `username` del access token; aquí se
 * devuelve para que el script de invitación pueda enseñarlo.
 */
export async function inviteUser(email: string): Promise<InvitedUser> {
  const { userPoolId } = getCognitoConfig();
  try {
    const response = await getClient().send(new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' }
      ],
      DesiredDeliveryMediums: ['EMAIL']
    }));
    const sub = response.User?.Attributes?.find(a => a.Name === 'sub')?.Value;
    if (!sub) throw new AuthError('UPSTREAM', 'Cognito no devolvió el sub del usuario creado');
    return { sub, email, username: response.User?.Username ?? sub };
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
