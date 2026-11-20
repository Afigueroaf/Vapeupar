import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvConfig, paramName, resourceName } from './config.js';

interface MonitoringStackProps extends StackProps {
  config: EnvConfig;
  /** El mismo correo del presupuesto (ops-stack.ts), fuera del repositorio. */
  alertEmail: string;
}

/**
 * Namespace de las métricas propias que envía
 * `infra/deploy/metrics/vapeupar-metrics.sh`. El rol de la app solo puede
 * escribir en este (condición `cloudwatch:namespace` en app-stack.ts).
 */
export const METRICS_NAMESPACE = 'Vapeupar';

/**
 * Techo de alarmas de Vapeupar. La capa gratuita da 10 alarmas estándar POR
 * CUENTA, y la cuenta se comparte con DeliPan: cada alarma de más cuesta
 * 0,10 USD/mes. Lo comprueba `infra/test/monitoring.test.ts`.
 */
export const MAX_ALARMS = 10;

/**
 * Vigilancia (docs/aws-full-deployment-plan.md, F6): tema SNS con aviso por
 * correo y las alarmas de la EC2, de RDS y de las métricas propias.
 *
 * Decisiones del dueño (Deathnote, 2026-11-19): solo correo, sin chequeo
 * externo de disponibilidad (una caída de nginx o de Node con la máquina
 * encendida NO avisa) y los registros se quedan en la instancia.
 *
 * SIN EXPORTS ENTRE STACKS: el id de la instancia se lee del parámetro SSM
 * `APP_INSTANCE_ID` al desplegar y RDS se identifica por su nombre fijo. Así
 * este stack no bloquea un reemplazo de la EC2 ni de la base. Contrapartida:
 * si la EC2 se reemplaza, hay que volver a desplegar ESTE stack para que las
 * alarmas de la EC2 apunten a la nueva (CloudFormation resuelve el parámetro
 * solo al desplegar).
 *
 * DIEZ ALARMAS, el máximo gratuito (ver MAX_ALARMS). Para caber se quitó la de
 * CPU de RDS (la base apenas trabaja; su memoria y conexiones avisan antes) y
 * no hay alarma propia del timer de métricas: memoria, disco y certificado
 * tratan la falta de datos como fallo, así que si el timer se para, avisan.
 */
export class MonitoringStack extends Stack {
  readonly topic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    const { config, alertEmail } = props;

    // Sin cifrado KMS a propósito: con la clave gestionada aws/sns, CloudWatch
    // no puede publicar (su política no se puede editar), y una clave propia
    // cuesta 1 USD/mes. Los avisos no llevan datos sensibles.
    this.topic = new sns.Topic(this, 'AlertsTopic', {
      topicName: resourceName(config, 'alerts'),
      displayName: `Vapeupar ${config.envName}: alarmas`,
      enforceSSL: true,
    });
    // La suscripción queda pendiente hasta pulsar el enlace del correo de AWS.
    this.topic.addSubscription(new subscriptions.EmailSubscription(alertEmail));

    const notify = new cwActions.SnsAction(this.topic);
    const alarm = (
      id: string,
      props: Omit<cloudwatch.AlarmProps, 'alarmName' | 'actionsEnabled'> & { name: string },
      extraActions: cloudwatch.IAlarmAction[] = [],
    ) => {
      const { name, ...rest } = props;
      const a = new cloudwatch.Alarm(this, id, { alarmName: resourceName(config, name), ...rest });
      a.addAlarmAction(notify, ...extraActions);
      // También el aviso de vuelta a OK: sin él no se sabe si se resolvió solo.
      a.addOkAction(notify);
      return a;
    };

    /* --- EC2 ------------------------------------------------------------- */

    const instanceId = ssm.StringParameter.valueForStringParameter(this, paramName(config, 'APP_INSTANCE_ID'));
    const ec2Metric = (metricName: string, statistic: string, period: Duration) =>
      new cloudwatch.Metric({
        namespace: 'AWS/EC2',
        metricName,
        dimensionsMap: { InstanceId: instanceId },
        statistic,
        period,
      });

    // Fallo del host de AWS: además de avisar, RECUPERA la instancia (la
    // arranca en otro host con la misma IP elástica, volumen e id; unos
    // minutos de caída). Los status checks se publican cada minuto sin coste.
    alarm(
      'Ec2StatusSystem',
      {
        name: 'ec2-status-system',
        alarmDescription: 'Fallo del host de AWS bajo la EC2: se intenta recuperar la instancia',
        metric: ec2Metric('StatusCheckFailed_System', 'Maximum', Duration.minutes(1)),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: 1,
        evaluationPeriods: 2,
        // Instancia parada a mano: sin datos, sin aviso.
        treatMissingData: cloudwatch.TreatMissingData.MISSING,
      },
      [new cwActions.Ec2Action(cwActions.Ec2InstanceAction.RECOVER)],
    );

