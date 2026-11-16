// Aplica las migraciones pendientes de Prisma EN LA INSTANCIA, antes de
// activar una release. Lo llama `activate.sh` (como root) con la carpeta de la
// release ya desempaquetada:
//
//   node migrate.mjs <carpeta de la release> <entorno> <región>
//
// POR QUÉ DESDE LA INSTANCIA: es la única máquina con ruta a RDS y con permiso
// para leer el secreto del usuario maestro (`vapeupar/<env>/rds-master`, ver
// app-stack.ts). El runner de GitHub no llega a la base y su rol no puede leer
// secretos, a propósito.
//
// EL CLI DE PRISMA NO VIAJA EN LA RELEASE: es una devDependency y su motor de
// migraciones es un binario nativo de la plataforma donde se instala. Se
// instala aquí, una vez por versión, en /opt/vapeupar/tools/prisma-<versión>,
// y se reutiliza en los despliegues siguientes. La versión es la EXACTA de
// `backend/package.json` (la release la escribe en `backend/prisma/PRISMA_VERSION`).
//
// `prisma migrate deploy` solo aplica migraciones que aún no están en la base;
// sin pendientes no hace nada. Cada migración va en su propia transacción.
//
// Las migraciones deben ser COMPATIBLES CON EL CÓDIGO ANTERIOR (expandir y
// después contraer): si la verificación de `activate.sh` falla, se vuelve a la
// release anterior pero la migración NO se deshace.
// docs/infrastructure-aws.md, «Migraciones».
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [releaseDir, envName, region] = process.argv.slice(2);
if (!releaseDir || !envName || !region) {
  console.error('uso: node migrate.mjs <carpeta de la release> <entorno> <región>');
  process.exit(2);
}

const log = (m) => console.log(`[migrate] ${m}`);
const prismaDir = join(releaseDir, 'backend', 'prisma');
const version = readFileSync(join(prismaDir, 'PRISMA_VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`versión de prisma inválida: "${version}"`);

// Mismo bundle de CA que usa el backend; lo descarga `write-env.mjs`.
const CA_PATH = '/usr/local/share/vapeupar/rds-ca.pem';
const TOOLS = `/opt/vapeupar/tools/prisma-${version}`;
const PRISMA = join(TOOLS, 'node_modules', '.bin', 'prisma');

// SSM ejecuta los comandos sin HOME: npm necesita una caché donde escribir.
const npmEnv = { ...process.env, HOME: process.env.HOME || '/root', npm_config_cache: '/var/cache/vapeupar-npm' };

function aws(args) {
  return execFileSync('aws', [...args, '--region', region, '--output', 'json'], { encoding: 'utf8' });
}

// --- 1. CLI de Prisma de la versión exacta ------------------------------------
if (!existsSync(PRISMA)) {
  log(`instalando prisma@${version} en ${TOOLS}`);
  const partial = `${TOOLS}.partial`;
  rmSync(partial, { recursive: true, force: true });
  mkdirSync(partial, { recursive: true });
  writeFileSync(join(partial, 'package.json'), JSON.stringify({ private: true }));
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', '--save-exact', `prisma@${version}`],
    { cwd: partial, stdio: 'inherit', env: npmEnv });
  // Fuerza la descarga del motor de migraciones AHORA (si no, la primera
  // migración tarda y falla por red en el peor momento).
  execFileSync(join(partial, 'node_modules', '.bin', 'prisma'), ['--version'], { cwd: partial, stdio: 'inherit', env: npmEnv });
  rmSync(TOOLS, { recursive: true, force: true });
  renameSync(partial, TOOLS);
  // Solo se guarda la versión en uso: las anteriores ocupan ~100 MB cada una.
  for (const d of execFileSync('ls', ['-1', '/opt/vapeupar/tools'], { encoding: 'utf8' }).split('\n')) {
    if (d.startsWith('prisma-') && d !== `prisma-${version}`) {
      rmSync(join('/opt/vapeupar/tools', d), { recursive: true, force: true });
    }
  }
}

// --- 2. Conexión con el usuario maestro ---------------------------------------
const params = Object.fromEntries(
  JSON.parse(aws(['ssm', 'get-parameters-by-path', '--path', `/vapeupar/${envName}`]))
    .Parameters.map((p) => [p.Name.split('/').pop(), p.Value]),
);
const param = (key) => {
  if (!(key in params)) throw new Error(`No existe /vapeupar/${envName}/${key}`);
  return params[key];
};
if (!existsSync(CA_PATH)) throw new Error(`falta ${CA_PATH} (lo descarga write-env.mjs al arrancar el backend)`);
const master = JSON.parse(
  JSON.parse(aws(['secretsmanager', 'get-secret-value', '--secret-id', param('DB_SECRET_ARN')])).SecretString,
);
// El motor de migraciones de Prisma no usa `pg`: sus parámetros de TLS son
// otros. `sslcert` es la CA con la que se valida el servidor y
// `sslaccept=strict` exige certificado válido Y nombre de host correcto, el
// equivalente al `verify-full` del backend.
const url =
  `postgresql://${encodeURIComponent(master.username)}:${encodeURIComponent(master.password)}` +
  `@${param('DB_HOST')}:${param('DB_PORT')}/${param('DB_NAME')}` +
  `?sslmode=require&sslaccept=strict&sslcert=${encodeURIComponent(CA_PATH)}`;

// --- 3. Migrar ----------------------------------------------------------------
// Carpeta de trabajo DENTRO de TOOLS para que `prisma.config.ts` resuelva
// `prisma/config` desde su node_modules. Solo el esquema y las migraciones de
// la release, con una configuración mínima: la de `backend/` carga dotenv.
const work = join(TOOLS, 'run');
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'prisma'), { recursive: true, mode: 0o700 });
try {
  cpSync(join(prismaDir, 'schema.prisma'), join(work, 'prisma', 'schema.prisma'));
  cpSync(join(prismaDir, 'migrations'), join(work, 'prisma', 'migrations'), { recursive: true });
  writeFileSync(
    join(work, 'prisma.config.ts'),
    `import { defineConfig, env } from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('MIGRATE_DATABASE_URL') },
});
`,
  );
  log(`prisma ${version}: migrate deploy contra ${param('DB_HOST')}/${param('DB_NAME')}`);
  // La URL va por el entorno del proceso, nunca en la línea de comandos ni en
  // un archivo: así no aparece en `ps` ni queda en disco.
  execFileSync(PRISMA, ['migrate', 'deploy'], {
    cwd: work,
    stdio: 'inherit',
    env: { ...npmEnv, MIGRATE_DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
  log('migraciones al día');
} finally {
  rmSync(work, { recursive: true, force: true });
}
