// Abre un túnel de Session Manager desde localhost hasta el PostgreSQL de RDS,
// a través del bastión. La base no tiene acceso público; este es el único
// camino desde el portátil.
//
//   npm run infra:db-tunnel            -> localhost:15432 -> RDS dev
//   VAPEUPAR_DB_LOCAL_PORT=16432 npm run infra:db-tunnel
//
// Puerto alto a propósito: 5432 y 5433 suelen estar ocupados por instalaciones
// locales de PostgreSQL, y si el puerto está tomado el cliente acaba hablando
// con la base local en lugar de con RDS.
// Requiere el Session Manager plugin del AWS CLI.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { aws, envName, getParam, localDbPort } from './aws.mjs';

const localPort = localDbPort;

await new Promise((resolve) => {
  const probe = createServer()
    .once('error', () => {
      console.error(
        `El puerto local ${localPort} ya está en uso (¿un PostgreSQL local u otro túnel abierto?).\n` +
        `Libéralo o usa otro: VAPEUPAR_DB_LOCAL_PORT=<puerto> y vuelve a ejecutar infra:env-backend.`,
      );
      process.exit(1);
    })
    .once('listening', () => probe.close(resolve))
    .listen(Number(localPort), '127.0.0.1');
});
const instanceId = getParam('BASTION_INSTANCE_ID');
const dbHost = getParam('DB_HOST');
const dbPort = getParam('DB_PORT');

// El bastión puede estar detenido para ahorrar; se arranca bajo demanda.
const state = aws(['ec2', 'describe-instances', '--instance-ids', instanceId,
  '--query', 'Reservations[0].Instances[0].State.Name']);
if (state !== 'running') {
  console.log(`Bastión ${instanceId} en estado "${state}", arrancando...`);
  aws(['ec2', 'start-instances', '--instance-ids', instanceId]);
  aws(['ec2', 'wait', 'instance-running', '--instance-ids', instanceId]);
  console.log('Bastión en marcha. El agente SSM puede tardar ~1 min en registrarse.');
}

console.log(`Túnel ${envName}: localhost:${localPort} -> ${dbHost}:${dbPort}. Ctrl+C para cerrar.`);

const tunnel = spawn('aws', [
  'ssm', 'start-session',
  '--target', instanceId,
  '--document-name', 'AWS-StartPortForwardingSessionToRemoteHost',
  '--parameters', `host=${dbHost},portNumber=${dbPort},localPortNumber=${localPort}`,
], { stdio: 'inherit' });

tunnel.on('exit', (code) => process.exit(code ?? 0));
