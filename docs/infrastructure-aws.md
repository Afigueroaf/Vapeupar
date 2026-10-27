# Infraestructura AWS — Vapeupar

Runbook del entorno AWS de Vapeupar: qué hay desplegado, cómo se opera, cómo se
separa de DeliPan en la cuenta compartida y qué falta para producción.

Decisión de origen: [ADR-002](decisions/002-consola-de-administracion-y-persistencia.md)
(decisiones 1, 6, 8 y 9). Fases que lo consumen:
[`admin-console-execution-plan.md`](admin-console-execution-plan.md).

| | |
|---|---|
| Cuenta | `342284838697` (compartida con DeliPan staging) |
| Plan de AWS | **Gratuito** (`FREE`), vence el 2027-03-12; 157,54 USD de crédito al 2026-10-26. Ver §6.1 |
| Región | `us-east-1` |
| Código | `infra/` (AWS CDK, TypeScript) |
| Entorno `dev` | ✅ Desplegado el 2026-10-26 |
| Entorno `prod` | ⬜ Definido en `infra/lib/config.ts`, **no desplegado** (ver §8) |

---

## 1. Principios

1. **Todo por código.** Ningún recurso de Vapeupar se crea a mano en la consola.
   Si algo se cambia en la consola, el siguiente `cdk deploy` lo revierte o
   falla; el cambio correcto se hace en `infra/` y se revisa con `cdk diff`.
2. **La base de datos nunca es pública.** Ni en dev ni en prod.
3. **Los secretos no salen de Secrets Manager** salvo hacia `backend/.env`
   (ignorado por git) mediante el script de §5.3, que no los imprime.
4. **Nada de DeliPan se toca desde este repositorio.**
5. **Dev y prod comparten el mismo código.** Las diferencias viven solo en
   `infra/lib/config.ts`.

## 2. Arquitectura del entorno dev

```
                Internet
                   |
   +---------------+-----------------------------------------------+
   |  VPC vapeupar-dev-vpc  10.50.0.0/16  (2 AZ, sin NAT Gateway)  |
   |                                                               |
   |  Subred pública                 Subred aislada (sin internet) |
   |  +-----------------------+      +--------------------------+  |
   |  | vapeupar-dev-bastion  | ---> | vapeupar-dev-db          |  |
   |  | t4g.micro, sin puertos|5432  | RDS PostgreSQL 18.6      |  |
   |  | de entrada (solo SSM) |      | db.t4g.micro, cifrada    |  |
   |  +-----------^-----------+      +--------------------------+  |
   |              |                  Endpoint de gateway S3 (gratis)|
   +--------------|------------------------------------------------+
                  | túnel Session Manager (HTTPS saliente)
          portátil: localhost:15432

   S3 vapeupar-dev-catalog-<cuenta> (privado) <-- OAC -- CloudFront (imágenes)
   Cognito vapeupar-dev-admins  (sin registro público, cliente confidencial)
```

| Stack | Recursos principales |
|---|---|
| `CDKToolkit-Vapeupar` | Toolkit de CDK propio (qualifier `vapeupar`): bucket de assets y roles `cdk-vapeupar-*` |
| `Vapeupar-dev-Network` | VPC, 2 subredes públicas + 2 aisladas, Internet Gateway, endpoint S3, grupo de seguridad por defecto cerrado |
| `Vapeupar-dev-Data` | RDS `vapeupar-dev-db`, bastión `vapeupar-dev-bastion`, grupo de seguridad `vapeupar-dev-rds`, secreto `vapeupar/dev/rds-master` |
| `Vapeupar-dev-Storage` | Bucket `vapeupar-dev-catalog-342284838697`, distribución CloudFront con OAC |
| `Vapeupar-dev-Auth` | User Pool `vapeupar-dev-admins`, cliente `vapeupar-dev-backend`, secreto `vapeupar/dev/cognito-backend-client` |
| `Vapeupar-dev-Ops` | Presupuesto `vapeupar-dev-monthly` (30 USD), grupo de recursos `vapeupar-dev-resources` |

### Parámetros publicados en SSM (`/vapeupar/dev/*`)

