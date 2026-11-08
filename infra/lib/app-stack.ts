import { ArnFormat, CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvConfig, paramName, resourceName } from './config.js';

interface AppStackProps extends StackProps {
  config: EnvConfig;
  vpc: ec2.IVpc;
  /** Grupo de RDS: aquí se le añade la regla de entrada desde la aplicación. */
  dbSecurityGroup: ec2.ISecurityGroup;
  catalogBucket: s3.IBucket;
  catalogCdn: cloudfront.IDistribution;
  userPool: cognito.IUserPool;
}

/**
 * Versión de Node que corre la aplicación. Fijada: la última 22 LTS ("Jod") al
 * escribir esto, publicada el 2026-10-20. Subirla es cambiar esta línea; la
 * instancia no se reemplaza (ver `userDataCausesReplacement`), así que en una
 * instancia ya creada se actualiza por SSM, no redesplegando.
 */
const NODE_VERSION = 'v22.23.4';

/**
 * EC2 de la aplicación: frontend (Next, :3000) y backend (Express, :4000)
 * detrás de nginx, en la VPC de Vapeupar. Plan completo y razones en
 * `docs/aws-full-deployment-plan.md` (fase F1).
 *
 * SUBRED PÚBLICA A PROPÓSITO. En una privada, `npm`, Secrets Manager, Cognito
 * y SSM necesitarían NAT Gateway (~32 USD/mes). La superficie se cierra con el
 * grupo de seguridad: solo 80 y 443, ninguna regla de SSH. Se entra por
 * Session Manager, igual que al bastión.
 *
 * TAMBIÉN ES EL DESTINO DEL TÚNEL A RDS desde el portátil
 * (`npm run infra:db-tunnel`, parámetro `TUNNEL_INSTANCE_ID`). Por eso el
 * bastión sobra y se retira en F1.7.
 *
 * NO GUARDA ESTADO. Las releases viven en el bucket de artefactos y la
 * configuración en SSM y Secrets Manager, así que reemplazar la instancia es
 * molesto (unos minutos de caída) pero no pierde nada.
 */
