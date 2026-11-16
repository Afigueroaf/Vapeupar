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

> **`dev` es el entorno de producción desde el 2026-11-06** (decisión D1 de
> [`aws-full-deployment-plan.md`](aws-full-deployment-plan.md)): se conservó el
> nombre porque renombrarlo reemplazaría todos los recursos. Ese mismo día se
> añadió la EC2 de la aplicación y **se retiró el bastión**: el túnel desde el
> portátil pasa ahora por la instancia de la aplicación.

```
                Internet  (80/443)
                   |
   +---------------+-----------------------------------------------+
   |  VPC vapeupar-dev-vpc  10.50.0.0/16  (2 AZ, sin NAT Gateway)  |
   |                                                               |
   |  Subred pública                 Subred aislada (sin internet) |
   |  +-----------------------+      +--------------------------+  |
   |  | vapeupar-dev-app      | ---> | vapeupar-dev-db          |  |
   |  | t4g.micro, IP elástica|5432  | RDS PostgreSQL 18.6      |  |
   |  | solo 80/443, sin SSH  |      | db.t4g.micro, cifrada    |  |
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
| `Vapeupar-dev-Data` | RDS `vapeupar-dev-db` (protección de borrado, `RETAIN`), grupo de seguridad `vapeupar-dev-rds`, secretos `vapeupar/dev/rds-master` (maestro) y `vapeupar/dev/rds-app` (rol `vapeupar_app`) |
| `Vapeupar-dev-Storage` | Bucket `vapeupar-dev-catalog-342284838697`, distribución CloudFront con OAC |
| `Vapeupar-dev-Auth` | User Pool `vapeupar-dev-admins`, cliente `vapeupar-dev-backend`, secreto `vapeupar/dev/cognito-backend-client` |
| `Vapeupar-dev-Ops` | Presupuesto `vapeupar-dev-monthly` (30 USD), grupo de recursos `vapeupar-dev-resources` |
| `Vapeupar-dev-App` | EC2 `vapeupar-dev-app` (`t4g.micro`, Node 22, nginx, IP elástica), grupo `vapeupar-dev-app` (solo 80/443), rol `vapeupar-dev-app` con permisos mínimos, regla 5432 en el grupo de RDS, bucket `vapeupar-dev-artifacts-342284838697`. Detalle en [`aws-full-deployment-plan.md`](aws-full-deployment-plan.md) F1 |

### Parámetros publicados en SSM (`/vapeupar/dev/*`)

Los stacks publican aquí todo valor que otros necesitan. Los scripts y el backend
leen de aquí, nunca IDs copiados a mano: si un recurso se recrea, el parámetro
se actualiza solo.

| Parámetro | Contenido |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME` | Endpoint de RDS |
| `DB_SECRET_ARN` | ARN del secreto con usuario y contraseña maestros (solo migraciones) |
| `DB_APP_SECRET_ARN` | ARN del secreto del rol `vapeupar_app` (runtime del backend) |
| `TUNNEL_INSTANCE_ID` | Instancia destino del túnel (hoy, la de la aplicación). Sustituye a `BASTION_INSTANCE_ID`, retirado el 2026-11-06 |
| `APP_INSTANCE_ID`, `APP_PUBLIC_IP` | EC2 de la aplicación y su IP elástica |
| `ARTIFACTS_BUCKET` | Bucket de releases (F3 del plan de despliegue) |
| `S3_CATALOG_BUCKET`, `CDN_DOMAIN` | Bucket de imágenes y dominio de CloudFront |
| `CDN_DISTRIBUTION_ID` | Distribución a invalidar cuando se reemplaza una imagen |
| `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` | Pool y cliente del backend |
| `COGNITO_CLIENT_SECRET_ARN` | ARN del secreto del cliente confidencial |

### Subida de imágenes al bucket (URL prefirmada)

El bucket es privado y se lee **solo** por CloudFront con OAC. Escribir en él
tiene una única vía desde la consola:

1. La consola pide `POST /api/admin/uploads/presign` con `target`, `entityId`,
   `contentType` y `size`.
2. El backend comprueba que la entidad existe, **deriva la clave del objeto** y
   firma un `PutObject` de 5 minutos con `ContentType` y `ContentLength`
   incluidos en la firma.
3. El navegador sube el archivo con `PUT` a esa URL. No recibe credenciales de
   AWS en ningún momento.
4. La consola guarda la **clave** con el PATCH de la entidad. La URL pública se
   compone con `CDN_DOMAIN`; la base nunca guarda URLs.

Claves que genera el backend (`backend/src/catalog/image-keys.ts`), las mismas
que usa la semilla:

```txt
marcas/<marca-slug>/logo[-<versión>].<ext>
proveedores/<proveedor-id>/logo[-<versión>].<ext>
productos/<linea-slug>/linea[-<versión>].<ext>
productos/<linea-slug>/<variante-slug>[-<versión>].<ext>
```

La semilla escribe las claves sin versión; **cada subida desde la consola lleva
una** (milisegundos en base 36, p. ej. `mango-ice-m3k9x2ab.webp`), así que
reemplazar una imagen produce una URL nueva.

**CORS.** El `PUT` lo hace el navegador, así que el bucket lleva una regla CORS
con `allowedMethods: [PUT]` y `allowedOrigins: config.storage.uploadOrigins`
(`infra/lib/storage-stack.ts`). En dev es `http://localhost:3000`; en prod
`config.prod.storage.uploadOrigins` está **vacío** y sin el dominio de la
consola toda subida fallará en el navegador, no en el backend. Sin orígenes no
se crea la regla, que es lo correcto para un bucket que no se escribe desde web.

**Quién firma.** El backend firma con las credenciales de su propio proceso. En
local son las del AWS CLI (sesión que caduca: si la subida empieza a dar 503,
renovar la sesión del CLI y comprobar con `aws sts get-caller-identity`). En producción tiene que ser el
rol de la tarea del backend con `s3:PutObject` **limitado al prefijo del
catálogo**, nunca el usuario administrador compartido de la cuenta: quien pueda
llamar al presign puede escribir hasta donde alcance ese rol. El reparto de
permisos de la ruta está en `docs/security.md` §2.2.

**Verificación tras desplegar:**

```powershell
aws s3api head-bucket --bucket vapeupar-dev-catalog-342284838697
aws s3api get-bucket-cors --bucket vapeupar-dev-catalog-342284838697
# Subir una imagen desde la consola y después:
aws s3api head-object --bucket vapeupar-dev-catalog-342284838697 --key productos/<linea>/<variante>.webp
curl -I https://<CDN_DOMAIN>/productos/<linea>/<variante>.webp   # 200
```

> Un `403` de CloudFront en una clave que nunca se subió es lo esperado: S3
> responde `404` y la distribución lo presenta como `403` porque el bucket es
> privado. Antes de buscar el fallo en el frontend, comprobar que el objeto
> existe.

#### Reemplazar una imagen: invalidación del CDN

> **Histórico desde el 2026-11-07.** Las subidas de la consola generan ahora una
> clave versionada por carga (ver arriba), así que reemplazar una imagen es una
> URL nueva y la consola ya no invalida. La invalidación tampoco bastaba: el
> optimizador de imágenes de Next, entre CloudFront y el visitante, guarda cada
> URL 4 horas. Lo que sigue explica el comportamiento de la distribución, que no
> ha cambiado, y sigue valiendo para las claves sin versión de la semilla.

La clave se derivaba de la entidad, así que **cambiar la foto de algo que ya
tenía una no cambiaba la clave**, y la distribución usa la política gestionada
`Managed-CachingOptimized`: `DefaultTTL` de 86 400 s, con las cadenas de
consulta **fuera** de la clave de caché (un `?v=` no sirve de nada). Sin hacer
nada, reemplazar una imagen se veía hasta 24 h después:

```txt
objeto reemplazado en S3   -> 3612 bytes
GET por CloudFront         -> 3648 bytes, X-Cache: Hit    (la anterior)
```

Por eso la consola, **después de que el `PUT` termina bien**, llama a
`POST /api/admin/uploads/invalidate` con la clave, y el backend crea una
invalidación de esa ruta. Verificado el 2026-10-27 por el camino real:

```txt
PUT con una imagen distinta -> 200, S3 pasa a 3612 bytes
invalidación                -> I5DWHSR3CG3MYSYM3EGZ9QEPB6, Completed
GET por CloudFront          -> 3612 bytes, X-Cache: Miss   (la nueva)
```

Detalles que importan:

- Se invalida **una ruta concreta**, nunca un comodín. `/*` costaría lo mismo
  pero vaciaría la caché del catálogo entero y toda la carga volvería al
  origen. El servicio rechaza cualquier clave que no empiece por `marcas/`,
  `proveedores/` o `productos/`, y también `*` y `..`.
- Se invalida también al subir una clave **nueva**: CloudFront pudo cachear el
  `403` de cuando el objeto no existía.
- **Si la invalidación falla, la carga no se da por fallida**: la imagen ya
  está en el bucket. La consola lo dice y avisa de que hasta que caduque la
  caché se seguirá viendo la anterior.
- Coste: 1000 rutas gratis al mes y 0,005 USD por ruta después. Una
  invalidación por imagen subida; las 89 imágenes del catálogo entran de
  sobra en el tramo gratuito.
- El id de la distribución llega por `CDN_DISTRIBUTION_ID`, publicado en SSM
  por el stack de almacenamiento. Sin esa variable el endpoint responde `503`
  y la consola trata el aviso como tal, sin romper la subida.

**Permiso que hace falta.** En local la invalidación la firma la sesión del
AWS CLI. Cuando el backend se despliegue, su rol necesita, además de
`s3:PutObject` sobre el prefijo del catálogo, `cloudfront:CreateInvalidation`
sobre esta distribución **y nada más de CloudFront** (ver §8.1).

Para invalidar a mano, en Git Bash hace falta `MSYS_NO_PATHCONV=1`: sin eso
convierte la ruta en una de Windows y AWS responde `InvalidArgument`.

```bash
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation   --distribution-id E2NZNVPW0QI2LA --paths "/productos/<linea>/<variante>.webp"
```

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
| ~~**Bastión SSM en lugar de RDS pública**~~ (retirado el 2026-11-06: la EC2 de la aplicación hace de destino del túnel) | La base queda privada igual que en prod, sin SSH ni listas de IPs. Cuesta ~10 USD/mes y puede detenerse |
| ~~**Bastión `t4g.micro`, no `t4g.nano`**~~ (la restricción vale igual para la EC2 de la aplicación) | El plan gratuito de AWS solo admite tipos elegibles (`t3/t4g.micro`, `t3/t4g.small`, `t8i.micro/small`, `c7i-flex.large`, `m7i-flex.large`). `t4g.nano` falló al desplegar por eso. Al pasar a plan de pago se puede volver a `nano` |
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
| `npm run infra:db-tunnel` | Abre `localhost:15432` → RDS dev a través de `TUNNEL_INSTANCE_ID` (la EC2 de la aplicación). Comprueba que el puerto esté libre y arranca la instancia si está detenida. Ctrl+C cierra |
| `npm run infra:env-backend` | Escribe en `backend/.env` las variables de AWS (§5.3). No imprime valores |
| `npm run app:deploy` | Compila y despliega la aplicación en la EC2, con migraciones (§5.2.1). Lo normal es que lo lance GitHub Actions |
| `npm run app:rollback` | Lista las releases que siguen en la instancia; `-- dev <id>` reactiva una (§5.2.1, «Volver atrás») |

Para otro entorno: `npm run diff --workspace=infra -- -c env=prod` (solo cuando
prod esté habilitado, §8).

### 5.2.1 Flujo de despliegue a producción

La EC2 de `dev` **es** producción. Todo lo que llega a ella sigue este camino:

```
rama de trabajo ──PR──▶ main ──(CI en verde)──▶ git push origin main:produccion
                                                  │
                     GitHub Actions «Despliegue a producción»
                       1. verificar: el commit está en main + tests
                       2. aprobación manual (Environment `produccion`)
                       3. desplegar: build → S3 → SSM → activate.sh
                            migraciones → activar → verificar
                            (si la verificación falla, vuelve sola a la anterior)
```

| Pieza | Dónde |
|---|---|
| CI de PRs y de `main` (tipos, lint, tests, build) | `.github/workflows/ci.yml` |
| Despliegue al mover `produccion` | `.github/workflows/deploy-produccion.yml` → `npm run app:deploy` |
| Vuelta atrás manual | `.github/workflows/rollback-produccion.yml` → `npm run app:rollback` |
| Migraciones en la instancia | `infra/deploy/migrate.mjs`, llamado por `activate.sh` antes de activar |
| Rol de AWS de GitHub (OIDC) | `infra/lib/app-stack.ts`, `config.ci` |
| Actualizaciones de dependencias y actions | `.github/dependabot.yml` |

**Reglas del flujo**

- **`main` siempre desplegable.** Todo entra por PR y solo se fusiona con el CI
  en verde.
- **`produccion` es un puntero, no una rama de trabajo.** Solo avanza en
  *fast-forward* hasta un commit de `main`. El job `verificar` rechaza un
  commit que no esté en `main`; si `git push` se niega por no ser
  *fast-forward*, **no se fuerza**: hay que averiguar qué hay en `produccion`
  que no está en `main`.
- **Las migraciones son compatibles con el código anterior** (ver
  «Migraciones»). La vuelta atrás reactiva código, no deshace el esquema.
- **Infraestructura antes que aplicación.** Si un cambio toca `infra/lib`, se
  aplica con `npm run infra:deploy` antes de mover `produccion`.

#### Paso a paso

1. **Rama de trabajo.**
   ```bash
   git switch main && git pull
   git switch -c feat/lo-que-sea
   # cambios y commits
   git push -u origin feat/lo-que-sea
   ```
   Si cambia el modelo:
   `npm run db:migrate:create --workspace=backend -- --name <nombre>` (crea la
   migración sin aplicarla, `docs/backend.md`) y revisar el SQL. Ver
   «Migraciones».
2. **PR a `main`.** El CI corre solo. Si el PR toca `infra/`, revisar también
   `npm run infra:diff`. Fusionar con el CI en verde.
3. **Infraestructura, solo si cambió.**
   ```bash
   git switch main && git pull
   npm run infra:diff      # confirmar que es lo esperado
   npm run infra:deploy
   ```
4. **Antes de desplegar.** `main` en verde; hora de poco tráfico (los
   servicios se reinician: unos segundos sin servicio); anotar la release
   activa (último despliegue correcto en *Actions*, o `npm run app:rollback`
   sin argumentos). Si hay una migración con riesgo, **snapshot manual** de
   RDS antes (la retención automática es de 1 día, §6.1):
   ```bash
   aws rds create-db-snapshot --db-instance-identifier vapeupar-dev-db \
     --db-snapshot-identifier vapeupar-dev-antes-de-$(date +%Y%m%d-%H%M)
   ```
5. **Promover.**
   ```bash
   git switch main && git pull
   git push origin main:produccion
   ```
6. **Aprobar.** *Actions* → la ejecución de «Despliegue a producción» queda en
   *Waiting* tras `verificar` → **Review deployments** → `produccion` →
   **Approve and deploy**.
7. **Seguir el job.** En el log de `desplegar` aparecen el id de la release
   (`release <fecha>-<sha>`), las migraciones aplicadas (`[migrate]`) y la
   verificación (`[activate]`).
8. **Comprobar a mano** (2 minutos): tienda, catálogo, ficha, carrito y enlace
   de WhatsApp; entrar en la consola.
9. **Si algo va mal**, ver «Volver atrás».

Relanzar el mismo commit sin cambios: *Actions* → «Despliegue a producción» →
*Run workflow* sobre `produccion`.

Desde un portátil sigue funcionando `npm run app:deploy` (mismo script, con tus
credenciales). Es la salida de emergencia si GitHub Actions no está
disponible; lo normal es el flujo de arriba, que deja rastro y pasa por CI.

#### Migraciones

`activate.sh` ejecuta `infra/deploy/migrate.mjs` **después** de desempaquetar
la release y **antes** de cambiar `current`:

- Instala en la instancia el CLI de Prisma de la versión exacta del lockfile
  (`/opt/vapeupar/tools/prisma-<versión>`, una vez por versión: el motor de
  migraciones es un binario nativo y no viaja en la release).
- Se conecta con el usuario maestro (`vapeupar/dev/rds-master`, que solo puede
  leer el rol de la instancia) y TLS verificado contra la CA de RDS
  (`sslaccept=strict`, el equivalente de `verify-full`).
- `prisma migrate deploy` aplica solo las pendientes; sin pendientes, no hace
  nada.
- **Si una migración falla, no se activa nada**: la release anterior sigue
  sirviendo. Hay que corregir y volver a desplegar; si la migración quedó a
  medias, se marca con `npx prisma migrate resolve` desde `backend/` con el
  túnel abierto (§5.3) antes de reintentar.

**Expandir y contraer.** Como la vuelta atrás (automática o manual) no deshace
el esquema, el código **anterior** tiene que seguir funcionando con el esquema
**nuevo**:

| Se quiere | Despliegue 1 (expandir) | Despliegue 2 (contraer), cuando ya no se vuelva atrás |
|---|---|---|
| Columna nueva | Añadirla opcional o con valor por defecto | Hacerla obligatoria si hace falta |
| Renombrar columna | Añadir la nueva, escribir en las dos, copiar datos | Leer solo la nueva y borrar la vieja |
| Borrar columna o tabla | Dejar de usarla en el código | Borrarla |
| Tabla nueva | Crearla **con sus `GRANT` para `vapeupar_app`** (no hay privilegios por defecto) | — |

`db:sync-app-role` no forma parte del despliegue: solo hace falta al crear la
base o al rotar la contraseña del rol (`docs/backend.md`).

#### Volver atrás

| Situación | Qué pasa / qué hacer |
|---|---|
| Falla una migración | No se activa nada; sigue la release anterior. Corregir y desplegar de nuevo |
| Falla la verificación de `activate.sh` | Vuelve sola a la release anterior; el job queda en rojo |
| El despliegue pasó pero hay un error funcional | *Actions* → «Vuelta atrás en producción» → *Run workflow* sobre `produccion` |

La vuelta atrás reactiva una de las **3 últimas releases**, que siguen en la
instancia (`/opt/vapeupar/releases`). No compila, no sube nada y **no migra**.

1. *Run workflow* con `release` vacío: el log lista las disponibles y cuál está
   activa (o, desde un portátil, `npm run app:rollback`).
2. Aprobar en el Environment.
3. *Run workflow* otra vez con el id (`20261116-153000-0123456789ab`), o
   `npm run app:rollback -- dev <id>`.
4. Arreglar con un PR normal y desplegar. **No** se mueve `produccion` hacia
   atrás: el siguiente despliegue tiene que ser una corrección hacia delante.

Más atrás de 3 releases: el bucket de artefactos conserva las 5 versiones
anteriores de `releases/app.tar.gz`. Buscar el `VersionId` (metadato
`release`) con `aws s3api list-object-versions --bucket <ARTIFACTS_BUCKET>
--prefix releases/app.tar.gz` y relanzar `activate.sh` con ese `VersionId`
(como hace `runActivate` en `infra/scripts/aws.mjs`). Esa vía **sí** migra, y
solo hacia delante: con migraciones expand/contract no hay nada que aplicar.

Volver atrás el esquema de la base no está automatizado: es restaurar el
snapshot del paso 4 en una instancia nueva. Por eso las migraciones son
compatibles hacia atrás y los cambios con riesgo llevan snapshot.

#### Credenciales

No hay claves de AWS en GitHub. Los jobs que corren en el Environment
`produccion` asumen por OIDC el rol `vapeupar-dev-github-deploy`
(`infra/lib/app-stack.ts`, `config.ci`), que:

- solo confía en `repo:Afigueroaf/Vapeupar:environment:produccion`. Un job
  entra en ese Environment solo si cumple sus reglas (rama `produccion` y
  aprobación), así que ni PRs, ni otras ramas, ni forks pueden asumirlo;
- solo puede leer los parámetros que usa el despliegue, subir
  `releases/app.tar.gz` al bucket de artefactos y lanzar `AWS-RunShellScript`
  en la instancia de la aplicación. **No** lee secretos ni toca la base: las
  migraciones corren en la instancia, con el rol de la instancia.

El proveedor OIDC de GitHub es uno por cuenta y **ya existía (DeliPan)**: el
stack lo importa, no lo crea ni lo borra.

Las actions de los workflows van **fijadas por SHA** con la versión en un
comentario. Dependabot abre PRs semanales que actualizan SHA y comentario a la
vez, y también las dependencias de npm (menores y parches agrupados).

#### Configuración de GitHub (una vez)

En *Settings* del repositorio:

1. **Environments → New environment → `produccion`**
   - *Required reviewers*: tu usuario. Con un solo mantenedor, dejar
     **desmarcado** *Prevent self-review*; si no, nadie podría aprobar.
   - *Deployment branches and tags* → *Selected branches and tags* →
     `produccion`.
2. **Rules → Rulesets → New branch ruleset** para `main`:
   *Require a pull request before merging* (0 aprobaciones si trabajas solo),
   *Require status checks to pass* → `checks` (el job de `ci.yml`; aparece
   después de su primera ejecución), *Block force pushes*, *Restrict
   deletions*.
3. **Otro ruleset** para `produccion`: *Block force pushes* y *Restrict
   deletions*. Sin exigir PR: se mueve con `git push origin main:produccion`.
4. **Code security → Dependabot**: activar *Dependabot version updates* (lee
   `.github/dependabot.yml`) y las alertas de seguridad.

**Orden de la puesta en marcha.** El rol pasó de confiar en la rama a confiar
en el Environment; hasta que estén las dos piezas, el despliegue falla al
asumir el rol:

1. Fusionar los workflows en `main` (PR).
2. Crear el Environment `produccion` (paso 1 de arriba).
3. `npm run infra:diff` (debe cambiar solo la política de confianza y la
   descripción de `vapeupar-dev-github-deploy`) y `npm run infra:deploy`.
4. Primer despliegue: `git push origin main:produccion`. Si es la primera vez
   que se migra desde la instancia, revisar en el log que `[migrate]` instala
   Prisma y termina en «migraciones al día».

#### Variables públicas del frontend

WhatsApp, teléfono, nombre y ciudad de la tienda. Viven en SSM, en
`/vapeupar/dev/web/NEXT_PUBLIC_*`, fuera del repositorio porque son datos de
contacto. `deploy-app.mjs` las lee en todos los builds, el de GitHub y el
local, y ganan a `frontend/.env.local`. Sin `NEXT_PUBLIC_WHATSAPP_NUMBER` el
despliegue en CI falla, porque el carrito no podría enviar pedidos. Para
cambiar una (en Git Bash, con `MSYS_NO_PATHCONV=1`):

```bash
aws ssm put-parameter --overwrite --type String \
  --name /vapeupar/dev/web/NEXT_PUBLIC_WHATSAPP_NUMBER --value 57XXXXXXXXXX
```

Se aplica en el siguiente despliegue.

#### Lo que sigue siendo manual

- Cambios de infraestructura (`npm run infra:diff` + `npm run infra:deploy`),
  **antes** de mover `produccion`.
- Snapshot de RDS antes de migraciones con riesgo.
- Volver atrás el esquema (restaurar un snapshot).
- Los despliegues reinician los servicios: unos segundos sin servicio. Un
  *blue/green* en la misma instancia (dos puertos y `nginx reload`) lo evitaría;
  no compensa mientras el tráfico sea bajo.

### 5.3 Conectar el backend local a la base de dev

```bash
npm run infra:env-backend     # una vez, o cuando se recree algún recurso
npm run infra:db-tunnel       # en una terminal aparte; dejarla abierta
npm run dev:backend
```

Primera vez con una base nueva (migraciones, rol de aplicación y semilla):
ver `docs/backend.md` § Base de Datos.

`infra:env-backend` conserva las variables que ya hubiera en `backend/.env`
(`PORT`, `NODE_ENV`, `FRONTEND_URL`) y reescribe un bloque marcado con:
`AWS_REGION`, `DATABASE_URL` (rol `vapeupar_app`), `MIGRATE_DATABASE_URL` (maestro, solo migraciones), `S3_CATALOG_BUCKET`, `CDN_DOMAIN`,
`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET` y
`REVALIDATE_SECRET` (este último se genera una vez y se conserva).

### 5.4 Ahorrar cuando no se usa

> **Desde el 2026-11-06 hay algo público que depende de la base y de la
> instancia**: detenerlas deja la tienda fuera de línea. Solo tiene sentido
> en periodos sin visitas.

```bash
# En Git Bash, anteponer MSYS_NO_PATHCONV=1: si no, convierte /vapeupar/... en una ruta de Windows.
# Aplicación (ahorra ~6 USD/mes de cómputo; el túnel la vuelve a arrancar sola).
# La IP elástica se SIGUE PAGANDO (~3,7 USD/mes) con la instancia detenida.
aws ec2 stop-instances --instance-ids $(aws ssm get-parameter --name /vapeupar/dev/APP_INSTANCE_ID --query Parameter.Value --output text)

# Base de datos (ahorra ~12 USD/mes; AWS la vuelve a arrancar sola a los 7 días)
aws rds stop-db-instance --db-instance-identifier vapeupar-dev-db
aws rds start-db-instance --db-instance-identifier vapeupar-dev-db
```

Detenidos, se sigue pagando el almacenamiento (unos 3 USD/mes) y la IPv4.

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
| EC2 de la aplicación `t4g.micro` + disco 20 GB | ~7.7 |
| IP elástica de la aplicación | ~3.7 |
| ~~Bastión + su IPv4~~ (retirado el 2026-11-06) | ~~10.5~~ |
| Secrets Manager (2 secretos) | ~0.8 |
| CloudWatch Logs (logs de PostgreSQL, 1 semana) | <1 |
| S3, CloudFront, Cognito Lite, SSM, Lambdas de CDK | ~0 a este volumen |
| **Total** | **~27.5** (antes ~26, con bastión y sin aplicación) |

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

### 7.0 Verificación de F1: aplicación y retirada del bastión (2026-11-06)

| Comprobación | Cómo | Resultado |
|---|---|---|
| Sin drift tras F1 | `npx cdk diff --all` | ✅ 0 stacks con diferencias (6 stacks) |
| La instancia arranca y se prepara | `/var/log/vapeupar-bootstrap.log` por SSM | ✅ En ~3,5 min: Node v22.23.4 (suma `OK`), nginx activo, 2 GB de swap, usuario `vapeupar` |
| Puerto 80 desde internet | `curl http://3.228.133.187/` | ✅ 200, página provisional |
| Sin SSH | Conexión al 22 | ✅ Cerrado; acceso solo por SSM |
| La instancia alcanza RDS | TCP 5432 desde la instancia | ✅ Alcanzable sin túnel |
| El rol está acotado | `secretsmanager:ListSecrets` desde la instancia | ✅ `AccessDenied` (prueba negativa a propósito); sí lee su secreto y su parámetro |
| Túnel por la aplicación | `infra:db-tunnel` + consulta con el rol `vapeupar_app` | ✅ PostgreSQL 18.6, 10 tablas, sesión con destino `i-088565796e4d9f101` |
| La base solo acepta a la aplicación | Reglas del grupo de RDS tras retirar el bastión | ✅ Única regla: 5432 desde `vapeupar-dev-app` |
| Base intacta | Endpoint y fecha de creación | ✅ Mismo endpoint, creada el 2026-10-27, protección de borrado activa |
| Endurecimiento D1 | CloudFront y Cognito | ✅ `PriceClass_All`; protección de borrado del pool `ACTIVE` |

### 7.1 Incidencias del primer despliegue

| Incidencia | Causa | Resolución |
|---|---|---|
| `Vapeupar-dev-Data` falló y su rollback también (`ROLLBACK_FAILED`) | El bastión `t4g.nano` no es elegible en el plan gratuito; al cancelar, CloudFormation intentó el snapshot final de RDS mientras la instancia aún se creaba | Bastión a `t4g.micro`; borrado del stack fallido, del snapshot final de la base vacía, y redespliegue |
| El túnel no conectaba con RDS | Un PostgreSQL local de Windows ya escuchaba en 5433: el túnel no pudo abrir el puerto y el cliente habló con la base local | Puerto por defecto 15432 y comprobación de puerto libre en `db-tunnel.mjs` antes de abrir la sesión |
| Subir la retención de backups de RDS de 1 a 7 días falló (2026-11-06) | El plan gratuito de AWS no admite más de la retención actual: «exceeds the maximum available to free tier customers». CloudFormation deshizo el cambio sin tocar la base | Se queda en 1 día; la red de seguridad son snapshots manuales antes de cada cambio con riesgo. Subirla va con el paso a plan de pago |
| `aws ssm get-command-invocation` revienta al imprimir en la consola de Windows (`'charmap' codec can't encode`) | La consola no está en UTF-8 y la salida remota trae caracteres como `→` | `export PYTHONIOENCODING=utf-8` antes del comando. El comando remoto sí se ejecuta; solo falla la impresión |
| Comandos `aws ssm ... /vapeupar/...` fallan en Git Bash | Git Bash convierte las rutas que empiezan por `/` en rutas de Windows | `MSYS_NO_PATHCONV=1` en Git Bash; los scripts de `infra/` no se ven afectados porque no pasan por shell |

## 8. Transición a producción

`infra/lib/config.ts` ya define `prod` con las diferencias de la tabla 8.2. Lo
que falta no es código de infraestructura nuevo, sino estas decisiones y tareas.

> **Plan de ejecución de las piezas que faltan (§8.3):**
> [`aws-full-deployment-plan.md`](aws-full-deployment-plan.md) — todo el sistema
> sobre EC2 + S3 + RDS, reutilizando la base, el bucket y Cognito de este
> entorno. Incluye las tres decisiones previas (entorno vivo, dominio, identidad
> de despliegue) y el coste incremental.

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
5. **Rol del backend.** Hoy el backend corre en local y firma con la sesión del
   AWS CLI. Su rol en prod necesita exactamente dos permisos sobre el
   catálogo, y ninguno más: `s3:PutObject` limitado al prefijo del catálogo y
   `cloudfront:CreateInvalidation` sobre la distribución del catálogo. Nunca el
   administrador compartido de la cuenta: quien pueda llamar al presign escribe
   donde ese rol alcance.

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