Los stacks publican aquí todo valor que otros necesitan. Los scripts y el backend
leen de aquí, nunca IDs copiados a mano: si un recurso se recrea, el parámetro
se actualiza solo.

| Parámetro | Contenido |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME` | Endpoint de RDS |
| `DB_SECRET_ARN` | ARN del secreto con usuario y contraseña maestros |
| `BASTION_INSTANCE_ID` | Instancia destino del túnel |
| `S3_CATALOG_BUCKET`, `CDN_DOMAIN` | Bucket de imágenes y dominio de CloudFront |
| `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | Pool y cliente del backend |
| `COGNITO_CLIENT_SECRET_ARN` | ARN del secreto del cliente confidencial |

## 3. Cuenta compartida con DeliPan

### 3.1 Qué hay de DeliPan en la cuenta (inventario del 2026-10-26, solo lectura)

DeliPan tiene un entorno de **staging creado a mano** (sin CloudFormation):

| Tipo | Recursos |
|---|---|
| Red | VPC `delipan-staging` (`10.42.0.0/16`), subredes `delipan-staging-public` / `-private-a` / `-private-b`, IGW, Elastic IP |
| Cómputo | EC2 `delipan-staging` (`t3.small`), accedida por SSM |
| Datos | RDS `delipan-staging` (PostgreSQL 18.3, `db.t4g.micro`, privada) |
| Storage | S3 `delipan-client-media-staging` |
| Config | ~29 parámetros en `/delipan/staging/*` |
| IAM | Roles `delipan-staging-ec2`, `delipan-github-actions-deploy`, `rds-monitoring-role` |
| Costos | Presupuesto general `My Monthly Cost Budget` (100 USD, **toda la cuenta**) |

Además hay una Lambda `Example` y el rol `Example-role-1fosnzhy`, creados desde
un blueprint de consola, sin etiquetas ni dueño claro.

### 3.2 Cómo se distingue Vapeupar

| Dónde mirar | Vapeupar | DeliPan |
|---|---|---|
| Etiqueta `Project` | `Vapeupar` | `Delipan` |
| Prefijo de nombre | `vapeupar-dev-` / `Vapeupar-dev-` | `delipan-staging-` |
| CloudFormation | `Vapeupar-dev-*`, `CDKToolkit-Vapeupar` | (ninguno) |
| SSM | `/vapeupar/dev/*` | `/delipan/staging/*` |
| Secrets Manager | `vapeupar/dev/*` | (usa SSM SecureString) |
| Etiqueta `ManagedBy` | `cdk` | (no existe) |

**Vista rápida en consola:** *Resource Groups → `vapeupar-dev-resources`* lista
solo los recursos de Vapeupar dev.

**Costos por proyecto:** *Billing → Cost Explorer → Group by: Tag → Project*.
Las etiquetas `Project` y `Environment` se activaron como etiquetas de asignación
de costos el 2026-10-26. Es un ajuste de toda la cuenta, que beneficia también a
DeliPan. Cost Explorer tarda hasta 24 h en mostrar datos por etiqueta y no
reetiqueta gastos anteriores a la activación.

### 3.3 Recomendaciones para DeliPan (no ejecutadas)

No se modificó nada de DeliPan. Para que la separación sea completa también del
lado de DeliPan, su responsable debería considerar:

1. **Etiquetar su red.** VPC, subredes, IGW, tablas de rutas, Elastic IP y grupos
   de seguridad tienen solo `Name`, sin `Project=Delipan` ni `Environment`, así
   que no aparecen al filtrar costos o recursos por proyecto.
2. **Aclarar el dueño** de la Lambda `Example` y de `Example-role-1fosnzhy`, o
   eliminarlas si son restos de una prueba.
3. **Identidad separada.** El usuario IAM `delipan_admin` (AdministratorAccess,
   claves de larga duración) se está usando también para desplegar Vapeupar, así
   que CloudTrail atribuye a «delipan» los cambios de ambos proyectos (ver §8.1).

## 4. Decisiones de diseño del entorno

