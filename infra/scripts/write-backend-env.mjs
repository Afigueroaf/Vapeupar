// Escribe en backend/.env las variables que el backend necesita para hablar con
// el entorno AWS, leyéndolas de SSM y Secrets Manager. Conserva cualquier otra
// variable del archivo. No imprime valores, solo nombres.
//
//   npm run infra:env-backend          -> entorno dev
//
// Las URLs apuntan a localhost porque la base solo es alcanzable por el túnel
// (npm run infra:db-tunnel). Por el túnel el nombre del certificado de RDS no
// coincide con localhost, así que se cifra sin verificar el certificado; el
// tramo portátil-bastión ya va cifrado y autenticado por Session Manager.
//
//   DATABASE_URL          rol vapeupar_app: lo usa el backend en runtime.
//   MIGRATE_DATABASE_URL  usuario maestro: solo migraciones y db:sync-app-role.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { envName, getParam, getSecretJson, getSecretString, localDbPort } from './aws.mjs';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../backend/.env');
const localPort = localDbPort;
const MARKER_PREFIX = '# --- Generado por infra/scripts/write-backend-env.mjs';
const marker = `${MARKER_PREFIX} (${envName}); no editar a mano ---`;

const dbName = getParam('DB_NAME');
const pgUrl = ({ username, password }) =>
  `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}` +
  `@localhost:${localPort}/${dbName}?sslmode=no-verify`;

const managed = {
  AWS_REGION: 'us-east-1',
  DATABASE_URL: pgUrl(getSecretJson(getParam('DB_APP_SECRET_ARN'))),
  MIGRATE_DATABASE_URL: pgUrl(getSecretJson(getParam('DB_SECRET_ARN'))),
  S3_CATALOG_BUCKET: getParam('S3_CATALOG_BUCKET'),
  CDN_DOMAIN: getParam('CDN_DOMAIN'),
  COGNITO_USER_POOL_ID: getParam('COGNITO_USER_POOL_ID'),
  COGNITO_CLIENT_ID: getParam('COGNITO_CLIENT_ID'),
  COGNITO_CLIENT_SECRET: getSecretString(getParam('COGNITO_CLIENT_SECRET_ARN')),
};

const lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
const current = new Map(
  lines.filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l]),
);

// REVALIDATE_SECRET no viene de AWS: se genera una vez y se conserva.
if (!current.has('REVALIDATE_SECRET')) {
  managed.REVALIDATE_SECRET = randomBytes(32).toString('hex');
}

const kept = lines.filter((l) => {
  const key = l.includes('=') ? l.slice(0, l.indexOf('=')) : null;
  return !(key && key in managed) && !l.startsWith(MARKER_PREFIX);
});
while (kept.length && kept[kept.length - 1] === '') kept.pop();

const block = Object.entries(managed).map(([k, v]) => `${k}="${v}"`);
writeFileSync(envPath, [...kept, '', marker, ...block, ''].join('\n'));

console.log(`backend/.env actualizado para el entorno ${envName}:`);
for (const key of Object.keys(managed)) console.log(`  ${key}`);
console.log(`Recuerda abrir el túnel antes de usar DATABASE_URL: npm run infra:db-tunnel`);
