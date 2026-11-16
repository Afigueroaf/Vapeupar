// Vuelve a una release anterior QUE SIGUE EN LA INSTANCIA (las 3 últimas, en
// /opt/vapeupar/releases). No compila, no sube nada y NO migra: reactiva la
// carpeta tal cual con `activate.sh` (versionId `-`), que verifica y, si la
// release elegida tampoco responde, vuelve a la que estaba.
//
//   npm run app:rollback                       -> lista las releases disponibles
//   npm run app:rollback -- dev <releaseId>    -> activa esa release
//
// Lo lanza también `.github/workflows/rollback-produccion.yml` (Actions > Run
// workflow), con el mismo rol que el despliegue.
//
// Las migraciones NO se deshacen: la release anterior corre contra el esquema
// actual. Por eso las migraciones tienen que ser compatibles con el código
// anterior. Para releases más antiguas, ver docs/infrastructure-aws.md,
// «Volver atrás».
import { execFileSync } from 'node:child_process';
import { envName, getParam, REGION, runActivate } from './aws.mjs';

const release = process.argv.slice(2).filter((a) => !a.startsWith('--'))[1];
const instanceId = getParam('APP_INSTANCE_ID');

if (!release) {
  // Solo lectura: listar las releases y cuál está activa.
  const out = JSON.parse(
    execFileSync('aws', ['ssm', 'send-command', '--instance-ids', instanceId, '--document-name', 'AWS-RunShellScript',
      '--comment', 'vapeupar: listar releases', '--region', REGION, '--output', 'json',
      '--parameters', JSON.stringify({ commands: [
        'echo "activa: $(basename "$(readlink -f /opt/vapeupar/current)")"',
        'ls -1t /opt/vapeupar/releases',
      ] })], { encoding: 'utf8' }),
  );
  const commandId = out.Command.CommandId;
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    let inv;
    try {
      inv = JSON.parse(execFileSync('aws', ['ssm', 'get-command-invocation', '--command-id', commandId,
        '--instance-id', instanceId, '--region', REGION, '--output', 'json'], { encoding: 'utf8' }));
    } catch {
      continue;
    }
    if (['Pending', 'InProgress', 'Delayed'].includes(inv.Status)) continue;
    console.log(inv.StandardOutputContent || inv.StandardErrorContent);
    break;
  }
  console.log(`Para volver a una: npm run app:rollback -- ${envName} <release>`);
  process.exit(0);
}

if (!/^[A-Za-z0-9._-]+$/.test(release)) throw new Error(`id de release no válido: "${release}"`);
console.log(`[rollback] entorno ${envName}: activando ${release}`);
// Bucket y clave no se usan en este modo, pero activate.sh los espera en orden.
await runActivate(instanceId, ['-', '-', '-', release, envName, REGION], `vapeupar rollback ${release}`);

const publicIp = getParam('APP_PUBLIC_IP');
const res = await fetch(`http://${publicIp}/`, { signal: AbortSignal.timeout(20000) });
if (!res.ok) throw new Error(`http://${publicIp}/ respondió ${res.status}`);
console.log(`[rollback] OK: http://${publicIp}/ responde ${res.status}. Release ${release} activa.`);
