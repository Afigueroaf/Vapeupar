// Genera /etc/vapeupar/backend.env y /etc/vapeupar/frontend.env EN LA INSTANCIA, leyendo SSM y Secrets
// Manager con el rol de la propia EC2. Lo ejecuta `vapeupar-env.service`
// (como root) antes de arrancar el backend; ver
// docs/aws-full-deployment-plan.md F2.
//
// Es el equivalente en producción de `infra/scripts/write-backend-env.mjs`, que
// escribe `backend/.env` en el portátil. Las diferencias son las que importan:
//
//   - La base se alcanza DIRECTAMENTE por la red de la VPC, no por el túnel, así
//     que el certificado de RDS SÍ coincide con el nombre del host y se
//     verifica: `sslmode=verify-full` contra el bundle de CA de RDS. En el
//     portátil va `no-verify` porque por el túnel el nombre es `localhost`.
//   - Solo la credencial del rol `vapeupar_app`. El usuario maestro NO entra en
//     el entorno del backend en marcha: las migraciones (F5) lo piden aparte.
//   - El archivo queda 0600 de root. systemd lo lee como root antes de soltar
//     privilegios, así que el usuario `vapeupar` no necesita poder leerlo, y no
//     puede.
//   - frontend.env lleva SOLO REVALIDATE_SECRET (A7.3): mínimo privilegio de
//     configuración, Next no recibe en su entorno la base ni Cognito. NO es una
//     barrera: frontend y backend corren con el mismo usuario (`vapeupar`), así
//     que un proceso puede leer el entorno del otro en /proc/<pid>/environ.
//     Aislarlos de verdad pide un usuario propio para el frontend (item
//     f7-endurecimiento-perimetral). Sale de la MISMA lectura que el de
//     backend.env, para que los dos lados nunca tengan secretos distintos (si
//     difieren, toda revalidación da 401 sin que nadie se entere).
//
// No imprime valores, solo nombres.
//
//   VAPEUPAR_ENV=dev AWS_REGION=us-east-1 node write-env.mjs
//   VAPEUPAR_ENV_OUT=/tmp/prueba node write-env.mjs     # escribe en otra carpeta
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const envName = required('VAPEUPAR_ENV');
const region = required('AWS_REGION');
const outDir = process.env.VAPEUPAR_ENV_OUT ?? '/etc/vapeupar';

/**
 * Bundle de CA de RDS para la región. Es público (no es un secreto), así que
 * vive fuera de /etc/vapeupar —que es 0700— para que el proceso del backend,
 * que corre como `vapeupar`, pueda leerlo: `pg` abre el archivo de
 * `sslrootcert` en el proceso, no systemd.
 */
const CA_PATH = '/usr/local/share/vapeupar/rds-ca.pem';
const CA_URL = `https://truststore.pki.rds.amazonaws.com/${region}/${region}-bundle.pem`;

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta ${name}. Lo escribe el despliegue en /etc/vapeupar/instance.env.`);
    process.exit(1);
  }
  return value;
}

function aws(args) {
  return execFileSync('aws', [...args, '--region', region, '--output', 'json'], { encoding: 'utf8' });
}

// Una sola llamada para todos los parámetros del entorno, en vez de una por
// clave: diez llamadas a SSM en cada arranque son diez oportunidades de que un
// fallo transitorio deje el backend sin arrancar.
const params = Object.fromEntries(
  JSON.parse(aws(['ssm', 'get-parameters-by-path', '--path', `/vapeupar/${envName}`]))
    .Parameters.map((p) => [p.Name.split('/').pop(), p.Value]),
);
const param = (key) => {
  if (!(key in params)) throw new Error(`No existe /vapeupar/${envName}/${key}`);
  return params[key];
};
const optionalParam = (key) => params[key];
const secret = (arn) =>
  JSON.parse(aws(['secretsmanager', 'get-secret-value', '--secret-id', arn])).SecretString;

async function ensureCaBundle() {
  if (existsSync(CA_PATH) && readFileSync(CA_PATH, 'utf8').includes('BEGIN CERTIFICATE')) return;
  const response = await fetch(CA_URL);
  if (!response.ok) throw new Error(`No se pudo descargar el bundle de CA de RDS (${response.status})`);
  const pem = await response.text();
  if (!pem.includes('BEGIN CERTIFICATE')) throw new Error('El bundle de CA de RDS no parece un PEM');
  mkdirSync('/usr/local/share/vapeupar', { recursive: true, mode: 0o755 });
  writeFileSync(CA_PATH, pem, { mode: 0o644 });
}

await ensureCaBundle();

const app = JSON.parse(secret(param('DB_APP_SECRET_ARN')));
const databaseUrl =
  `postgresql://${encodeURIComponent(app.username)}:${encodeURIComponent(app.password)}` +
  `@${param('DB_HOST')}:${param('DB_PORT')}/${param('DB_NAME')}` +
  `?sslmode=verify-full&sslrootcert=${encodeURIComponent(CA_PATH)}`;

