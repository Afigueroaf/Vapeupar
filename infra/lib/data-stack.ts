import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvConfig, paramName, resourceName } from './config.js';

interface DataStackProps extends StackProps {
  config: EnvConfig;
  vpc: ec2.IVpc;
}

/**
 * PostgreSQL en subredes aisladas + bastión SSM para llegar a ella.
 *
 * La base nunca es pública. Desde el portátil se accede por túnel de Session
 * Manager a través del bastión (`npm run infra:db-tunnel`): el bastión no abre
 * ningún puerto de entrada, así que no hay SSH ni IP que mantener en una lista.
 * En prod el backend vivirá en la misma VPC y el bastión queda solo para
 * mantenimiento.
 */
export class DataStack extends Stack {
  readonly db: rds.DatabaseInstance;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { config, vpc } = props;

    const bastion = new ec2.BastionHostLinux(this, 'Bastion', {
      vpc,
      instanceName: resourceName(config, 'bastion'),
      // La cuenta está en el plan gratuito de AWS, que solo admite tipos
      // elegibles (t4g.nano no lo es). t4g.micro es el más pequeño permitido.
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({ cpuType: ec2.AmazonLinuxCpuType.ARM_64 }),
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
      requireImdsv2: true,
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      securityGroupName: resourceName(config, 'rds'),
      description: 'Vapeupar PostgreSQL: solo acepta conexiones del bastion y del backend',
      allowAllOutbound: false,
    });

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

    this.db.connections.allowDefaultPortFrom(bastion, 'Tunel SSM desde el bastion');

    // Valores no secretos para scripts y para el backend, con la misma
    // convención de rutas que usa DeliPan (/delipan/staging/*).
    const params: Record<string, string> = {
      DB_HOST: this.db.dbInstanceEndpointAddress,
      DB_PORT: this.db.dbInstanceEndpointPort,
      DB_NAME: 'vapeupar',
      DB_SECRET_ARN: this.db.secret!.secretArn,
      BASTION_INSTANCE_ID: bastion.instanceId,
    };
    for (const [key, value] of Object.entries(params)) {
      new ssm.StringParameter(this, `Param${key}`, {
        parameterName: paramName(config, key),
        stringValue: value,
      });
    }
  }
}
