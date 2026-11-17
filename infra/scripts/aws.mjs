// Utilidades compartidas por los scripts de infra: leen lo que publican los
// stacks en SSM (/vapeupar/<env>/*) y Secrets Manager mediante el AWS CLI, para
// no añadir el SDK como dependencia solo por dos scripts.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

/**
 * URL pública con la que se comprueba un despliegue «desde fuera»: la que ve el
 * cliente, `NEXT_PUBLIC_SITE_URL` (SSM `web/`, que el rol de despliegue ya puede
 * leer). Sin ella, `http://<IP elástica>`.
 *
 * Por la IP ya no vale en cuanto hay TLS (F4): http redirige a https://<IP> y
 * el certificado es del nombre, no de la IP. Así falló la release del
 * 2026-11-17, ya activa y sana, en este último paso.
 */
export function publicSiteUrl(publicIp) {
  const site = getParamsByPath('web').NEXT_PUBLIC_SITE_URL?.trim();
  return (site || `http://${publicIp}`).replace(/\/+$/, '');
}

export const REGION = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';

function awsJson(args) {
  return JSON.parse(execFileSync('aws', [...args, '--region', REGION, '--output', 'json'], { encoding: 'utf8' }));
}

/**
 * Ejecuta `infra/deploy/activate.sh` en la instancia por SSM (Run Command) y
 * espera a que termine, mostrando su salida. Lanza un error si no acaba en
 * `Success`. Lo usan `deploy-app.mjs` (release nueva) y `rollback-app.mjs`
 * (versionId `-`: reactivar una release que sigue en la instancia).
 *
 * El script va DENTRO del comando (base64), no se descarga aparte: lo que se
 * ejecuta es exactamente el de este checkout.
 */
export async function runActivate(instanceId, args, comment) {
  const script = fs
    .readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'deploy', 'activate.sh'))
    .toString('base64');
  for (const a of args) {
    // Van entre comillas simples en el comando: nada de comillas ni saltos.
    if (!/^[A-Za-z0-9._\-/:]+$/.test(a)) throw new Error(`argumento no válido para activate.sh: "${a}"`);
  }
  const params = {
    commands: [
      'set -e',
      'F=$(mktemp)',
      `echo '${script}' | base64 -d > "$F"`,
      `bash "$F" ${args.map((a) => `'${a}'`).join(' ')}; R=$?`,
      'rm -f "$F"; exit $R',
    ],
    executionTimeout: ['900'],
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vapeupar-ssm-'));
  try {
    const paramsFile = path.join(dir, 'ssm-params.json');
    fs.writeFileSync(paramsFile, JSON.stringify(params));
    const sent = awsJson(['ssm', 'send-command', '--instance-ids', instanceId, '--document-name', 'AWS-RunShellScript',
      '--comment', comment.slice(0, 100), '--timeout-seconds', '600',
      '--parameters', `file://${paramsFile}`]);
    const commandId = sent.Command.CommandId;
    console.log(`
[ssm] ejecutando en ${instanceId} (comando ${commandId})`);

    let inv;
    for (;;) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        inv = awsJson(['ssm', 'get-command-invocation', '--command-id', commandId, '--instance-id', instanceId]);
      } catch {
        continue; // la invocación tarda unos segundos en existir
      }
      if (!['Pending', 'InProgress', 'Delayed'].includes(inv.Status)) break;
      process.stdout.write('.');
    }
    console.log(`
${inv.StandardOutputContent}`);
    if (inv.StandardErrorContent) console.error(inv.StandardErrorContent);
    if (inv.Status !== 'Success') {
      throw new Error(`activate.sh terminó en ${inv.Status}: revisa la salida de arriba`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
