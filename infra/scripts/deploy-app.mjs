// Compila, empaqueta y despliega la aplicación (tienda + consola + API) en la
// EC2 del entorno. docs/aws-full-deployment-plan.md F3.
//
//   npm run app:deploy              -> entorno dev (hoy, producción)
//   npm run app:deploy -- dev --skip-build   reutiliza los builds que ya hay
//
// Lo lanza también GitHub Actions en cada push a la rama `produccion`
// (`.github/workflows/deploy-produccion.yml`), con el rol de `config.ci`.
//
// Flujo:
//   1. Build del backend (tsc) y del frontend (`standalone`, API relativa).
//   2. Release en una carpeta temporal:
//        backend/  dist + package.json + node_modules de producción
//        web/      el `standalone` de Next + .next/static + public
//        deploy/   unidades de systemd, nginx, write-env.mjs, activate.sh
//   3. Sube `releases/app.tar.gz` al bucket de artefactos (versionado) con el
//      sha de git en los metadatos.
//   4. Ejecuta `deploy/activate.sh` en la instancia por SSM con el versionId
//      EXACTO subido. activate.sh aplica las migraciones pendientes
//      (`deploy/migrate.mjs`), activa, verifica y, si falla, vuelve atrás.
//   5. Comprueba la portada desde fuera, por la IP pública.
//
// Volver a una release anterior: `npm run app:rollback` (las 3 últimas siguen
// en la instancia, `/opt/vapeupar/releases`) o, más atrás, las versiones del
// objeto en S3 (5). docs/infrastructure-aws.md, «Volver atrás».
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envName, getParam, getParamsByPath, REGION, runActivate } from './aws.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skipBuild = process.argv.includes('--skip-build');
const KEY = 'releases/app.tar.gz';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// En Windows, el tar de System32 (bsdtar): el GNU tar de Git Bash toma
// `C:\...` por un host remoto.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

// `sharp` (optimización de imágenes de next/image) es nativo. El `standalone`
// lleva el binario de la máquina que compila; la instancia es Linux ARM64.
// Sin esto no falla: cae en silencio a WebAssembly, más lento y con más
// memoria. Las versiones son las que fija `sharp/package.json`.
const SHARP_PLATFORM = { os: 'linux', cpu: 'arm64' };

const log = (m) => console.log(`\n[deploy] ${m}`);

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' && cmd === NPM, ...opts });
}
function awsJson(args) {
  return JSON.parse(execFileSync('aws', [...args, '--region', REGION, '--output', 'json'], { encoding: 'utf8' }));
}
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

// --- 0. Datos del entorno ------------------------------------------------------
const bucket = getParam('ARTIFACTS_BUCKET');
const instanceId = getParam('APP_INSTANCE_ID');
const publicIp = getParam('APP_PUBLIC_IP');
const cdnDomain = getParam('CDN_DOMAIN');

// Variables públicas del frontend: WhatsApp, teléfono, nombre y ciudad de la
// tienda. Acaban dentro del JavaScript que descarga el visitante, así que no
// son secretas, pero son datos de contacto y no van en el repositorio. Viven
// en SSM (`/vapeupar/<env>/web/NEXT_PUBLIC_*`) para que el build de GitHub
// Actions y el de un portátil salgan IGUALES: antes salían del
// `frontend/.env.local` de quien desplegaba. Sin WhatsApp el carrito no puede
// enviar pedidos, así que en CI su ausencia es un error.
const webEnv = Object.fromEntries(
  Object.entries(getParamsByPath('web')).filter(([k]) => k.startsWith('NEXT_PUBLIC_')),
);
if (!webEnv.NEXT_PUBLIC_WHATSAPP_NUMBER) {
  const msg = `falta /vapeupar/${envName}/web/NEXT_PUBLIC_WHATSAPP_NUMBER en SSM`;
  if (process.env.CI) throw new Error(msg);
  console.warn(`[deploy] AVISO: ${msg}; se usará el de frontend/.env.local si lo hay`);
}