| Decisión | Motivo |
|---|---|
| **Sin NAT Gateway** | Cuesta ~32 USD/mes aunque no se use. La base no necesita salida a internet; el bastión está en subred pública; S3 se alcanza por endpoint de gateway gratuito |
| **Bastión SSM en lugar de RDS pública** | La base queda privada igual que en prod, sin SSH ni listas de IPs. Cuesta ~10 USD/mes y puede detenerse |
| **Bastión `t4g.micro`, no `t4g.nano`** | El plan gratuito de AWS solo admite tipos elegibles (`t3/t4g.micro`, `t3/t4g.small`, `t8i.micro/small`, `c7i-flex.large`, `m7i-flex.large`). `t4g.nano` falló al desplegar por eso. Al pasar a plan de pago se puede volver a `nano` |
| **VPC `10.50.0.0/16` (dev) / `10.51.0.0/16` (prod)** | No solapa con DeliPan (`10.42`) ni con la VPC por defecto (`172.31`); permite peering sin renumerar |
| **Toolkit de CDK con qualifier propio** | DeliPan no usa CDK, pero si algún día lo usa, su bootstrap no puede pisar el de Vapeupar ni al revés |
| **PostgreSQL 18.6 fijado explícitamente** | El enum de `aws-cdk-lib` 2.275 llega a 18.3. Las versiones menores se actualizan solas (`autoMinorVersionUpgrade`) |
| **Credencial de RDS generada en Secrets Manager** | Nadie la escribe ni la conoce; se lee bajo demanda |
| **Cognito con correo integrado en dev** | Sin configurar SES. Límite diario bajo, suficiente para invitar a pocas personas |
| **Cognito plan Lite** | Gratuito hasta 10 000 usuarios activos al mes; la consola tendrá unos pocos |
| **CloudFront `PRICE_CLASS_100` en dev** | Más barato; excluye los edges de Sudamérica. Prod usa `PRICE_CLASS_ALL` para servir bien a Colombia |
| **Feature flags recomendados de CDK activados y validación como error** | Proyecto nuevo, sin recursos previos que reemplazar. Las referencias entre stacks se fijan en `strong` para que no se pueda borrar la VPC mientras la use la base |
| **Correo de alertas fuera del repositorio** | Es un dato personal: se pasa por `VAPEUPAR_ALERT_EMAIL` o por `~/.cdk.json` |

## 5. Operación diaria

### 5.1 Requisitos

- Node.js 22 o superior.
- AWS CLI v2 con sesión válida en la cuenta `342284838697` (`aws sts get-caller-identity`).
- [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)
  para el túnel (`session-manager-plugin --version`).
- Correo de alertas de presupuesto, disponible para CDK. Lo más cómodo es
  dejarlo en `~/.cdk.json` (fuera del repositorio):
  ```json
  { "context": { "alertEmail": "tu-correo@ejemplo.com" } }
  ```
  o exportar `VAPEUPAR_ALERT_EMAIL` en cada sesión.

### 5.2 Comandos (desde la raíz del repositorio)

| Comando | Qué hace |
|---|---|
| `npm run infra:diff` | Muestra qué cambiaría en AWS respecto al código. Ejecutar **siempre** antes de desplegar |
| `npm run infra:deploy` | Despliega todos los stacks del entorno dev |
| `npm run infra:db-tunnel` | Abre `localhost:15432` → RDS dev. Comprueba que el puerto esté libre y arranca el bastión si está detenido. Ctrl+C cierra |
| `npm run infra:env-backend` | Escribe en `backend/.env` las variables de AWS (§5.3). No imprime valores |

Para otro entorno: `npm run diff --workspace=infra -- -c env=prod` (solo cuando
prod esté habilitado, §8).

### 5.3 Conectar el backend local a la base de dev

```bash
npm run infra:env-backend     # una vez, o cuando se recree algún recurso
npm run infra:db-tunnel       # en una terminal aparte; dejarla abierta
npm run dev:backend
```

