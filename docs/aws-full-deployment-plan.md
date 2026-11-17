# Plan de despliegue completo en AWS — EC2 + S3 + RDS

Plan de desarrollo para poner **todo el sistema** de Vapeupar —web pública,
consola `/admin` y API— corriendo en AWS, aprovisionado por completo con CDK,
sobre los recursos que ya existen.

Contexto y runbook del entorno actual: [`infrastructure-aws.md`](infrastructure-aws.md).
Decisión de origen: [ADR-002](decisions/002-consola-de-administracion-y-persistencia.md).

| | |
|---|---|
| Estado | ✅ **F1, F2 y F3 completadas** (2026-11-06). Tienda en **http://3.228.133.187** (`npm run app:deploy`). Siguiente: F4 (No-IP + TLS). Verificación en `infrastructure-aws.md` §7.0 y en F2/F3 |
| Escrito | 2026-11-06 |
| Revisado | 2026-11-06 — DeliPan detuvo su EC2 y liberó su IP elástica; el bastión se retira (§2.1, F1.7) |
| Cuenta / región | `342284838697` / `us-east-1` (compartida con DeliPan) |
| Reutiliza | RDS `vapeupar-dev-db`, bucket de catálogo + CloudFront, Cognito, VPC |
| Añade | 1 EC2, 1 bucket de artefactos, 1 zona DNS, alarmas |
| Retira | Bastión `vapeupar-dev-bastion` (la EC2 de la aplicación asume el túnel) |
| Coste incremental estimado | **~+1,5 USD/mes** sobre lo actual (§7) |

---

## 1. Lo que ya está y lo que falta

Desplegado y reutilizable tal cual (no se toca nada de esto salvo lo que diga
§2.2):

| Pieza | Recurso | Papel en este plan |
|---|---|---|
| Red | VPC `vapeupar-dev-vpc`, 2 subredes públicas + 2 aisladas, sin NAT | La EC2 va en una subred **pública**; así no hace falta NAT Gateway (~32 USD/mes) |
| Datos | RDS `vapeupar-dev-db` (PostgreSQL 18.6, privada, cifrada) | La misma base. El backend la alcanza por red interna, sin túnel ni bastión |
| Imágenes | Bucket privado + CloudFront con OAC | Igual que hoy: el backend firma `PUT` y pide invalidaciones |
| Identidad | Cognito `vapeupar-dev-admins` | Igual que hoy |
| Secretos y parámetros | `vapeupar/dev/*`, `/vapeupar/dev/*` | La instancia lee de aquí su configuración al arrancar (§4.3) |
| Acceso de mantenimiento | Bastión SSM | **Se retira** al final de F1: la EC2 de la aplicación está en la misma subred, ya alcanza la base y ya se gestiona por SSM, así que el túnel desde el portátil pasa por ella |

Lo que falta es exactamente lo que este plan construye: **cómputo** (la EC2 con
las dos aplicaciones), **entrega** (artefactos en S3 y despliegue por SSM),
**dominio y TLS**, y **vigilancia**.

## 2. Arquitectura propuesta

```
                        Internet
                           |
                 Route 53  |  vapeupar.com, www, api (si se separa)
                           v
   +-----------------------+--------------------------------------------+
   |  VPC vapeupar-dev-vpc  10.50.0.0/16  (sin NAT Gateway)             |
   |                                                                    |
   |  Subred pública                        Subred aislada              |
   |  +--------------------------------+    +------------------------+  |
   |  | EC2 vapeupar-dev-app  t4g.micro|    | RDS vapeupar-dev-db    |  |
   |  | IP elástica, IMDSv2, 20GB gp3  |    | PostgreSQL 18.6        |  |
   |  |                                |5432| privada, cifrada       |  |
   |  |  nginx :443/:80 (TLS)          |--->|                        |  |
   |  |   ├─ /api/*  -> :4000 backend  |    +------------------------+  |
   |  |   └─ /*      -> :3000 frontend |    Endpoint S3 de gateway      |
   |  |  systemd: vapeupar-backend     |                                |
   |  |           vapeupar-frontend    |                                |
   |  +--------------------------------+                                |
   +--------------------------------------------------------------------+

   S3 vapeupar-dev-catalog-<cuenta>   (privado) <-- OAC -- CloudFront (imágenes)
   S3 vapeupar-dev-artifacts-<cuenta> (privado) --> la instancia descarga releases
```

### 2.1 Decisiones de diseño, con su motivo

