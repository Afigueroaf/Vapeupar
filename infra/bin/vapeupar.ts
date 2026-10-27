import { App, Tags } from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack.js';
import { getConfig } from '../lib/config.js';
import { DataStack } from '../lib/data-stack.js';
import { NetworkStack } from '../lib/network-stack.js';
import { OpsStack } from '../lib/ops-stack.js';
import { StorageStack } from '../lib/storage-stack.js';

const app = new App();
const config = getConfig(app.node.tryGetContext('env') ?? 'dev');
const env = { account: config.account, region: config.region };

// Correo de alertas de presupuesto: fuera del repositorio (dato personal).
const alertEmail = app.node.tryGetContext('alertEmail') ?? process.env.VAPEUPAR_ALERT_EMAIL;
if (!alertEmail) {
  throw new Error('Falta el correo de alertas: exporta VAPEUPAR_ALERT_EMAIL o pasa -c alertEmail=...');
}

// Etiquetas que separan Vapeupar de DeliPan en la cuenta compartida. Mismo
// esquema de claves que DeliPan (Project / Environment) para que ambos
// proyectos se filtren igual en Billing y en Resource Groups.
Tags.of(app).add('Project', 'Vapeupar');
Tags.of(app).add('Environment', config.envName);
Tags.of(app).add('ManagedBy', 'cdk');
Tags.of(app).add('Repository', 'vapeupar/infra');

const prefix = `Vapeupar-${config.envName}`;

const network = new NetworkStack(app, `${prefix}-Network`, { env, config });
new DataStack(app, `${prefix}-Data`, { env, config, vpc: network.vpc });
new StorageStack(app, `${prefix}-Storage`, { env, config });
new AuthStack(app, `${prefix}-Auth`, { env, config });
new OpsStack(app, `${prefix}-Ops`, { env, config, alertEmail });