const sha = git(['rev-parse', '--short=12', 'HEAD']);
const dirty = git(['status', '--porcelain']).length > 0;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const releaseId = `${stamp}-${sha}${dirty ? '-dirty' : ''}`;
log(`entorno ${envName}, release ${releaseId}${dirty ? ' (HAY CAMBIOS SIN COMMITEAR)' : ''}`);

// --- 1. Build ------------------------------------------------------------------
if (!skipBuild) {
  log('build del backend');
  run(NPM, ['run', 'build', '--workspace=backend']);
  log('build del frontend');
  // La API es RELATIVA: nginx sirve tienda, consola y API desde un mismo
  // origen, así que el paquete no lleva dentro la IP ni el dominio.
  // Las variables del proceso ganan a las de `frontend/.env.local` (teléfono,
  // WhatsApp...), que se siguen leyendo para lo demás.
  run(NPM, ['run', 'build', '--workspace=frontend'], {
    env: { ...process.env, ...webEnv, NEXT_PUBLIC_API_URL: '/api', NEXT_PUBLIC_CDN_DOMAIN: cdnDomain, NEXT_TELEMETRY_DISABLED: '1' },
  });
}

// --- 2. Release ----------------------------------------------------------------
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vapeupar-release-'));
const rel = path.join(work, 'release');
const cp = (from, to) => fs.cpSync(path.join(ROOT, from), path.join(rel, to), { recursive: true, dereference: true });