| Decisión | Motivo |
|---|---|
| **Una sola EC2 con las dos aplicaciones** | A este volumen, separar frontend y backend en dos instancias duplica el coste fijo sin ganar nada: el tráfico entre ellos pasa a ser `127.0.0.1`, que es lo más rápido y lo más barato que hay. Cuando haga falta escalar, lo que se separa primero es el frontend, que es el que recibe las visitas |
| **En subred pública, no privada** | Una instancia en subred privada necesitaría NAT Gateway (~32 USD/mes) para `npm`, SSM, Secrets Manager y Cognito. La superficie se cierra con el grupo de seguridad, no con la topología: solo 80 y 443 abiertos, sin SSH (se entra por SSM, igual que al bastión) |
| **`t4g.micro` (ARM, 1 GB)** | El plan gratuito solo admite tipos elegibles (`t3/t4g.micro`, `t3/t4g.small`…). `t4g.micro` son ~6 USD/mes y basta **si no se construye en la instancia** (§5). Si la memoria aprieta, `t4g.small` (2 GB, ~13 USD/mes) es el siguiente escalón sin cambiar nada más |
| **No se construye en la instancia** | `next build` en 1 GB es la primera cosa que va a fallar. Se construye fuera, se sube un paquete a S3 y la instancia solo descarga y reinicia. Gratis como efecto secundario: cada release queda versionada en S3, así que volver atrás es desplegar la anterior |
| **TLS en nginx con Let's Encrypt, no CloudFront delante** | CloudFront daría caché de borde y certificado gestionado, pero **no acepta certificados autofirmados en orígenes propios**: para cifrar el tramo borde→instancia haría falta de todas formas un certificado real en la EC2. Así que primero el certificado en nginx, que es el que sirve para las dos cosas, y CloudFront después si hay un motivo de latencia o de carga (§8). El CloudFront de las imágenes no se toca: ese sigue sirviendo el catálogo |
| **IP elástica** | Sin ella, la IP pública cambia en cada parada y el DNS queda apuntando al vacío. En una instancia con IP pública la elástica **no suma coste** mientras esté asociada: se paga una IPv4 pública en cualquier caso |
| **Secretos leídos al arrancar, nunca escritos en la imagen** | La unidad de systemd ejecuta antes el generador de `.env` (§4.3). En disco queda un archivo `0600` de root que se regenera en cada arranque; en la AMI y en los artefactos no hay ni una credencial |
| **Migraciones desde la instancia** | Es el único sitio con ruta de red a la base que no depende del portátil ni del túnel |
| **La aplicación hereda el túnel; el bastión se retira** | El bastión existía porque no había nada más en la VPC desde donde llegar a la base. Con la EC2 de la aplicación eso deja de ser cierto: misma subred pública, ya autorizada en el grupo de RDS, ya con agente SSM. El reenvío de puertos de Session Manager (`AWS-StartPortForwardingSessionToRemoteHost`) funciona igual desde ella. Mantener dos instancias para que una solo haga de puente son **~10,5 USD/mes** (instancia + disco + IPv4) por nada: es casi exactamente lo que cuesta la instancia nueva, así que retirarlo deja este plan prácticamente a coste cero. El precio: el acceso de mantenimiento pasa a depender de la instancia de la aplicación (§5) |

### 2.2 Cambios sobre lo que ya está desplegado

Tres, y los tres son de una línea en `infra/`:

1. **El grupo de seguridad de RDS** tiene que aceptar al de la aplicación. Hoy
   su única regla es 5432 desde el bastión.
2. **`storage.uploadOrigins`** tiene que incluir el dominio real de la consola,
   o el `PUT` de imágenes fallará en el navegador, no en el backend.
3. **`cdnPriceClassAll`**: dev está en `PRICE_CLASS_100`, que **excluye los
   edges de Sudamérica**. Si esto pasa a ser el entorno vivo para Colombia, hay
   que subirlo (ver la decisión D1 de §3).

## 3. Decisiones previas

> **Resueltas el 2026-11-06:**
> - **D1** → el entorno actual (`dev`) **es producción**, endurecido en su
>   sitio. Se conserva el nombre `dev`: renombrarlo reemplazaría todos los
>   recursos, base incluida. Detalle en el comentario de `CONFIGS.dev` en
>   `infra/lib/config.ts`.
> - **D2** → todavía no hay dominio. Se usa **temporalmente un nombre de
>   No-IP** apuntado a la IP elástica de F1; el dominio definitivo se cambia
>   después sin tocar la infraestructura (F4).
>   **Confirmada el 2026-11-16: se sigue con No-IP indefinidamente**, sin
>   dominio propio. Consecuencias aceptadas: renovación manual cada 30 días
>   (ver F4) y sin dominio para SES ni para la marca.
> - **D3** → se sigue desplegando con `delipan_admin`, por decisión expresa.
>   El riesgo descrito abajo se acepta tal cual; no se repite en el resto del
>   documento.

**D1 — ¿Entorno nuevo `prod` o el actual pasa a ser el entorno vivo?**
`config.ts` ya define `prod` (Multi-AZ, backups 7 días, protección de borrado,
`PRICE_CLASS_ALL`), pero desplegarlo significa **una segunda VPC, una segunda
RDS y una segunda base vacía**: ~+26 USD/mes y migrar los datos del catálogo.
*Recomendación*: que el entorno actual sea el vivo y se endurezca en su sitio
(`deletionProtection: true`, `backupRetentionDays: 7`, `cdnPriceClassAll: true`,
`removalPolicy: RETAIN`), y dejar `prod` para cuando haya ingresos que lo
justifiquen. Con 137 USD de crédito compartido con DeliPan (§7.1), duplicar la base de
datos es la decisión más cara que se puede tomar aquí.

**D2 — Dominio.** *(Resuelta: No-IP, ver arriba.)* ¿Está registrado `vapeupar.com` (que es lo que declaraba
`metadataBase` en `frontend/src/app/layout.tsx`) y en qué registrador? De la
respuesta depende si Route 53 es la zona autoritativa (0,50 USD/mes) o solo se
apuntan registros desde fuera. Sin dominio no hay certificado, y sin
certificado la consola `/admin` viajaría en claro: **esto bloquea la fase 4, no
las anteriores.**

**D3 — Identidad de despliegue.** Hoy se despliega con `delipan_admin`
(`infrastructure-aws.md` §8.1): CloudTrail atribuye a DeliPan todo lo que se
hace aquí, y esa credencial es administrador de la cuenta entera. Mínimo
aceptable antes de que esto sea público: un rol `vapeupar-deployer` con MFA.

## 4. Fases

Cada fase es desplegable y verificable por su cuenta. El orden no es negociable
en F1→F2→F3; F4 puede adelantarse si D2 ya está resuelto.

### F1 — Aprovisionamiento (CDK): cómputo, artefactos y permisos ✅