    // Fallo DENTRO de la instancia (kernel, memoria agotada, red mal
    // configurada). No se recupera solo: hay que reiniciarla.
    alarm('Ec2StatusInstance', {
      name: 'ec2-status-instance',
      alarmDescription: 'La EC2 no responde a la comprobacion de estado: reiniciarla (SSM o consola)',
      metric: ec2Metric('StatusCheckFailed_Instance', 'Maximum', Duration.minutes(1)),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.MISSING,
    });

    alarm('Ec2Cpu', {
      name: 'ec2-cpu',
      alarmDescription: 'CPU de la EC2 por encima del 80 % durante 15 minutos',
      metric: ec2Metric('CPUUtilization', 'Average', Duration.minutes(5)),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 80,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.MISSING,
    });

    // Créditos en modo STANDARD (app-stack.ts): sin créditos la CPU cae a la
    // línea base y la tienda se arrastra, sin ningún cargo que lo delate.
    alarm('Ec2CpuCredits', {
      name: 'ec2-cpu-credits',
      alarmDescription: 'Quedan menos de 20 creditos de CPU: la EC2 va a bajar a su linea base',
      metric: ec2Metric('CPUCreditBalance', 'Minimum', Duration.minutes(5)),
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 20,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.MISSING,
    });

    /* --- RDS ------------------------------------------------------------- */

    const rdsMetric = (metricName: string, statistic: string) =>
      new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName,
        // Nombre fijo de data-stack.ts (`instanceIdentifier`).
        dimensionsMap: { DBInstanceIdentifier: resourceName(config, 'db') },
        statistic,
        period: Duration.minutes(5),
      });

    alarm('RdsFreeStorage', {
      name: 'rds-storage',
      alarmDescription: 'Quedan menos de 2 GB libres en RDS (el autoescalado de almacenamiento tiene techo)',
      metric: rdsMetric('FreeStorageSpace', 'Minimum'),
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 2 * 1024 ** 3,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.MISSING,
    });

    // db.t4g.micro admite unas 100 conexiones (max_connections por memoria).
    alarm('RdsConnections', {
      name: 'rds-connections',
      alarmDescription: 'Mas de 60 conexiones a RDS durante 10 minutos (el limite ronda 100)',
      metric: rdsMetric('DatabaseConnections', 'Maximum'),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 60,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.MISSING,
    });

    alarm('RdsFreeableMemory', {
      name: 'rds-memory',
      alarmDescription: 'Menos de 100 MB de memoria libre en RDS durante 15 minutos',
      metric: rdsMetric('FreeableMemory', 'Minimum'),
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 100 * 1024 ** 2,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.MISSING,
    });

    /* --- Métricas propias (vapeupar-metrics.timer) ----------------------- */

    // Dimensión Environment y no InstanceId: siguen valiendo si la EC2 se
    // reemplaza. BREACHING: si el timer deja de enviar 15 minutos (1 hora el
    // certificado), avisan. Es la alarma del propio timer.
    const ownMetric = (metricName: string, statistic: string, period: Duration) =>
      new cloudwatch.Metric({
        namespace: METRICS_NAMESPACE,
        metricName,
        dimensionsMap: { Environment: config.envName },
        statistic,
        period,
      });

    alarm('InstanceMemory', {
      name: 'mem',
      alarmDescription: 'Memoria de la EC2 por encima del 90 % durante 15 minutos, o el timer de metricas no envia',
      metric: ownMetric('MemUsedPercent', 'Average', Duration.minutes(5)),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 90,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    alarm('InstanceDisk', {
      name: 'disk',
      alarmDescription: 'Disco raiz de la EC2 por encima del 80 %, o el timer de metricas no envia',
      metric: ownMetric('RootDiskUsedPercent', 'Maximum', Duration.minutes(5)),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: 80,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    // certbot renueva a los 30 días del final: por debajo de 20, la
    // renovación automática lleva al menos 10 días fallando.
    alarm('TlsCertificate', {
      name: 'cert',
      alarmDescription: 'El certificado TLS caduca en menos de 20 dias (certbot no renueva), o no hay certificado o metricas',
      metric: ownMetric('CertDaysLeft', 'Minimum', Duration.hours(1)),
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 20,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
  }
}