try {
  log(`empaquetando en ${work}`);

  // Backend: dist y dependencias de producción. Se instalan aparte, con el
  // lockfile del monorepo (versiones fijadas) y sin devDependencies: así no
  // viaja el CLI de prisma ni typescript. Todas son JavaScript puro, por eso
  // se pueden instalar aquí y ejecutar en Linux ARM (se comprueba abajo).
  const deps = path.join(work, 'deps');
  for (const w of ['frontend', 'backend', 'infra']) {
    fs.mkdirSync(path.join(deps, w), { recursive: true });
  }
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(deps, 'package.json'));
  fs.copyFileSync(path.join(ROOT, 'package-lock.json'), path.join(deps, 'package-lock.json'));
  for (const w of ['frontend', 'infra']) {
    fs.copyFileSync(path.join(ROOT, w, 'package.json'), path.join(deps, w, 'package.json'));
  }
  const backendPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'package.json'), 'utf8'));
  delete backendPkg.devDependencies;
  delete backendPkg.scripts;
  fs.writeFileSync(path.join(deps, 'backend', 'package.json'), JSON.stringify(backendPkg, null, 2));
  run(NPM, ['install', '--omit=dev', '--workspace=vapeupar-backend', '--include-workspace-root=false',
    '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: deps });

  cp('backend/dist', 'backend/dist');
  // Esquema y migraciones para `deploy/migrate.mjs`, que las aplica en la
  // instancia antes de activar, con el CLI de Prisma de esta versión EXACTA
  // (la del lockfile, no un rango).
  cp('backend/prisma/schema.prisma', 'backend/prisma/schema.prisma');
  cp('backend/prisma/migrations', 'backend/prisma/migrations');
  const prismaVersion = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'node_modules', 'prisma', 'package.json'), 'utf8'),
  ).version;
  fs.writeFileSync(path.join(rel, 'backend', 'prisma', 'PRISMA_VERSION'), `${prismaVersion}
`);
  fs.copyFileSync(path.join(deps, 'backend', 'package.json'), path.join(rel, 'backend', 'package.json'));
  fs.cpSync(path.join(deps, 'node_modules'), path.join(rel, 'backend', 'node_modules'), {
    recursive: true,
    dereference: false,
    // El enlace del workspace a sí mismo no sirve fuera del monorepo.
    filter: (src) => path.basename(src) !== 'vapeupar-backend' && path.basename(src) !== '.package-lock.json',
  });

  // Frontend: standalone + estáticos + public.
  cp('frontend/.next/standalone', 'web');
  cp('frontend/.next/static', 'web/frontend/.next/static');
  cp('frontend/public', 'web/frontend/public');
  fs.rmSync(path.join(rel, 'web', 'frontend', '.next', 'cache'), { recursive: true, force: true });

  // sharp para Linux ARM64 en lugar del de la máquina que compila.
  const img = path.join(rel, 'web', 'node_modules', '@img');
  const sharpPkg = JSON.parse(fs.readFileSync(path.join(rel, 'web', 'node_modules', 'sharp', 'package.json'), 'utf8'));
  const tag = `${SHARP_PLATFORM.os}-${SHARP_PLATFORM.cpu}`;
  const wanted = [`@img/sharp-${tag}`, `@img/sharp-libvips-${tag}`].map((n) => {
    const v = sharpPkg.optionalDependencies?.[n];
    if (!v) throw new Error(`sharp ${sharpPkg.version} no declara ${n}`);
    return `${n}@${v}`;
  });
  for (const d of fs.readdirSync(img)) {
    if (/^sharp-(libvips-)?(win32|darwin|linux)/.test(d)) fs.rmSync(path.join(img, d), { recursive: true });
  }
  const packs = path.join(work, 'packs');
  fs.mkdirSync(packs);
  for (const spec of wanted) {
    const out = execFileSync(NPM, ['pack', spec, '--json', '--pack-destination', packs, '--loglevel=error'],
      { cwd: packs, encoding: 'utf8', shell: process.platform === 'win32' });
    const file = JSON.parse(out)[0].filename;
    const dir = path.join(img, spec.slice('@img/'.length, spec.lastIndexOf('@')));
    fs.mkdirSync(dir, { recursive: true });
    execFileSync(TAR, ['-xzf', path.join(packs, file), '-C', dir, '--strip-components=1']);
  }
  log(`sharp: ${wanted.join(', ')}`);

  // Despliegue.
  cp('infra/deploy', 'deploy');
  fs.writeFileSync(path.join(rel, 'RELEASE'), `${releaseId}\n${git(['rev-parse', 'HEAD'])}\ndirty=${dirty}\n`);

  // Comprobaciones: ningún binario nativo fuera del de sharp para la
  // instancia, y ningún enlace simbólico (no sobreviven bien a Windows).
  const natives = [];
  const links = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) links.push(p);
      else if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.node') && !p.includes(`sharp-${tag}`)) natives.push(p);
    }
  })(rel);
  if (links.length) throw new Error(`enlaces simbólicos en la release:\n${links.join('\n')}`);
  if (natives.length) throw new Error(`binarios nativos que no son de ${tag}:\n${natives.join('\n')}`);

  const tarball = path.join(work, 'app.tar.gz');
  execFileSync(TAR, ['-czf', tarball, '-C', rel, '.']);
  const mb = (fs.statSync(tarball).size / 1048576).toFixed(1);
  log(`paquete: ${mb} MB`);

  // --- 3. Subida -------------------------------------------------------------
  const put = awsJson(['s3api', 'put-object', '--bucket', bucket, '--key', KEY, '--body', tarball,
    '--metadata', `release=${releaseId},git-sha=${sha},dirty=${dirty}`]);
  log(`subido s3://${bucket}/${KEY} versión ${put.VersionId}`);

  // --- 4. Migraciones y activación por SSM ------------------------------------
  await runActivate(instanceId, [bucket, KEY, put.VersionId, releaseId, envName, REGION], `vapeupar deploy ${releaseId}`);

  // --- 5. Desde fuera -----------------------------------------------------------
  const res = await fetch(`http://${publicIp}/`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`http://${publicIp}/ respondió ${res.status}`);
  log(`OK: http://${publicIp}/ responde ${res.status}. Release ${releaseId} activa.`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