Nuevo `infra/lib/app-stack.ts`, compuesto en `bin/vapeupar.ts` después de
`DataStack` (necesita la VPC y el grupo de seguridad de la base).

1. **Grupo de seguridad `vapeupar-dev-app`**: entrada 80 y 443 desde
   `0.0.0.0/0` y `::/0`. **Ninguna regla de SSH.** Salida libre.
2. **Regla en RDS**: 5432 desde este grupo. Se añade pasando el `DatabaseInstance`
   por props desde `bin/`, igual que ya se pasa la VPC, para que la referencia
   entre stacks sea fuerte y nadie pueda borrar la base mientras la app la use.
3. **Instancia `vapeupar-dev-app`**: Amazon Linux 2023 ARM64, `t4g.micro`,
   subred pública, IMDSv2 obligatorio, raíz 20 GB gp3 cifrada, IP elástica.
   `user-data` idempotente: Node 22, nginx, certbot, 2 GB de swap
   (`/swapfile`, red de seguridad para los picos de memoria), carpetas
   `/opt/vapeupar/{releases,current}` y `/etc/vapeupar/`.
4. **Rol de instancia**, con exactamente estos permisos y ninguno más:
   - `AmazonSSMManagedInstanceCore` (acceso sin SSH y ejecución de comandos).
   - `ssm:GetParameter(s)` sobre `/vapeupar/dev/*`.
   - `secretsmanager:GetSecretValue` sobre los tres secretos del entorno
     (`rds-app`, `rds-master`, `cognito-backend-client`).
   - `s3:PutObject` **limitado a los prefijos del catálogo** (`marcas/`,
     `proveedores/`, `productos/`) del bucket de catálogo.
   - `cloudfront:CreateInvalidation` **solo** sobre la distribución del
     catálogo.
   - `cognito-idp:AdminCreateUser`, `AdminDisableUser` y
     `AdminUserGlobalSignOut` sobre el User Pool del entorno. `InitiateAuth`,
     `RespondToAuthChallenge` y `GlobalSignOut` son operaciones de cliente
     autenticadas por el propio token: **no llevan IAM** (verificado en
     `backend/src/services/auth.service.ts`).
   - `s3:GetObject` + `ListBucket` sobre el bucket de artefactos.
5. **Bucket `vapeupar-dev-artifacts-<cuenta>`**: privado, los cuatro bloqueos
   de acceso público, cifrado gestionado por S3 y **versionado con una clave
   estable**: cada release se sube a la misma clave y S3 guarda las
   anteriores como versiones. El ciclo de vida solo expira versiones
   **antiguas** (más de 30 días reemplazadas, conservando siempre las 5 más
   recientes), así que la release viva no caduca nunca. Con claves fechadas y
   caducidad por días, una release que llevara un mes sin cambiarse
   desaparecería justo cuando hubiera que reinstalarla en una instancia
   nueva.
6. **Parámetros SSM nuevos**: `APP_INSTANCE_ID`, `APP_PUBLIC_IP`,
   `ARTIFACTS_BUCKET`. Misma razón que el resto: los scripts no llevan ids a
   mano.
7. **Retirar el bastión, en un SEGUNDO despliegue** y solo después de la
   verificación de abajo. El orden importa: si se quita en el mismo
   despliegue que añade la instancia y la instancia falla, no queda ninguna
   vía a la base.
   - `infra/scripts/db-tunnel.mjs` pasa a leer un parámetro
     `TUNNEL_INSTANCE_ID` que publica el stack de la aplicación, en lugar de
     `BASTION_INSTANCE_ID`. Se renombra a propósito: el script deja de
     asumir que el destino es un bastión.
   - Se quitan de `DataStack` el `BastionHostLinux`, su regla en el grupo de
     RDS y el parámetro `BASTION_INSTANCE_ID`.
   - La lógica del script que «arranca el bastión si está detenido» se
     conserva: sigue siendo correcta para la instancia de la aplicación.
   - Actualizar `infrastructure-aws.md` §2, §5.2 y §5.4 (el bastión
     desaparece del diagrama y de los comandos de ahorro).
8. ⚠️ **NO APLICABLE MIENTRAS DURE EL PLAN GRATUITO.** Se ejecutó tal como
   se describe abajo y RDS lo rechazó: «exceeds the maximum available to free
   tier customers». CloudFormation deshizo el cambio sin tocar la base
   (snapshot previo `vapeupar-dev-db-antes-retencion-20261106` disponible).
   La retención se queda en 1 día; hasta pasar a plan de pago, la red de
   seguridad son **snapshots manuales** antes de cada migración o cambio con
   riesgo (F5). Procedimiento original, para cuando se pueda:

   **Retención de backups de 1 a 7 días, en su PROPIO despliegue.** El primer
   diff de F1 mostró que este cambio hace que CloudFormation marque la base
   como **reemplazo condicional**: un reemplazo crearía una base nueva y vacía
   y movería `DB_HOST` a ella. Suele aplicarse sobre la misma instancia, pero
   con los datos reales dentro no se apuesta:
   1. Snapshot manual (`aws rds create-db-snapshot`) y esperar a que esté
      `available`.
   2. Cambiar solo `backupRetentionDays` en `config.ts` y desplegar solo
      `Vapeupar-dev-Data`, con `DeletionPolicy: Retain` y la protección de
      borrado ya activas (pasos anteriores): aunque hubiera reemplazo, la base
      vieja no se borraría.
   3. Comprobar que el endpoint no ha cambiado.

**Notas de la implementación (2026-11-06)**

- **AMI fijada en `cdk.context.json`** (`cachedInContext`). El diff de
  referencia mostró que el bastión, que no la fijaba, iba a reemplazarse en el
  siguiente despliegue solo porque Amazon había publicado una AMI nueva. Al
  bastión se le fijó la que ya tenía hasta retirarlo (paso 7).
