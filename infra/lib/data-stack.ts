import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvConfig, paramName, resourceName } from './config.js';

interface DataStackProps extends StackProps {
  config: EnvConfig;
  vpc: ec2.IVpc;
}

/**
 * PostgreSQL en subredes aisladas.
 *
 * La base nunca es pública. Solo la alcanza la EC2 de la aplicación, cuya
 * regla de entrada al 5432 crea `app-stack.ts`. Desde el portátil se llega por
 * túnel de Session Manager a través de esa misma instancia
 * (`npm run infra:db-tunnel`, parámetro `TUNNEL_INSTANCE_ID`).
 *
 * HASTA EL 2026-11-06 ESTE STACK TENÍA UN BASTIÓN, que existía porque no había
 * nada más en la VPC desde donde llegar a la base. Con la aplicación dentro dejó
 * de hacer falta y se retiró (docs/aws-full-deployment-plan.md, F1.7): eran
 * ~10,5 USD/mes por una instancia que solo hacía de puente. Si algún día vuelve
 * a hacer falta un acceso independiente de la aplicación, su código está en el
 * historial de git; volver a ponerlo es un despliegue.
 */
export class DataStack extends Stack {
  readonly db: rds.DatabaseInstance;
  /** El stack de la aplicación añade aquí su regla de entrada al 5432. */
  readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { config, vpc } = props;

    const dbSecurityGroup = (this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      securityGroupName: resourceName(config, 'rds'),
      // LA DESCRIPCIÓN YA NO ES EXACTA (el bastión se retiró) Y SE DEJA ASÍ A
      // PROPÓSITO: en CloudFormation, cambiar `GroupDescription` REEMPLAZA el
      // grupo de seguridad, y este es el que lleva la base. No compensa
      // arriesgar la conectividad de RDS por una frase.
      description: 'Vapeupar PostgreSQL: solo acepta conexiones del bastion y del backend',
      allowAllOutbound: false,
    }));

    this.db = new rds.DatabaseInstance(this, 'Db', {
      instanceIdentifier: resourceName(config, 'db'),
      engine: rds.DatabaseInstanceEngine.postgres({
        // El enum de aws-cdk-lib 2.275 llega a 18.3; RDS ofrece 18.6.
        version: rds.PostgresEngineVersion.of('18.6', '18'),
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      publiclyAccessible: false,
      databaseName: 'vapeupar',
      credentials: rds.Credentials.fromGeneratedSecret('vapeupar_admin', {
        secretName: `vapeupar/${config.envName}/rds-master`,
      }),
      allocatedStorage: config.db.allocatedStorageGb,
      maxAllocatedStorage: config.db.maxAllocatedStorageGb,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      multiAz: config.db.multiAz,
      backupRetention: Duration.days(config.db.backupRetentionDays),
      deletionProtection: config.db.deletionProtection,
      removalPolicy: config.db.removalPolicy,
      autoMinorVersionUpgrade: true,
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Credencial del rol de aplicación `vapeupar_app` (permisos mínimos, sin
    // DDL). El rol lo crea la migración inicial; la contraseña la aplica
    // `npm run db:sync-app-role` en backend/. El usuario maestro queda solo
    // para migraciones y mantenimiento.
    const appSecret = new secretsmanager.Secret(this, 'AppDbSecret', {
      secretName: `vapeupar/${config.envName}/rds-app`,
      description: 'Credencial del rol vapeupar_app que usa el backend en runtime',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'vapeupar_app' }),
        generateStringKey: 'password',
        passwordLength: 32,
        excludePunctuation: true,
      },
    });

    // Valores no secretos para scripts y para el backend, con la misma
    // convención de rutas que usa DeliPan (/delipan/staging/*).
    const params: Record<string, string> = {
      DB_HOST: this.db.dbInstanceEndpointAddress,
      DB_PORT: this.db.dbInstanceEndpointPort,
      DB_NAME: 'vapeupar',
      DB_SECRET_ARN: this.db.secret!.secretArn,
      DB_APP_SECRET_ARN: appSecret.secretArn,
    };
    for (const [key, value] of Object.entries(params)) {
      new ssm.StringParameter(this, `Param${key}`, {
        parameterName: paramName(config, key),
        stringValue: value,
      });
    }
  }
}
