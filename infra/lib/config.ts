import { RemovalPolicy } from 'aws-cdk-lib';
import { InstanceSize } from 'aws-cdk-lib/aws-ec2';

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
  /** EC2 de la aplicación: frontend + backend detrás de nginx (app-stack.ts). */
  app: {
    /** Tamaño Graviton (t4g). El plan gratuito solo admite micro y small. */
    instanceSize: InstanceSize;
    rootVolumeGb: number;
    /**
     * URL pública por la que se entra a la tienda y a la consola, sin barra
     * final. Sin valor, `http://<IP elástica>`. El backend la usa para CORS
     * (`FRONTEND_URL` y `ADMIN_URL`). Es lo único que cambia al pasar al
     * nombre de No-IP y después al dominio definitivo (F4): el frontend se
     * compila con la API relativa (`/api`) y no lleva el origen dentro.
     */
    publicOrigin?: string;
  };
  monthlyBudgetUsd: number;
  /**
   * Despliegue continuo desde GitHub Actions (app-stack.ts, rol
   * `vapeupar-<env>-github-deploy`). Solo los jobs que corren en el
   * Environment `environment` de `repository` pueden asumir el rol; las
   * reglas del Environment (aprobación y rama `produccion`) se configuran en
   * GitHub. Sin valor, el entorno solo se despliega a mano.
   */
  ci?: {
    /** `propietario/repositorio` en GitHub. */
    repository: string;
    /**
     * El mismo repositorio en el formato INMUTABLE del `sub` de OIDC,
     * `propietario@<id>/repositorio@<id>`: GitHub lo usa por defecto en este
     * repositorio. Con IDs y no con nombres, un repositorio recreado con el
     * mismo nombre no puede asumir el rol. Se consulta con
     * `gh api repos/<propietario>/<repo>/actions/oidc/customization/sub`.
     */
    oidcRepository: string;
    /** GitHub Environment (Settings > Environments). */
    environment: string;
  };
}

const ACCOUNT = '342284838697';
const REGION = 'us-east-1';

const CONFIGS: Record<EnvName, EnvConfig> = {
  /*
   * `dev` ES EL ENTORNO DE PRODUCCIÓN (decisión D1 de
   * docs/aws-full-deployment-plan.md, 2026-11-06). Se conserva el nombre porque
   * renombrarlo reemplazaría todos los recursos físicos —base incluida—, y el
   * nombre no cambia lo que importa: los ajustes de abajo.
   *
   * Endurecido en su sitio respecto a la configuración desechable original:
   * protección de borrado y RETAIN en RDS y Cognito, backups de 7 días y
   * CloudFront con edges de Sudamérica.
   *
   * EL BUCKET DE CATÁLOGO PASA A RETAIN Y VERSIONADO (2026-11-17, Deathnote
   * `endurecer-entorno-vivo`), en su propio despliegue. Pasar de DESTROY a
   * RETAIN retira el recurso personalizado `autoDeleteObjects`, que es el que
   * VACÍA el bucket al borrarse: se despliega solo después de una copia
   * (`aws s3 sync`) y de leer el diff. Procedimiento en
   * docs/infrastructure-aws.md §8.2.
   *
   * MFA: `mfaRequired` sigue en false porque Cognito NO PERMITE pasar un pool
   * existente de OPCIONAL a OBLIGATORIO; solo se fija al crearlo.
   */
  dev: {
    envName: 'dev',
    account: ACCOUNT,
    region: REGION,
    vpcCidr: '10.50.0.0/16',
    db: {
      multiAz: false,
      allocatedStorageGb: 20,
      maxAllocatedStorageGb: 50,
      // 1 DÍA ES EL MÁXIMO QUE PERMITE EL PLAN GRATUITO DE AWS. Se intentó subir
      // a 7 el 2026-11-06 y RDS lo rechazó: «The specified backup retention
      // period exceeds the maximum available to free tier customers».
      // CloudFormation deshizo el cambio sin tocar la base. Mientras dure el
      // plan gratuito, la red de seguridad son los snapshots MANUALES antes de
      // cada migración o despliegue con riesgo (docs/aws-full-deployment-plan.md
      // F1.8 y F5). Subirlo a 7 es parte de pasar a plan de pago.
      //
      // Si se vuelve a intentar: el conjunto de cambios marca la instancia como
      // REEMPLAZO CONDICIONAL, así que va en un despliegue propio y con snapshot.
      backupRetentionDays: 1,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    },
    storage: {
      // Nombre de No-IP (D2: se mantiene), con TLS desde el 2026-11-17 (F4).
      uploadOrigins: ['https://vapeupar.ddns.net', 'http://localhost:3000'],
      versioned: true,
      // Colombia se sirve desde edges de Sudamérica, que PRICE_CLASS_100 excluye.
      cdnPriceClassAll: true,
      removalPolicy: RemovalPolicy.RETAIN,
    },
    auth: {
      mfaRequired: false,
      removalPolicy: RemovalPolicy.RETAIN,
    },
    app: {
      instanceSize: InstanceSize.MICRO,
      rootVolumeGb: 20,
      // Nombre de No-IP apuntado a la IP elástica (D2), con TLS (F4). El CORS
      // del backend acepta solo este origen: ni la IP ni http.
      publicOrigin: 'https://vapeupar.ddns.net',
    },
    monthlyBudgetUsd: 30,
    // `.github/workflows/deploy-produccion.yml` y `rollback-produccion.yml`.
    // Recuerda: dev ES producción.
    ci: {
      repository: 'Afigueroaf/Vapeupar',
      oidcRepository: 'Afigueroaf@178751164/Vapeupar@1430535178',
      environment: 'produccion',
    },
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
    app: {
      instanceSize: InstanceSize.MICRO,
      rootVolumeGb: 20,
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