- **Créditos de CPU en modo estándar**, no ilimitado (el valor por defecto de
  las t4g): una CPU sostenida se ralentiza en vez de facturarse aparte.
- **Node 22.23.4** desde el binario oficial con su suma de verificación, no
  desde un repositorio de terceros.
- La regla de entrada a RDS se crea en el stack de la aplicación sobre el
  grupo exportado por `Vapeupar-dev-Data`, para que la dependencia vaya en un
  solo sentido.
- El correo de alertas no está en `~/.cdk.json` en esta máquina: se lee del
  presupuesto ya desplegado y se pasa como `VAPEUPAR_ALERT_EMAIL` solo al
  comando.

**Verificación**

```bash
npm run infra:diff                                  # revisar antes
npm run infra:deploy
aws ssm start-session --target <APP_INSTANCE_ID>     # entra sin SSH
aws ec2 describe-security-groups --filters Name=group-name,Values=vapeupar-dev-app
# Desde la instancia: la base se alcanza sin tunel
nc -zv <DB_HOST> 5432
# ANTES de retirar el bastión (paso 7): el túnel del portátil funciona
# pasando por la instancia de la aplicación
npm run infra:db-tunnel        # con TUNNEL_INSTANCE_ID = la app
psql "<DATABASE_URL local>" -c "select version()"
```

### F2 — Preparar las aplicaciones para producción ✅

Cambios en el repositorio, sin AWS de por medio. Son pocos y conocidos:

1. **`frontend/next.config.ts`**: `output: "standalone"`. El servidor
   resultante arranca con `node server.js` y lleva solo las dependencias que
   traza, lo que importa en 1 GB de RAM. Hay que recordar que el empaquetado
   **no copia** `.next/static` ni `public`: lo hace el script de release (F3).
2. **Variables del frontend** (se fijan en el build, no en el arranque):
   `NEXT_PUBLIC_API_URL=https://<dominio>/api` (lo usa el navegador en la
   consola), `API_URL=http://127.0.0.1:4000/api` (lo usa el render del
   servidor: por loopback, sin salir a internet ni pasar por nginx),
   `NEXT_PUBLIC_CDN_DOMAIN`, `NEXT_PUBLIC_WHATSAPP_NUMBER`,
   `NEXT_PUBLIC_STORE_PHONE`.
3. **Variables del backend**: las que ya genera `infra/scripts/write-backend-env.mjs`
   más `NODE_ENV=production`, `PORT=4000`, `FRONTEND_URL=https://<dominio>` (CORS)
   y **`TRUST_PROXY=1`** — sin esto, detrás de nginx `express-rate-limit` cuenta
   a todos los visitantes bajo la misma IP y el límite público de la API se
   dispara con una sola persona navegando (`backend/src/app.ts:34`).
4. **Dos unidades systemd**, `vapeupar-backend.service` y
   `vapeupar-frontend.service`: `Restart=always`, usuario sin privilegios
   (`vapeupar`), `EnvironmentFile=/etc/vapeupar/<app>.env`, y en el backend un
   `ExecStartPre` que regenera ese archivo desde SSM y Secrets Manager con el
   script del punto 3 adaptado a escribir en `/etc/vapeupar/` (hoy escribe en
   `backend/.env`). El frontend declara `After=vapeupar-backend.service`.
5. **nginx**: un `server` por el dominio, `/api/` a `127.0.0.1:4000` y `/` a
   `127.0.0.1:3000`, con `proxy_set_header X-Forwarded-For/Proto`,
   `client_max_body_size` acorde al límite de subida de imágenes, y
   `/_next/static/` con `expires 1y; immutable` (son nombres con hash).
6. **`robots.txt`**: `Disallow: /admin` y `/dev-ui`. La consola está protegida
   por Cognito, pero no tiene por qué estar indexada.

**Verificación**: `npm run build` en la raíz y arrancar los dos procesos en
local con las variables de producción apuntando a la base de dev por el túnel.
Probar la portada, un filtro del catálogo, el login de `/admin`, una subida de
imagen y su invalidación.

**Resultado de F2 (2026-11-06)** — lo que se hizo, y lo que cambió respecto
a lo escrito arriba:

| Pieza | Dónde | Nota |
|---|---|---|
| `output: "standalone"` | `frontend/next.config.ts` | En el monorepo deja `standalone/frontend/server.js` y `standalone/node_modules/` en la raíz. **34 MB**, sin enlaces simbólicos |
| API relativa en el navegador | `NEXT_PUBLIC_API_URL=/api` al compilar | **Cambio respecto al plan**: el paquete no lleva el origen dentro. Pasar de IP a No-IP o a dominio NO obliga a recompilar |
| Origen público, un solo valor | `config.app.publicOrigin` → SSM `PUBLIC_ORIGIN` | Sin valor, `http://<IP elástica>`. Alimenta `FRONTEND_URL` y `ADMIN_URL` del backend (CORS) |
| Backend solo en loopback | `HOST` en `backend/src/index.ts` | Nuevo. Sin la variable, como siempre (todas las interfaces) |
| Entorno del backend en la instancia | `infra/deploy/write-env.mjs` | Desde SSM y Secrets Manager con el rol de la EC2; `0600 root`; sin el usuario maestro; **`sslmode=verify-full`** con el bundle de CA de RDS |
| Unidades de systemd | `infra/deploy/systemd/` | `vapeupar-env` (oneshot que genera el entorno), `vapeupar-backend`, `vapeupar-frontend`. Usuario sin privilegios, `ProtectSystem=strict`, techo de heap por proceso; el frontend solo escribe en `/opt/vapeupar/releases` (caché de Next) |
| nginx | `infra/deploy/nginx/` | `nginx.conf` **completo**: el de AL2023 trae su propio `server` en el 80, que competiría con el nuestro. `X-Forwarded-For` se **sustituye** (no se añade), para que no se pueda falsear la IP ante el límite de peticiones |
| `robots.txt` | `frontend/src/app/robots.ts` | `Disallow: /admin, /dev-ui`; sin `sitemap` hasta tener el dominio definitivo |

