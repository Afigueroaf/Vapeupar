// Utilidades compartidas por los scripts de infra: leen lo que publican los
// stacks en SSM (/vapeupar/<env>/*) y Secrets Manager mediante el AWS CLI, para
// no añadir el SDK como dependencia solo por dos scripts.
import { execFileSync } from 'node:child_process';

// Primer argumento que no sea una opción (`--algo`): así `script --flag` no
// toma la opción por nombre de entorno.
export const envName = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'dev';

/** Puerto local del túnel a RDS; lo comparten db-tunnel y write-backend-env. */
export const localDbPort = process.env.VAPEUPAR_DB_LOCAL_PORT ?? '15432';

export function aws(args) {
  return execFileSync('aws', [...args, '--output', 'text'], { encoding: 'utf8' }).trim();
}

export function getParam(key) {
  try {
    return aws(['ssm', 'get-parameter', '--name', `/vapeupar/${envName}/${key}`, '--query', 'Parameter.Value']);
  } catch {
    throw new Error(
      `No existe /vapeupar/${envName}/${key}. ¿Está desplegado el entorno "${envName}"? (npm run infra:deploy)`,
    );
  }
}

/**
 * Todos los parámetros bajo `/vapeupar/<env>/<path>/`, como `{ NOMBRE: valor }`.
 * El CLI pagina solo.
 */
export function getParamsByPath(subpath) {
  const out = execFileSync(
    'aws',
    ['ssm', 'get-parameters-by-path', '--path', `/vapeupar/${envName}/${subpath}`, '--output', 'json'],
    { encoding: 'utf8' },
  );
  return Object.fromEntries(JSON.parse(out).Parameters.map((p) => [p.Name.split('/').pop(), p.Value]));
}

export function getSecretJson(arn) {
  return JSON.parse(aws(['secretsmanager', 'get-secret-value', '--secret-id', arn, '--query', 'SecretString']));
}

export function getSecretString(arn) {
  return aws(['secretsmanager', 'get-secret-value', '--secret-id', arn, '--query', 'SecretString']);
}
