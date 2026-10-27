import { RemovalPolicy } from 'aws-cdk-lib';

/**
 * Configuración por entorno. Todo lo que cambia entre dev y prod vive aquí;
 * los stacks no comparan `envName` salvo a través de estos valores.
 *
 * La cuenta 342284838697 es compartida con DeliPan (staging). Vapeupar se
 * distingue por las etiquetas `Project=Vapeupar` + `Environment=<env>`, el
 * prefijo `vapeupar-<env>-` en nombres y el toolkit de CDK propio
 * (`CDKToolkit-Vapeupar`, qualifier `vapeupar`). Ver docs/infrastructure-aws.md.
 */
export type EnvName = 'dev' | 'prod';

export interface EnvConfig {
  envName: EnvName;
  account: string;
  region: string;
  /** No solapa con DeliPan (10.42.0.0/16) ni con la VPC por defecto (172.31.0.0/16). */
  vpcCidr: string;
  db: {
    multiAz: boolean;
    allocatedStorageGb: number;
    maxAllocatedStorageGb: number;
    backupRetentionDays: number;
    deletionProtection: boolean;
    removalPolicy: RemovalPolicy;
  };
  storage: {
    /** Orígenes autorizados a subir imágenes con URL firmada (la consola /admin). */
    uploadOrigins: string[];
    versioned: boolean;
    /** PRICE_CLASS_100 excluye los edges de Sudamérica; prod debe servir Colombia. */
    cdnPriceClassAll: boolean;
    removalPolicy: RemovalPolicy;
  };
  auth: {
    mfaRequired: boolean;
    removalPolicy: RemovalPolicy;
  };
  monthlyBudgetUsd: number;
}

const ACCOUNT = '342284838697';
const REGION = 'us-east-1';

const CONFIGS: Record<EnvName, EnvConfig> = {
  dev: {
    envName: 'dev',
    account: ACCOUNT,
    region: REGION,
    vpcCidr: '10.50.0.0/16',
    db: {
      multiAz: false,
      allocatedStorageGb: 20,
      maxAllocatedStorageGb: 50,
      backupRetentionDays: 1,
      deletionProtection: false,
      // Snapshot final al destruir: dev es desechable, sus datos no tanto.
      removalPolicy: RemovalPolicy.SNAPSHOT,
    },
    storage: {
      uploadOrigins: ['http://localhost:3000'],
      versioned: false,
      cdnPriceClassAll: false,
      removalPolicy: RemovalPolicy.DESTROY,
    },
    auth: {
      mfaRequired: false,
      removalPolicy: RemovalPolicy.DESTROY,
    },
    monthlyBudgetUsd: 30,
  },
  // Definido para que la transición sea revisar diferencias, no escribir desde
  // cero. NO desplegado: antes hay que cerrar la lista de docs/infrastructure-aws.md §8.
  prod: {
    envName: 'prod',
    account: ACCOUNT,
    region: REGION,
    vpcCidr: '10.51.0.0/16',
    db: {
      multiAz: true,
      allocatedStorageGb: 20,
      maxAllocatedStorageGb: 100,
      backupRetentionDays: 7,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    },
    storage: {
      uploadOrigins: [],
      versioned: true,
      cdnPriceClassAll: true,
      removalPolicy: RemovalPolicy.RETAIN,
    },
    auth: {
      mfaRequired: true,
      removalPolicy: RemovalPolicy.RETAIN,
    },
    monthlyBudgetUsd: 80,
  },
};

export function getConfig(envName: string): EnvConfig {
  if (envName !== 'dev' && envName !== 'prod') {
    throw new Error(`Entorno desconocido "${envName}". Usa -c env=dev o -c env=prod.`);
  }
  return CONFIGS[envName];
}

/** Prefijo de nombres físicos: `vapeupar-dev-rds`, `/vapeupar/dev/DB_HOST`, ... */
export const resourceName = (config: EnvConfig, suffix: string) =>
  `vapeupar-${config.envName}-${suffix}`;

export const paramName = (config: EnvConfig, key: string) =>
  `/vapeupar/${config.envName}/${key}`;