const publicOrigin = param('PUBLIC_ORIGIN');

// Revalidación on-demand (A7.3). OPCIONAL a propósito: el parámetro lo crea el
// stack App, y una release con este script puede llegar a una instancia antes
// de que ese stack se despliegue. Sin él, backend y frontend arrancan igual,
// el backend no avisa al sitio y los cambios se ven por ISR (≤60 s). Si el
// parámetro existe pero el secreto no se puede leer, falla como los demás: eso
// ya es un error de configuración, no un orden de despliegue.
const revalidateArn = optionalParam('REVALIDATE_SECRET_ARN');
const revalidateSecret = revalidateArn ? secret(revalidateArn).trim() : undefined;
if (!revalidateArn) {
  console.warn(
    `Aviso: no existe /vapeupar/${envName}/REVALIDATE_SECRET_ARN; sin revalidación on-demand ` +
      '(el sitio se refresca por ISR). Despliega el stack App para activarla.',
  );
} else if (!revalidateSecret) {
  console.warn(
    `Aviso: el secreto de ${revalidateArn} está vacío; sin revalidación on-demand ` +
      '(el sitio se refresca por ISR). Regenera el valor en Secrets Manager.',
  );
}

const values = {
  AWS_REGION: region,
  DATABASE_URL: databaseUrl,
  S3_CATALOG_BUCKET: param('S3_CATALOG_BUCKET'),
  CDN_DOMAIN: param('CDN_DOMAIN'),
  CDN_DISTRIBUTION_ID: param('CDN_DISTRIBUTION_ID'),
  COGNITO_USER_POOL_ID: param('COGNITO_USER_POOL_ID'),
  COGNITO_CLIENT_ID: param('COGNITO_CLIENT_ID'),
  COGNITO_CLIENT_SECRET: secret(param('COGNITO_CLIENT_SECRET_ARN')),
  // Mismo origen para las dos: nginx sirve tienda, consola y API desde la
  // misma URL, así que el CORS solo tiene que aceptar esa.
  FRONTEND_URL: publicOrigin,
  ADMIN_URL: publicOrigin,
  ...(revalidateSecret && {
    REVALIDATE_SECRET: revalidateSecret,
    // Next en la misma máquina, por loopback (vapeupar-frontend.service).
    REVALIDATE_URL: 'http://127.0.0.1:3000/internal/revalidate',
  }),
};

const frontendValues = revalidateSecret ? { REVALIDATE_SECRET: revalidateSecret } : {};

// Formato de EnvironmentFile de systemd: KEY="valor". Las comillas dobles y
// las barras invertidas se escapan; ninguno de estos valores lleva salto de
// línea.
const escape = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const render = (entries) =>
  `# Generado por infra/deploy/write-env.mjs el ${new Date().toISOString()}; no editar a mano.\n` +
  Object.entries(entries).map(([k, v]) => `${k}="${escape(v)}"`).join('\n') + '\n';

// Escritura atómica: si el proceso muere a medias, cada servicio sigue
// teniendo el archivo anterior entero, no uno truncado.
function writeEnvFile(name, entries) {
  const target = join(outDir, name);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, render(entries), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, target);
  console.log(`${target} actualizado (${envName}): ${Object.keys(entries).join(', ') || '(vacío)'}`);
}

mkdirSync(outDir, { recursive: true, mode: 0o700 });
writeEnvFile('backend.env', values);
// Siempre se escribe, aunque vaya vacío: así un secreto retirado también
// desaparece del frontend y no queda uno viejo que ya no coincide.
writeEnvFile('frontend.env', frontendValues);
