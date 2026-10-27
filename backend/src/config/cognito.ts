/**
 * Configuración del User Pool (stack `Vapeupar-dev-Auth`). Los valores llegan a
 * `backend/.env` con `npm run infra:env-backend`; aquí solo se validan.
 *
 * Se lee bajo demanda y no al importar: los tests unitarios de los middlewares
 * inyectan sus propias dependencias y no deben necesitar un entorno de AWS.
 */
export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  clientSecret: string;
}

let cached: CognitoConfig | undefined;

export function getCognitoConfig(): CognitoConfig {
  if (cached) return cached;

  const config = {
    region: process.env.AWS_REGION,
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID,
    clientSecret: process.env.COGNITO_CLIENT_SECRET
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Falta configuración de Cognito (${missing.join(', ')}). ` +
      'Ejecuta `npm run infra:env-backend` desde la raíz del repositorio.'
    );
  }

  cached = config as CognitoConfig;
  return cached;
}

/** Solo para los tests: olvida la configuración memorizada. */
export function resetCognitoConfig(): void {
  cached = undefined;
}