Verificado **en la instancia** sin activar nada: `write-env.mjs` con los
permisos reales del rol, TLS de RDS con `Verify return code: 0 (ok)` validando
el nombre del host, `nginx -t` y `systemd-analyze verify` sin errores. Los
archivos de prueba con secretos se borraron de la instancia y del bucket.
Verificado **en local** en modo producción: backend escuchando solo en
`127.0.0.1`, `standalone` sirviendo la portada y `robots.txt`, y el render del
servidor llamando a `API_URL` en tiempo de ejecución (un proxy de registro vio
las dos peticiones de `page.tsx` al regenerarse la página). 142 tests del
backend en verde.

Hallazgos que **condicionan F3**:

1. **`sharp` llega con el binario de Windows.** En Linux ARM no falla: cae
   en silencio a la versión WebAssembly, que es más lenta y gasta más memoria.
   El empaquetado tiene que añadir `@img/sharp-linux-arm64@0.35.5` y
   `@img/sharp-libvips-linux-arm64@1.3.4` (las versiones que fija
   `sharp/package.json`) al `node_modules` del `standalone`, y puede quitar
   `sharp-win32-x64`. Lo demás nativo (swc, oxide, lightningcss) solo se usa
   al compilar.
2. **No hace falta `prisma generate` en la instancia.** El cliente se genera
   como TypeScript en `backend/src/generated/prisma` y `tsc` lo compila a
   `dist/`. Con el adaptador `pg` no hay motor binario.
3. **El primer despliegue sirve la portada con los productos de respaldo**
   hasta la primera regeneración (≤ 60 s y una visita), porque se compila sin
   API alcanzable. Es correcto y no requiere nada; solo conviene saberlo antes
   de alarmarse.
4. **La consola `/admin` no funcionará por HTTP plano**: las cookies de sesión
   llevan `secure` en producción (`session-cookies.ts:31`). Es lo correcto. La
   tienda pública sí funciona desde F3; la consola, desde F4 (TLS).
5. `REVALIDATE_SECRET` lo genera el script local pero nada en el código lo
   usa: no se lleva a producción.

### F3 — Entrega: artefacto en S3 y despliegue por SSM ✅

`infra/scripts/deploy-app.mjs`, en la misma línea que los scripts que ya hay:

1. `npm run build` (backend y frontend) en la máquina de quien despliega.
2. Empaqueta una release reproducible: `backend/dist` + `backend/package*.json`
   + `prisma/`, y `frontend/.next/standalone` + `.next/static` + `public`.
3. Sube la release a la clave estable `releases/app.tar.gz` del bucket de
   artefactos, con el `sha` de git en los metadatos del objeto (ver F1.5).
   Volver atrás = restaurar la versión anterior de esa clave.
4. `ssm send-command` a la instancia: descarga, desempaqueta en
   `/opt/vapeupar/releases/<id>` con estructura `backend/`, `web/`
   (el `standalone`) y `deploy/`, instala las dependencias de producción del
   backend **en la instancia** (todas son JavaScript puro; **sin**
   `prisma generate`, ver hallazgo 2 de F2), escribe
   `/etc/vapeupar/instance.env` (`VAPEUPAR_ENV`, `AWS_REGION`), instala las
   unidades y la configuración de nginx de `deploy/`, mueve el enlace
   `current` y reinicia las unidades. El backend no tiene lockfile propio (el
   del monorepo está en la raíz): validar en F3 la forma de instalar solo sus
   dependencias con las versiones fijadas.
5. Espera el `/health` del backend y una respuesta 200 de la portada. Si
   alguno falla, devuelve `current` a la release anterior y reinicia. **El
   despliegue que no se verifica no es un despliegue.**

*Ventana de caída*: reiniciar dos procesos en una sola instancia son unos
segundos de 502. Aceptable para esta tienda; si deja de serlo, el paso
siguiente es arrancar el proceso nuevo en otro puerto y cambiar el `upstream`
de nginx con un `reload`, no una segunda instancia.

*Después*: GitHub Actions con rol OIDC `vapeupar-github-actions-deploy` (el
patrón que ya usa DeliPan) ejecutando este mismo script. Sin claves de larga
duración en GitHub.

**Resultado de F3 (2026-11-06)**: `infra/scripts/deploy-app.mjs`
(`npm run app:deploy [-- <entorno>] [--skip-build]`) + `infra/deploy/activate.sh`.
Primera release `20261106-174951-662cfd6657e8-dirty`: paquete de 51 MB, 199 MB
desempaquetado, activación en 10 s.

- **Dependencias del backend**: se instalan en la máquina que despliega, aparte,
  con el lockfile del monorepo y sin `devDependencies` (135 MB en vez de 353 MB:
  sin CLI de prisma ni typescript). Son JavaScript puro; el script **aborta**
  si aparece un `.node` que no sea el sharp de Linux ARM o un enlace simbólico.
  Resuelve la duda de F2 sobre el lockfile del backend: no se instala nada en
  la instancia.
- **sharp**: el script quita el binario de la máquina que compila y mete los de
  `linux-arm64` con `npm pack`. Comprobado en `/proc/<pid>/maps` del frontend:
  carga `sharp-linux-arm64-0.35.5.node` y `libvips-cpp.so.8.18.7`.