export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const { config, vpc } = props;

    /* --- Red ------------------------------------------------------------- */

    // Las descripciones de grupos y reglas solo admiten ASCII sin tildes.
    const appSecurityGroup = new ec2.SecurityGroup(this, 'AppSecurityGroup', {
      vpc,
      securityGroupName: resourceName(config, 'app'),
      description: 'Vapeupar app: HTTP y HTTPS publicos, sin SSH (acceso por SSM)',
      allowAllOutbound: true,
    });
    appSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP: redireccion a HTTPS y desafio de Lets Encrypt',
    );
    appSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    // Sin IPv6: la VPC no tiene bloque IPv6 asignado, así que una regla `::/0`
    // no abriría nada.

    // La regla se crea EN ESTE STACK sobre el grupo de RDS, en vez de con
    // `db.connections.allowDefaultPortFrom()`. Así la dependencia va en un solo
    // sentido (App -> Data): el grupo de RDS se exporta desde Data y se usa
    // aquí. Con el método de `connections`, CDK puede colocar la regla en el
    // stack de la base y crear una dependencia circular entre los dos.
    new ec2.CfnSecurityGroupIngress(this, 'DbIngressFromApp', {
      groupId: props.dbSecurityGroup.securityGroupId,
      sourceSecurityGroupId: appSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      description: 'PostgreSQL desde la EC2 de la aplicacion',
    });

    /* --- Artefactos de release ------------------------------------------- */

    // UNA CLAVE ESTABLE CON VERSIONADO, no una clave por release. El script de
    // despliegue (F3) sube siempre a la misma clave y S3 guarda el historial
    // como versiones. Así la release viva NUNCA caduca —es la versión actual,
    // y la regla solo expira versiones antiguas—, y volver atrás es restaurar
    // una versión anterior. Con claves fechadas y caducidad por días, una
    // release que lleve más de un mes sin cambiarse desaparecería del bucket
    // justo cuando hiciera falta reinstalarla en una instancia nueva.
    //
    // DESTROY con vaciado automático porque todo lo que hay aquí se reconstruye
    // desde git: no es un dato del negocio.
    const artifactsBucket = new s3.Bucket(this, 'ArtifactsBucket', {
      bucketName: resourceName(config, `artifacts-${this.account}`),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [
        {
          // Las 5 releases anteriores se conservan siempre; más allá de esas,
          // las que lleven 30 días reemplazadas se borran.
          noncurrentVersionExpiration: Duration.days(30),
          noncurrentVersionsToRetain: 5,
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    /* --- Permisos de la instancia ---------------------------------------- */

    // Exactamente lo que el backend y el despliegue usan, y nada más. Cada
    // permiso de abajo tiene su llamada correspondiente en el código; si se
    // añade una llamada nueva a AWS, se añade aquí su permiso, no un comodín.
    const role = new iam.Role(this, 'AppRole', {
      roleName: resourceName(config, 'app'),
      description: 'EC2 de la aplicacion Vapeupar: SSM, configuracion, catalogo y artefactos',
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        // Session Manager (entrar sin SSH, túnel a RDS) y Run Command (F3).
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // Configuración no secreta: lo que publican los stacks en /vapeupar/<env>/*.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
        resources: [
          this.formatArn({ service: 'ssm', resource: 'parameter', resourceName: `vapeupar/${config.envName}` }),
          this.formatArn({ service: 'ssm', resource: 'parameter', resourceName: `vapeupar/${config.envName}/*` }),
        ],
      }),
    );

    // Los tres secretos del entorno, por nombre. Secrets Manager añade seis
    // caracteres aleatorios al ARN, de ahí el `-??????`: así no hace falta
    // importar los ARN de otros stacks, y el comodín no alcanza a ningún otro
    // secreto. El maestro de RDS está porque las migraciones se ejecutan desde
    // la instancia (F5); el backend en marcha usa solo `rds-app`.
    // Cifrados con la clave gestionada de Secrets Manager: no hace falta KMS.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: ['rds-app', 'rds-master', 'cognito-backend-client'].map((name) =>
          this.formatArn({
            service: 'secretsmanager',
            resource: 'secret',
            // `secret:<nombre>`, con dos puntos, no `secret/<nombre>`.
            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
            resourceName: `vapeupar/${config.envName}/${name}-??????`,
          }),
        ),
      }),
    );

    // Subida de imágenes: SOLO `PutObject` y SOLO bajo los tres prefijos que
    // deriva `backend/src/catalog/image-keys.ts`. Quien consiga llamar al
    // presign puede escribir hasta donde llegue este permiso, así que llega
    // exactamente hasta ahí. No se usa `bucket.grantPut()` porque añade
    // etiquetado, retención legal y otros permisos que el backend no usa.
    //
    // `DeleteObject` va con él y con los mismos prefijos: cada subida es una
    // clave versionada, y al guardar la fila el backend borra la imagen que
    // deja de usar (`CatalogService.releaseImage`). Sin él el borrado falla en
    // silencio —está pensado para no tumbar el guardado— y el bucket acumula
    // huérfanas.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:DeleteObject'],
        resources: ['marcas', 'proveedores', 'productos'].map((prefix) =>
          props.catalogBucket.arnForObjects(`${prefix}/*`),
        ),
      }),
    );

    // Invalidación de una ruta al reemplazar una imagen, y solo en la
    // distribución del catálogo.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [
          this.formatArn({
            service: 'cloudfront',
            region: '',
            resource: 'distribution',
            resourceName: props.catalogCdn.distributionId,
          }),
        ],
      }),
    );

    // Cognito: solo las tres operaciones de administración que hace el
    // backend (`backend/src/services/auth.service.ts`). `InitiateAuth`,
    // `RespondToAuthChallenge` y `GlobalSignOut` no aparecen porque son
    // operaciones públicas: se autentican con el secreto del cliente o con el
    // propio token del usuario, no con IAM.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminDisableUser',
          'cognito-idp:AdminUserGlobalSignOut',
        ],
        resources: [props.userPool.userPoolArn],
      }),
    );

    // Descargar releases (F3). Solo lectura.
    artifactsBucket.grantRead(role);

    /* --- Instancia ------------------------------------------------------- */

    const userData = ec2.UserData.custom(bootstrapScript());

    const instance = new ec2.Instance(this, 'App', {
      instanceName: resourceName(config, 'app'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: appSecurityGroup,
      role,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, config.app.instanceSize),
      // AMI FIJADA EN `cdk.context.json` (`cachedInContext`). Sin esto, cada
      // AMI nueva de Amazon Linux reemplazaría la instancia en el siguiente
      // despliegue de este stack, aunque no se hubiera tocado nada: es lo que
      // le pasaba al bastión. Actualizar la AMI pasa a ser una decisión:
      // `npx cdk context --reset <clave>` y desplegar, sabiendo que reemplaza.
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
        cachedInContext: true,
      }),
      requireImdsv2: true,
      // CRÉDITOS DE CPU EN MODO ESTÁNDAR, NO ILIMITADO (el valor por defecto
      // de las t4g). En ilimitado, una CPU sostenida por encima de la línea
      // base —un bucle descontrolado, un `npm ci` largo— se cobra aparte sin
      // aviso. En estándar la instancia se ralentiza en vez de facturar, que es
      // lo que conviene en una cuenta que vive de un crédito.
      creditSpecification: ec2.CpuCredits.STANDARD,
      blockDevices: [
        {
          deviceName: '/dev/xvda', // raíz de Amazon Linux 2023
          volume: ec2.BlockDeviceVolume.ebs(config.app.rootVolumeGb, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],
      userData,
      // El script solo corre en el primer arranque (cloud-init no lo repite).
      // Cambiarlo NO debe reemplazar la instancia: la configuración posterior
      // va por SSM (F2/F3), no por aquí.
      userDataCausesReplacement: false,
      associatePublicIpAddress: true,
    });

    // IP ELÁSTICA: sin ella, la IP pública cambia en cada parada y el nombre
    // de No-IP (y después el dominio) queda apuntando al vacío. Mientras está
    // asociada no suma coste: la IPv4 pública se paga igual. Pero se paga
    // TAMBIÉN con la instancia detenida (docs/aws-full-deployment-plan.md §5).
    const eip = new ec2.CfnEIP(this, 'AppEip', {
      domain: 'vpc',
      tags: [{ key: 'Name', value: resourceName(config, 'app') }],
    });
    new ec2.CfnEIPAssociation(this, 'AppEipAssociation', {
      allocationId: eip.attrAllocationId,
      instanceId: instance.instanceId,
    });

    /* --- Despliegue continuo desde GitHub Actions ------------------------ */

    // Lo que necesita `infra/scripts/deploy-app.mjs` y nada más: leer sus
    // parámetros de SSM, subir `releases/app.tar.gz` y lanzar `activate.sh`
    // en ESTA instancia con AWS-RunShellScript. No puede tocar CDK, la base ni
    // los secretos: la aplicación los lee en la instancia, no en el build.
    //
    // Sin claves de acceso guardadas en GitHub: el job pide un token OIDC y
    // lo cambia por credenciales de 1 hora. La confianza se limita al push a
    // la rama de `config.ci` de ese repositorio (`sub` exacto, sin comodines):
    // un PR, otra rama o un fork no pueden asumir el rol.
    //
    // El proveedor OIDC de GitHub es UNO POR CUENTA y ya existe (lo creó
    // DeliPan, cuenta compartida): se importa, no se crea. Crear otro falla, y
    // borrarlo con este stack dejaría a DeliPan sin despliegues.
    if (config.ci) {
      const github = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
        this,
        'GithubOidc',
        `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
      );
      const deployRole = new iam.Role(this, 'GithubDeployRole', {
        roleName: resourceName(config, 'github-deploy'),
        description: `Despliegue de la aplicacion desde ${config.ci.repository}@${config.ci.branch}`,
        maxSessionDuration: Duration.hours(1),
        assumedBy: new iam.WebIdentityPrincipal(github.openIdConnectProviderArn, {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            'token.actions.githubusercontent.com:sub': `repo:${config.ci.repository}:ref:refs/heads/${config.ci.branch}`,
          },
        }),
      });
      const paramArn = (key: string) =>
        this.formatArn({ service: 'ssm', resource: 'parameter', resourceName: paramName(config, key).slice(1) });
      deployRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['ssm:GetParameter'],
          resources: ['ARTIFACTS_BUCKET', 'APP_INSTANCE_ID', 'APP_PUBLIC_IP', 'CDN_DOMAIN'].map(paramArn),
        }),
      );
      // Variables públicas del frontend (`/vapeupar/<env>/web/NEXT_PUBLIC_*`):
      // se crean a mano, fuera del repositorio. Ver docs/infrastructure-aws.md.
      deployRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['ssm:GetParametersByPath'],
          // El recurso que evalúa IAM es la ruta pedida; con «/*» cubre también
          // los parámetros, por si se pide con barra final.
          resources: [paramArn('web'), paramArn('web/*')],
        }),
      );
      deployRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['s3:PutObject'],
          resources: [artifactsBucket.arnForObjects('releases/app.tar.gz')],
        }),
      );
      deployRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['ssm:SendCommand'],
          resources: [
            this.formatArn({ service: 'ec2', resource: 'instance', resourceName: instance.instanceId }),
            this.formatArn({ service: 'ssm', account: '', resource: 'document', resourceName: 'AWS-RunShellScript' }),
          ],
        }),
      );
      // GetCommandInvocation no admite permisos por recurso.
      deployRole.addToPolicy(new iam.PolicyStatement({ actions: ['ssm:GetCommandInvocation'], resources: ['*'] }));

      new CfnOutput(this, 'GithubDeployRoleArn', {
        value: deployRole.roleArn,
        description: 'Rol que asume .github/workflows/deploy-produccion.yml',
      });
    }

    /* --- Parámetros y salidas ------------------------------------------- */

    const params: Record<string, string> = {
      APP_INSTANCE_ID: instance.instanceId,
      // Mismo valor que APP_INSTANCE_ID, con otro nombre a propósito:
      // `db-tunnel.mjs` pregunta por «a través de qué instancia», no por «cuál
      // es la aplicación». Si algún día vuelve un bastión, se cambia solo este.
      TUNNEL_INSTANCE_ID: instance.instanceId,
      APP_PUBLIC_IP: eip.attrPublicIp,
      ARTIFACTS_BUCKET: artifactsBucket.bucketName,
      // Lo lee `infra/deploy/write-env.mjs` en la instancia para el CORS del
      // backend. Ver `config.app.publicOrigin`.
      PUBLIC_ORIGIN: config.app.publicOrigin ?? `http://${eip.attrPublicIp}`,
    };
    for (const [key, value] of Object.entries(params)) {
      new ssm.StringParameter(this, `Param${key}`, {
        parameterName: paramName(config, key),
        stringValue: value,
      });
    }

    new CfnOutput(this, 'AppPublicIp', {
      value: eip.attrPublicIp,
      description: 'IP elastica de la aplicacion: apuntar aqui el nombre de No-IP',
    });
    new CfnOutput(this, 'AppInstanceId', { value: instance.instanceId });
  }
}

