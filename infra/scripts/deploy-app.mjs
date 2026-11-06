// Compila, empaqueta y despliega la aplicación (tienda + consola + API) en la
// EC2 del entorno. docs/aws-full-deployment-plan.md F3.
//
//   npm run app:deploy              -> entorno dev (hoy, producción)
//   npm run app:deploy -- dev --skip-build   reutiliza los builds que ya hay
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
//      EXACTO subido. activate.sh verifica y, si falla, vuelve atrás.
//   5. Comprueba la portada desde fuera, por la IP pública.
//
// Volver a una release anterior: las 3 últimas siguen en la instancia
// (`/opt/vapeupar/releases`), y todas las versiones del objeto en S3 (5).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envName, getParam } from './aws.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const skipBuild = process.argv.includes('--skip-build');
const KEY = 'releases/app.tar.gz';
const REGION = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
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
    env: { ...process.env, NEXT_PUBLIC_API_URL: '/api', NEXT_PUBLIC_CDN_DOMAIN: cdnDomain, NEXT_TELEMETRY_DISABLED: '1' },
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

  // --- 4. Activación por SSM ---------------------------------------------------
  // El script va dentro del comando (base64), no se descarga aparte: así lo
  // que se ejecuta es exactamente lo de esta release.
  const script = fs.readFileSync(path.join(ROOT, 'infra', 'deploy', 'activate.sh')).toString('base64');
  const params = {
    commands: [
      'set -e',
      'F=$(mktemp)',
      `echo '${script}' | base64 -d > "$F"`,
      `bash "$F" '${bucket}' '${KEY}' '${put.VersionId}' '${releaseId}' '${envName}' '${REGION}'; R=$?`,
      'rm -f "$F"; exit $R',
    ],
    executionTimeout: ['900'],
  };
  const paramsFile = path.join(work, 'ssm-params.json');
  fs.writeFileSync(paramsFile, JSON.stringify(params));
  const sent = awsJson(['ssm', 'send-command', '--instance-ids', instanceId, '--document-name', 'AWS-RunShellScript',
    '--comment', `vapeupar deploy ${releaseId}`.slice(0, 100), '--timeout-seconds', '600',
    '--parameters', `file://${paramsFile}`]);
  const commandId = sent.Command.CommandId;
  log(`activando en ${instanceId} (comando ${commandId})`);

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
  console.log(`\n${inv.StandardOutputContent}`);
  if (inv.StandardErrorContent) console.error(inv.StandardErrorContent);
  if (inv.Status !== 'Success') {
    throw new Error(`la activación terminó en ${inv.Status}: revisa la salida de arriba`);
  }

  // --- 5. Desde fuera -----------------------------------------------------------
  const res = await fetch(`http://${publicIp}/`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`http://${publicIp}/ respondió ${res.status}`);
  log(`OK: http://${publicIp}/ responde ${res.status}. Release ${releaseId} activa.`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