- **Cambio en `page.tsx`**: con `/api` relativa y sin `API_URL`, el fetch del
  prerender **se colgaba** hasta que Next abortaba el build (60 s × 3). Ahora
  una URL no absoluta en el servidor va directa al respaldo.
- **activate.sh** descarga el `versionId` exacto, deja todo de root salvo
  `web/frontend/.next` (ISR), hace `nginx -t`, cambia `current` de forma
  atómica, verifica `/health`, la portada a través de nginx y `/api/products`,
  y si falla vuelve a la release anterior. Conserva 3 releases. **No pisa
  `vapeupar.conf` si lleva TLS de certbot** → en F4, decidir cómo versionar el
  sitio con TLS.
- Verificado desde fuera: portada 200 (`x-nextjs-cache: HIT`), `robots.txt`,
  `/api/products` con los productos reales, `/_next/static` desde nginx con
  `immutable`, `/health` no expuesto (404), `/_next/image` 200. En la
  instancia: servicios activos y habilitados, 3000/4000 solo en loopback,
  ~480 MB de RAM disponibles.
- Migraciones: siguen fuera del despliegue (`npm run db:migrate` por el túnel,
  **antes** de desplegar código que las necesite).

### F4 — Dominio, TLS y CORS (depende de D2)

**Primero con el nombre temporal de No-IP** (D2). Lo que cambia respecto al
dominio definitivo:

- **Sin Route 53**: el registro `A` se pone en el panel de No-IP, apuntando a
  `APP_PUBLIC_IP`. No hace falta su cliente de actualización dinámica: la IP
  elástica no cambia.
- **Los nombres gratuitos de No-IP caducan si no se confirman cada 30 días**
  (correo de aviso). Si caduca, el sitio deja de resolver y el certificado no
  se puede renovar. Es lo primero que revisar si un día «la página no carga».
  **Recordatorio fijo** (D2 confirmada, 2026-11-16):
  - No-IP manda el correo de confirmación unos 7 días antes de que venza el
    nombre; se confirma con el enlace del correo o desde el panel de No-IP
    (*Dynamic DNS → Hostnames → Confirm*). Sin confirmar, el nombre se borra
    y puede tomarlo otra persona.
  - El correo llega a la cuenta con la que se registró el nombre: que sea un
    buzón que alguien lea, y con un filtro que lo marque como importante.
  - Además, un evento en el calendario **cada 25 días** («Confirmar nombre
    No-IP de Vapeupar»), por si el correo cae en spam.
  - Comprobación rápida si se duda: `nslookup <nombre>` debe devolver
    `APP_PUBLIC_IP`.
- Sin `www`: un solo nombre.
- **Let's Encrypt** emite certificados para estos nombres. **Comprobado el
  2026-11-16**: los dominios base gratuitos de No-IP (`ddns.net`, `hopto.org`,
  `zapto.org`, `sytes.net`, `myftp.org`, `servebeer.com`, `serveftp.com`,
  `redirectme.net`, `no-ip.org`, `no-ip.biz`…) están en la sección privada
  de la *Public Suffix List* (bloque «No-IP.com»), así que el límite semanal
  de certificados se cuenta por nombre (`<nombre>.ddns.net`) y no se comparte
  con el resto de usuarios de No-IP. Si se elige otro dominio base, comprobarlo
  en https://publicsuffix.org/list/public_suffix_list.dat antes.
- **`metadataBase`** sale de `NEXT_PUBLIC_SITE_URL` (`frontend/src/lib/site-url.ts`),
  que vive en SSM con el resto de variables públicas. Al tener el nombre:
  ```bash
  MSYS_NO_PATHCONV=1 aws ssm put-parameter --overwrite --type String     --name /vapeupar/dev/web/NEXT_PUBLIC_SITE_URL --value https://<nombre>
  ```
  y redesplegar. Sin ella, `deploy-app.mjs` avisa y el OpenGraph apunta a
  `localhost`.
- Al pasar al dominio definitivo se repiten los pasos 2 a 6 con el nuevo
  nombre; la infraestructura no cambia.

#### F4 con `vapeupar.ddns.net` (2026-11-17)

**Hecho:** nombre `vapeupar.ddns.net` → IP elástica; `publicOrigin` y
`uploadOrigins` en `http://vapeupar.ddns.net`, desplegados (`Vapeupar-dev-Storage`
y `-App`), y `vapeupar-env` + backend reiniciados por SSM: el CORS acepta el
nombre. `NEXT_PUBLIC_SITE_URL` creado en SSM (entra con la próxima release).

**Cómo encaja certbot sin que activate.sh lo pise.** certbot solo **obtiene** el
certificado (`certonly --nginx --cert-name vapeupar`): no edita nginx. El repo
trae el sitio en dos variantes que comparten las rutas
(`infra/deploy/nginx/vapeupar-site.inc` → `/etc/nginx/vapeupar/site.inc`):

| Archivo | Cuándo lo instala `activate.sh` |
|---|---|
| `vapeupar.conf` | Mientras NO exista `/etc/letsencrypt/live/vapeupar/fullchain.pem` |
| `vapeupar-tls.conf` | En cuanto existe: 80 → 301 a https, 443 con el certificado |

La verificación de `activate.sh` pasa a hacerse por https cuando el sitio lleva
TLS (con `-k`: comprueba el reparto, no el certificado). Las dos variantes
pasaron `nginx -t` en la instancia el 2026-11-17 (en `/tmp`, con certificado
autofirmado). **Volver atrás** a una release anterior a este esquema reinstala
su `vapeupar.conf` de una pieza: el sitio sigue funcionando, pero solo por http.