/**
 * Preparación del primer arranque. Idempotente: cada paso comprueba antes de
 * actuar, para que repetirlo a mano por SSM no rompa nada.
 *
 * Deja la máquina LISTA PARA RECIBIR la aplicación, sin la aplicación: Node,
 * nginx con una página provisional, swap, usuario de servicio y carpetas. Las
 * unidades de systemd, la configuración de nginx y certbot llegan en F2 y F4.
 */
function bootstrapScript(): string {
  return `#!/bin/bash
set -euo pipefail
exec > >(tee -a /var/log/vapeupar-bootstrap.log) 2>&1
echo "[vapeupar] bootstrap $(date -Is)"

# --- Swap de 2 GB -------------------------------------------------------------
# Red de seguridad para 1 GB de RAM con dos procesos Node. dd y no fallocate:
# la raíz de AL2023 es XFS, y un swapfile con huecos lo rechaza swapon.
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show | grep -q /swapfile || swapon /swapfile
# Usar la swap solo cuando hace falta, no como memoria normal.
echo 'vm.swappiness=10' > /etc/sysctl.d/90-vapeupar.conf
sysctl -q -p /etc/sysctl.d/90-vapeupar.conf

# --- Paquetes -----------------------------------------------------------------
dnf install -y -q nginx xz tar

# --- Node ${NODE_VERSION} (binario oficial, con su suma de verificación) ----------
# El SHASUMS256.txt viene del mismo origen por HTTPS: protege contra una
# descarga corrupta o truncada, y el TLS de nodejs.org contra la suplantación.
NODE_VERSION=${NODE_VERSION}
NODE_DIR=/opt/node-$NODE_VERSION
if [ ! -x "$NODE_DIR/bin/node" ]; then
  TMP=$(mktemp -d)
  cd "$TMP"
  curl -fsSLO "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-arm64.tar.xz"
  curl -fsSLO "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt"
  grep " node-$NODE_VERSION-linux-arm64.tar.xz\\$" SHASUMS256.txt | sha256sum -c -
  mkdir -p "$NODE_DIR"
  tar -xJf "node-$NODE_VERSION-linux-arm64.tar.xz" -C "$NODE_DIR" --strip-components=1
  cd /
  rm -rf "$TMP"
fi
for bin in node npm npx; do ln -sfn "$NODE_DIR/bin/$bin" "/usr/local/bin/$bin"; done
/usr/local/bin/node --version

# --- Usuario de servicio y carpetas -------------------------------------------
id vapeupar >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /opt/vapeupar --shell /sbin/nologin vapeupar
install -d -o vapeupar -g vapeupar -m 755 /opt/vapeupar /opt/vapeupar/releases
# Aquí escribirá cada arranque los .env generados desde SSM y Secrets Manager.
install -d -o root -g root -m 700 /etc/vapeupar

# --- nginx con página provisional ---------------------------------------------
# Sirve para verificar desde internet que el puerto 80 llega. F2 la sustituye
# por el proxy a las dos aplicaciones.
cat > /usr/share/nginx/html/index.html <<'HTML'
<!doctype html><html lang="es"><meta charset="utf-8"><title>Vapeupar</title>
<body style="background:#080808;color:#f5f5f5;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
<p>Vapeupar &mdash; en preparaci&oacute;n</p></body></html>
HTML
systemctl enable --now nginx

echo "[vapeupar] bootstrap OK $(date -Is)"
`;
}