`infra:env-backend` conserva las variables que ya hubiera en `backend/.env`
(`PORT`, `NODE_ENV`, `FRONTEND_URL`) y reescribe un bloque marcado con:
`AWS_REGION`, `DATABASE_URL`, `S3_CATALOG_BUCKET`, `CDN_DOMAIN`,
`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET` y
`REVALIDATE_SECRET` (este último se genera una vez y se conserva).

### 5.4 Ahorrar cuando no se usa

```bash
# En Git Bash, anteponer MSYS_NO_PATHCONV=1: si no, convierte /vapeupar/... en una ruta de Windows.
# Bastión (ahorra ~10 USD/mes; el túnel lo vuelve a arrancar solo)
aws ec2 stop-instances --instance-ids $(aws ssm get-parameter --name /vapeupar/dev/BASTION_INSTANCE_ID --query Parameter.Value --output text)

# Base de datos (ahorra ~12 USD/mes; AWS la vuelve a arrancar sola a los 7 días)
aws rds stop-db-instance --db-instance-identifier vapeupar-dev-db
aws rds start-db-instance --db-instance-identifier vapeupar-dev-db
```

Detenidos, se sigue pagando el almacenamiento (unos 3 USD/mes).

### 5.5 Destruir el entorno dev

```bash
cd infra && npx cdk destroy --all
```

- RDS deja un **snapshot final** (`removalPolicy: SNAPSHOT`) que se cobra como
  almacenamiento hasta que se borre a mano.
- El bucket de imágenes se vacía y se borra (solo en dev).
- Los secretos quedan en borrado programado (7–30 días) según Secrets Manager.
- `CDKToolkit-Vapeupar` no se borra con `destroy`; se elimina aparte si ya no
  habrá ningún entorno.

## 6. Costos estimados del entorno dev