**Orden de la puesta en marcha:**

1. **Certificado** (no cambia lo que se sirve; la release activa no sabe de TLS):
   por SSM, como root,
   ```bash
   dnf install -y certbot python3-certbot-nginx
   certbot certonly --nginx --cert-name vapeupar -d vapeupar.ddns.net      --non-interactive --agree-tos --register-unsafely-without-email      --deploy-hook "systemctl reload nginx"
   systemctl enable --now certbot-renew.timer
   certbot renew --dry-run
   ```
   Sin correo a propósito: Let's Encrypt ya no manda avisos de caducidad y la
   renovación es automática; el riesgo real es que caduque el nombre de No-IP.
2. **Orígenes a https**, justo antes del paso 3: `publicOrigin` y
   `uploadOrigins` en `infra/lib/config.ts`, `npx cdk deploy -c env=dev -e
   Vapeupar-dev-Storage Vapeupar-dev-App`, y
   `/vapeupar/dev/web/NEXT_PUBLIC_SITE_URL` = `https://vapeupar.ddns.net`.
3. **Release** (`dev` → `produccion`): `activate.sh` ve el certificado, instala
   la variante TLS, regenera el `.env` con el origen https y verifica por https.
4. **Comprobar**: `curl -I http://vapeupar.ddns.net` → 301; `https://` → 200;
   login de `/admin` con MFA (las cookies son `secure` en producción: **por http
   la consola no puede iniciar sesión**, por eso este paso es el que la desbloquea).
5. **HSTS** (comentado en `vapeupar-tls.conf`) tras unos días sin problemas.

Pasos (para el dominio definitivo, con las salvedades de arriba para No-IP):

1. Zona en Route 53 (o registros delegados desde el registrador actual).
2. `A`/`AAAA` del dominio y de `www` a la IP elástica.
3. `certbot --nginx` para el dominio y `www`; renovación por el temporizador
   que instala el propio paquete. Comprobar la renovación **en seco** el mismo
   día (`certbot renew --dry-run`), no dentro de 60 días.
4. Redirección 301 de `http` a `https` y `www` al dominio desnudo (uno de los
   dos, y el `metadataBase` del layout tiene que coincidir o el OpenGraph
   apunta a otro sitio).
5. HSTS en nginx una vez verificado que todo carga por `https`.
6. `config.storage.uploadOrigins = ['https://<dominio>']` y redespliegue del
   stack de almacenamiento. **Esta es la que se olvida**: sin ella la consola
   sube imágenes contra un bucket que rechaza el origen, y el error aparece en
   el navegador, no en los logs del backend.

### F5 — Base de datos y datos reales

Desde la instancia, que ya tiene ruta a RDS:

> **2026-11-16:** el punto 1 está automatizado: `activate.sh` ejecuta
> `infra/deploy/migrate.mjs` en cada despliegue, antes de activar la release.
> Ver `docs/infrastructure-aws.md` §5.2.1, «Migraciones».

1. `prisma migrate deploy` con `MIGRATE_DATABASE_URL` (usuario maestro).
2. `npm run db:sync-app-role` (aplica la contraseña del rol `vapeupar_app`).
3. Semilla o importación del catálogo real, según lo que haya en dev.
4. **Snapshot manual antes de cada migración** que no sea trivial: el backup
   automático de un día no es una red de seguridad suficiente para una
   migración que sale mal a las 10 de la noche.

### F6 — Vigilancia y copias

| Pieza | Qué |
|---|---|
| Alarmas de la instancia | `StatusCheckFailed` y CPU sostenida. La memoria y el disco **no se ven desde CloudWatch sin agente**: instalar el agente en `user-data` y alarmar sobre memoria usada y disco libre |
| Alarmas de RDS | CPU, almacenamiento libre y número de conexiones |
| Notificación | Tema SNS al mismo correo del presupuesto |
| Presupuesto | `vapeupar-dev-monthly` sube de 30 a 45 USD (§7) o deja de avisar de nada útil |
| Logs | `journald` con límite de tamaño; los de nginx rotados. Enviar a CloudWatch Logs solo lo que se vaya a leer: cada GB ingerido se paga |
| Copias | Backups de RDS a 7 días (D1) y versionado del bucket de catálogo activado |

### F7 — Endurecimiento posterior (no bloquea nada)

CloudFront delante de la aplicación reaprovechando el certificado de nginx como
certificado de origen; WAF con reglas gestionadas y límite de tasa delante de
CloudFront; rotación automática del secreto maestro de RDS; Multi-AZ; segunda
instancia detrás de un ALB cuando el tráfico lo pida.

## 5. Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| **1 GB de RAM** con dos procesos Node | No construir en la instancia (F3), `output: standalone`, 2 GB de swap, alarma de memoria. Salida de emergencia: `t4g.small`, que es un cambio de una línea |
| **Un solo nodo**: cae la instancia, cae todo | `Restart=always`, alarma de `StatusCheckFailed`, y la portada **tolera la API caída** (`frontend/src/app/page.tsx:28` cae en los productos de respaldo). Lo que no tolera es que caiga la instancia entera |
| **Crédito compartido con DeliPan** | §7. Decidir antes de enero de 2027 si la cuenta pasa a plan de pago; es una decisión conjunta |
| **El plan gratuito restringe tipos de instancia** | Ya mordió una vez: `t4g.nano` falló al desplegar el bastión (`infrastructure-aws.md` §7.1). Quedarse en los tipos elegibles |
| **Credencial de despliegue compartida** | D3 |
| **Certificado caducado** = sitio inaccesible | `certbot renew --dry-run` el primer día y alarma sobre la fecha de expiración |
| **Sin bastión, el mantenimiento depende de la instancia de la aplicación** | Si la instancia cae, cae también el túnel. Pero lo que casi siempre falla es la aplicación, no el agente SSM, y en ese caso la sesión sigue funcionando. En el peor caso, volver a poner el bastión es un despliegue de CDK de unos minutos: el código está en el historial de git |
| **La IP elástica se paga aunque la instancia esté detenida** | Desde 2024 AWS cobra toda IPv4 pública, asociada o no. Detener la instancia ahorra el cómputo (~6 USD/mes), no la IP (~3,7). Para ahorrar también la IP hay que **liberarla**, y entonces el DNS hay que volver a apuntarlo al arrancar. Es lo mismo que se hizo con la de DeliPan |

