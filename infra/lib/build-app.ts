import { App, Tags } from 'aws-cdk-lib';
import { AppStack } from './app-stack.js';
import { AuthStack } from './auth-stack.js';
import { EnvConfig } from './config.js';
import { DataStack } from './data-stack.js';
import { MonitoringStack } from './monitoring-stack.js';
import { NetworkStack } from './network-stack.js';
import { OpsStack } from './ops-stack.js';
import { StorageStack } from './storage-stack.js';

/**
 * Compone todos los stacks de un entorno. Lo usan `bin/vapeupar.ts` y los
 * tests de `infra/test/`, para que lo que se comprueba sea exactamente lo que
 * se despliega.
 */
export function buildApp(app: App, config: EnvConfig, alertEmail: string) {
  const env = { account: config.account, region: config.region };

  // Etiquetas que separan Vapeupar de DeliPan en la cuenta compartida. Mismo
  // esquema de claves que DeliPan (Project / Environment) para que ambos
  // proyectos se filtren igual en Billing y en Resource Groups.
  Tags.of(app).add('Project', 'Vapeupar');
  Tags.of(app).add('Environment', config.envName);
  Tags.of(app).add('ManagedBy', 'cdk');
  Tags.of(app).add('Repository', 'vapeupar/infra');

  const prefix = `Vapeupar-${config.envName}`;

  const network = new NetworkStack(app, `${prefix}-Network`, { env, config });
  const data = new DataStack(app, `${prefix}-Data`, { env, config, vpc: network.vpc });
  const storage = new StorageStack(app, `${prefix}-Storage`, { env, config });
  const auth = new AuthStack(app, `${prefix}-Auth`, { env, config });
  const ops = new OpsStack(app, `${prefix}-Ops`, { env, config, alertEmail });

  // Frontend + backend en EC2 (docs/aws-full-deployment-plan.md, F1). Depende de
  // los cuatro anteriores y ninguno depende de él: se puede destruir sin tocar
  // la base, las imágenes ni los usuarios.
  const appStack = new AppStack(app, `${prefix}-App`, {
    env,
    config,
    vpc: network.vpc,
    dbSecurityGroup: data.dbSecurityGroup,
    catalogBucket: storage.catalogBucket,
    catalogCdn: storage.catalogCdn,
    userPool: auth.userPool,
  });

  // Alarmas (F6). Solo orden de despliegue, sin exports: lee el id de la EC2
  // del parámetro SSM que publica App y RDS por su nombre fijo.
  const monitoring = new MonitoringStack(app, `${prefix}-Monitoring`, { env, config, alertEmail });
  monitoring.addStackDependency(appStack);
  monitoring.addStackDependency(data);

  return { network, data, storage, auth, ops, app: appStack, monitoring };
}