Precios de lista aproximados en `us-east-1`; confirmar en la
[calculadora de AWS](https://calculator.aws/).

| Recurso | USD/mes |
|---|---|
| RDS `db.t4g.micro` Single-AZ | ~11.7 |
| RDS 20 GB gp3 (los backups hasta ese tamaño no se cobran) | ~2.3 |
| Bastión `t4g.micro` + disco 8 GB | ~6.8 |
| IPv4 pública del bastión | ~3.7 |
| Secrets Manager (2 secretos) | ~0.8 |
| CloudWatch Logs (logs de PostgreSQL, 1 semana) | <1 |
| S3, CloudFront, Cognito Lite, SSM, Lambdas de CDK | ~0 a este volumen |
| **Total** | **~26** |

Alertas: `vapeupar-dev-monthly` avisa al 80 % del gasto real y al 100 % del
previsto sobre 30 USD, contando solo recursos con `Project=Vapeupar` y
`Environment=dev`. El presupuesto general de la cuenta (100 USD) sigue cubriendo
a ambos proyectos.

### 6.1 Plan gratuito de AWS y créditos compartidos ⚠️

La cuenta está en el **plan gratuito** de AWS (`aws freetier get-account-plan-state`):

| Dato (2026-10-26) | Valor |
|---|---|
| Tipo de plan | `FREE`, activo |
| Crédito restante | 157,54 USD |
| Vencimiento del plan | 2027-03-12 |
| Gasto de los últimos 30 días (casi todo DeliPan staging) | ~34 USD |
| Gasto previsto con Vapeupar dev sumado | ~60 USD/mes |
| **Fecha estimada de agotamiento del crédito** | **mediados de enero de 2027**, antes del vencimiento |

Consecuencias:

1. **El crédito es compartido.** Vapeupar dev casi duplica el ritmo de consumo,
   y acorta también el tiempo que le queda a DeliPan.
2. **El plan gratuito termina** al agotarse el crédito o al llegar la fecha de
   vencimiento, lo que ocurra primero. Para seguir usando la cuenta hay que pasar
   a plan de pago; si no, AWS cierra la cuenta, **con los recursos de ambos
   proyectos**. Revisar las condiciones vigentes en la documentación de AWS Free
   Tier antes de esa fecha.
3. **Restricciones mientras dure el plan:** solo tipos de instancia elegibles
   (ver §4) y algunos servicios limitados.

Qué hacer:

- Decidir **antes de enero de 2027** si la cuenta pasa a plan de pago. Es una
  decisión conjunta con DeliPan, porque afecta a ambos.
- Detener el bastión y la base cuando no se usen (§5.4): baja el consumo de
  Vapeupar de ~26 a ~3 USD/mes.
- Consultar el saldo: `aws freetier get-account-plan-state`.

## 7. Verificación del despliegue

Comprobaciones al desplegar dev (2026-10-26). Se repiten tras cada cambio
relevante:

| Comprobación | Cómo | Resultado |
|---|---|---|
| Ningún stack referencia recursos de DeliPan | `grep -i delipan infra/cdk.out/*.template.json` | ✅ Sin coincidencias |
| RDS no es pública y está cifrada | `aws rds describe-db-instances --db-instance-identifier vapeupar-dev-db` | ✅ `PubliclyAccessible: false`, `StorageEncrypted: true`, PostgreSQL 18.6 |
| La base solo acepta al bastión | Reglas del grupo `vapeupar-dev-rds` | ✅ Única regla: 5432 desde el grupo del bastión |
| El bastión no expone puertos | Reglas de entrada de su grupo de seguridad | ✅ Ninguna regla de entrada; IMDSv2 obligatorio |
| Túnel y conexión a PostgreSQL | `npm run infra:db-tunnel` + `select version()` con la `DATABASE_URL` generada | ✅ PostgreSQL 18.6, base `vapeupar`, conexión con SSL |
| El bucket bloquea acceso público | `aws s3api get-public-access-block` + lectura directa | ✅ Los 4 bloqueos activos; lectura directa a S3 → 403 |
| CloudFront sirve el bucket | Subida de un objeto de prueba y lectura por `CDN_DOMAIN` | ✅ 200 por CloudFront (objeto borrado después) |
| Cognito no admite registro público | `describe-user-pool` → `AllowAdminCreateUserOnly` | ✅ `true`, MFA opcional, plan Lite |
| Presupuesto filtrado por proyecto | `aws budgets describe-budget --budget-name vapeupar-dev-monthly` | ✅ 30 USD, filtro `Project$Vapeupar` + `Environment$dev` |
| Recursos etiquetados | Grupo de recursos `vapeupar-dev-resources` | ✅ 37 recursos |
| Sin drift entre código y AWS | `npm run infra:diff` | ✅ 0 stacks con diferencias |
| DeliPan intacto | Estado de su EC2 y su RDS | ✅ `running` / `available`, sin cambios |

### 7.1 Incidencias del primer despliegue

| Incidencia | Causa | Resolución |
|---|---|---|
| `Vapeupar-dev-Data` falló y su rollback también (`ROLLBACK_FAILED`) | El bastión `t4g.nano` no es elegible en el plan gratuito; al cancelar, CloudFormation intentó el snapshot final de RDS mientras la instancia aún se creaba | Bastión a `t4g.micro`; borrado del stack fallido, del snapshot final de la base vacía, y redespliegue |
| El túnel no conectaba con RDS | Un PostgreSQL local de Windows ya escuchaba en 5433: el túnel no pudo abrir el puerto y el cliente habló con la base local | Puerto por defecto 15432 y comprobación de puerto libre en `db-tunnel.mjs` antes de abrir la sesión |
| Comandos `aws ssm ... /vapeupar/...` fallan en Git Bash | Git Bash convierte las rutas que empiezan por `/` en rutas de Windows | `MSYS_NO_PATHCONV=1` en Git Bash; los scripts de `infra/` no se ven afectados porque no pasan por shell |

## 8. Transición a producción

`infra/lib/config.ts` ya define `prod` con las diferencias de la tabla 8.2. Lo
que falta no es código de infraestructura nuevo, sino estas decisiones y tareas.

### 8.1 Antes de desplegar nada en prod

1. **Identidad de despliegue propia.** Dejar de desplegar con `delipan_admin`.
   Opciones, de más a menos aislada:
   - **Cuenta separada para Vapeupar con AWS Organizations** (recomendado para
     prod). Aislamiento total de permisos, límites y facturación respecto a
     DeliPan; los créditos de la cuenta de gestión se comparten con las cuentas
     miembro por defecto. Convertir la cuenta actual en cuenta de gestión afecta
     también a DeliPan, así que es una decisión conjunta.
   - IAM Identity Center con un permission set limitado a los roles
     `cdk-vapeupar-*`.
   - Como mínimo, un usuario o rol IAM `vapeupar-deployer` con MFA, distinto de
     `delipan_admin`.
2. **CI/CD con OIDC.** Un rol `vapeupar-github-actions-deploy` (el mismo patrón
   que ya usa DeliPan) que solo pueda asumir los roles `cdk-vapeupar-*`. Sin
   claves de larga duración en GitHub.
3. **Dominio.** DNS (Route 53 u otro), certificados ACM (el de CloudFront debe
   estar en `us-east-1`), dominio propio para imágenes (p. ej.
   `img.<dominio>`) y para la API.
4. **Correo.** Verificar el dominio en SES (DKIM, SPF, DMARC), solicitar el
   acceso de producción de SES (sale del sandbox en ~24 h) y cambiar el User
   Pool a `UserPoolEmail.withSES`.

### 8.2 Diferencias dev → prod ya codificadas

| Ajuste | dev | prod |
|---|---|---|
| RDS Multi-AZ | No | Sí |
| Protección contra borrado de RDS | No | Sí |
| Retención de backups | 1 día | 7 días |
| Al destruir el stack | Snapshot (RDS), borrado (S3, Cognito) | Se conserva todo |
| Versionado del bucket | No | Sí |
| Clase de precio de CloudFront | 100 (sin Sudamérica) | All (incluye Sudamérica) |
| MFA en la consola | Opcional | Obligatorio |
| Orígenes de subida (CORS) | `http://localhost:3000` | **Vacío: completar con el dominio de la consola** |
| Presupuesto | 30 USD | 80 USD (revisar) |

### 8.3 Lo que falta construir

| Pieza | Propuesta | Nota |
|---|---|---|
| **Cómputo del backend** | ECS Fargate en esta VPC detrás de un Application Load Balancer | ~25 USD/mes (ALB ~16 + tarea 0.25 vCPU ~9). Tareas en subred pública con IP pública y grupo de seguridad que solo admite tráfico del ALB, para no pagar NAT. Lightsail Containers es más barato pero no encaja: solo hace peering con la VPC por defecto, no con la de Vapeupar |
| **Frontend** | Vercel, o Amplify Hosting si se quiere todo en AWS | Requisito: soportar Next.js 16 con SSR y `revalidateTag` on-demand (ADR-002 §7). Verificar el soporte de Amplify para la versión de Next en uso antes de elegirlo |
| **Rol de la aplicación en PostgreSQL** | `vapeupar_app` con permisos mínimos (plan A1.1) | El usuario maestro queda solo para migraciones |
| **Rotación de secretos** | Rotación automática del secreto maestro de RDS | Secrets Manager con la Lambda de rotación gestionada |
| **Observabilidad** | Alarmas de CloudWatch (CPU, almacenamiento libre y conexiones de RDS; 5xx del ALB), notificadas por SNS | Valorar VPC Flow Logs y un trail de CloudTrail si la cuenta no tiene uno |
| **Protección perimetral** | AWS WAF delante de CloudFront y del ALB | Reglas gestionadas básicas y rate limit; complementa el rate limit de Express |
| **Copias de seguridad** | Además de los backups de RDS, AWS Backup con copia a otra región si el negocio lo requiere | Decisión de negocio: cuánto dato se puede perder |

### 8.4 Habilitar prod en el código

1. Completar `config.prod.storage.uploadOrigins` y revisar el resto de
   `config.prod`.
2. Si prod va a otra cuenta, cambiar `config.prod.account` y hacer
   `cdk bootstrap` con el mismo qualifier en esa cuenta.
3. `npm run diff --workspace=infra -- -c env=prod`, revisar y desplegar.
4. Actualizar este documento: §7 con la verificación de prod y la cabecera con
   la fecha de despliegue.