## 6. Lo que este plan NO hace

- No crea un entorno `prod` separado (D1).
- No mete contenedores ni ECS: el backend no tiene `Dockerfile` y a una
  instancia no le hace falta.
- No automatiza CI/CD en la primera pasada (F3 lo deja listo para añadirlo).
- No toca nada de DeliPan.

## 7. Coste

| Recurso | USD/mes | ¿Nuevo? |
|---|---|---|
| EC2 `t4g.micro` | ~6.1 | **Sí** |
| Disco raíz 20 GB gp3 | ~1.6 | **Sí** |
| IPv4 pública / IP elástica asociada | ~3.7 | **Sí** |
| Zona de Route 53 | ~0.5 | **Sí** (si D2 lo pone aquí) |
| Bucket de artefactos | ~0.1 | **Sí** |
| Certificado (Let's Encrypt) | 0 | — |
| RDS `db.t4g.micro` + 20 GB | ~14 | No, ya se paga |
| Bastión + disco + su IPv4 | **−10,5** | **Se retira** (F1.7) |
| Secretos, S3 de catálogo, CloudFront, Cognito | ~1 | No |
| **Incremento de este plan** | **~+1,5** | |
| **Total Vapeupar** | **~27,5** | (~26 hoy) |

### 7.1 Crédito de la cuenta, recalculado el 2026-11-06

Datos medidos, no estimados:

| | |
|---|---|
| Crédito el 2026-10-26 | 157,54 USD |
| Crédito el 2026-11-06 (`aws freetier get-account-plan-state`) | **137,34 USD** |
| Consumo real en esos 11 días | 20,20 USD → **~55 USD/mes** |
| Vencimiento del plan gratuito | **2027-03-12** |
| Estado de DeliPan hoy | EC2 `delipan-staging` **detenida**, IP elástica **liberada**, RDS `delipan-staging` **en marcha** |

Lo que DeliPan ha dejado de gastar: ~15 USD/mes de la `t3.small` y ~3,7 de su
IPv4. El ritmo de la cuenta baja de ~55 a **~36 USD/mes** (su disco EBS se
sigue cobrando; es poco).

| Escenario | USD/mes | El crédito llega a… |
|---|---|---|
| Hoy, sin este plan | ~36 | finales de febrero de 2027 |
| Este plan **con** bastión (versión anterior) | ~48 | **principios de febrero** de 2027 |
| Este plan **sin** bastión (esta revisión) | ~37,5 | finales de febrero de 2027 |
| Sin bastión **y** RDS de DeliPan detenida | ~23,5 | **más allá del 2027-03-12** |

Tres conclusiones:

1. **Retirar el bastión es lo que hace que este plan no adelante la fecha.**
   Con él, poner Vapeupar en internet costaba unas tres semanas de crédito;
   sin él, prácticamente nada.
2. **La siguiente palanca grande es la RDS de DeliPan** (~14 USD/mes). Con la
   EC2 detenida, nada la está usando. Dos avisos para quien decida:
   - Una RDS detenida **AWS la vuelve a arrancar sola a los 7 días**, así que
     detenerla una vez no basta: o se detiene cada semana, o se hace un
     snapshot y se borra la instancia (el snapshot cuesta céntimos y se
     restaura en minutos cuando DeliPan vuelva).
   - Es un recurso de DeliPan: la decisión es de su responsable, igual que lo
     fue detener su EC2. Desde este repositorio no se toca (§1 principio 4 de
     `infrastructure-aws.md`).
3. **Con esa segunda palanca, lo que limita deja de ser el crédito y pasa a ser
   la fecha**: el plan gratuito vence el 2027-03-12 sobre ~1 USD de saldo o
   sobre 40, da igual. La decisión de pasar a plan de pago antes de esa fecha
   sigue en pie en cualquier escenario; lo que cambia es que ya no corre prisa
   por el saldo.

Y una consecuencia operativa: con la aplicación en marcha, **detener la base
para ahorrar deja de ser una opción** (§5.4 del runbook), porque ahora hay algo
público que depende de ella. En los periodos muertos lo que se detiene es la
instancia de la aplicación — y aun así la IP se sigue pagando (§5).

## 8. Orden de trabajo sugerido

1. Cerrar **D1, D2, D3** (§3). D2 solo bloquea F4.
2. **F1** — stack de la aplicación. Verificable sin desplegar código: entrar por
   SSM, alcanzar la base y abrir el túnel a través de la instancia. **Después**,
   en un despliegue aparte, retirar el bastión (F1.7).
3. **F2** — preparar las aplicaciones. Todo probable en local.
4. **F3** — script de release y primer despliegue, accesible por IP.
5. **F4** — dominio, TLS y CORS. Aquí el sitio es público de verdad.
6. **F5** — datos reales y primera operación de la consola en producción.
7. **F6** — alarmas y copias antes de contarle a nadie que ya está.
8. Actualizar `infrastructure-aws.md` (§8.3 pasa a estar hecho) y este
   documento con las fechas y la verificación real.
