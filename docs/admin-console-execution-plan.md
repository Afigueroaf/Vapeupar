# Plan de Ejecución — Consola de Administración (Fases A0 a A8)

Implementación de [ADR-002](decisions/002-consola-de-administracion-y-persistencia.md):
persistencia real, modelo de inventario con libro de movimientos, consola de
administración de stock / marcas aliadas / proveedores, y contenido del sitio
alimentado desde esa consola.

Este plan es independiente del plan visual (`docs/design-execution-plan.md`,
fases V0–V8) y puede ejecutarse en paralelo, con una sola intersección: la
fase A6 toca `product-card.tsx` y `product-catalog.tsx`, que son territorio de
V4 y V5.

---

## Resumen de fases

| Fase | Objetivo | Archivos | Estado |
|---|---|---|---|
| **A0** | Decisiones y entorno AWS dev | `infra/`, `docs/infrastructure-aws.md` | 🟡 **En curso**: entorno dev desplegado, 3 decisiones de producto abiertas |
| **A1** | Esquema Prisma + migración + semilla desde `assets/` | `backend/prisma/`, `backend/src/db/` | ✅ **Ejecutada** (2026-10-26) |
| **A2** | Desacoplar `ProductService` y reescribir sus tests | `backend/src/services/`, `*.test.ts` | ⬜ Pendiente |
| **A3** | Dominio de inventario: movimientos, idempotencia, auditoría | `backend/src/services/stock.service.ts` | ⬜ Pendiente |
| **A4** | Autenticación y superficie `/api/admin/*` | `backend/src/routes/admin/`, `backend/src/middleware/` | ⬜ Pendiente |
| **A5** | Consola `/admin` en Next | `frontend/src/app/(admin)/` | ⬜ Pendiente |
| **A6** | Catálogo público con variantes | `product-card.tsx`, `product-catalog.tsx`, tipos | ⬜ Pendiente |
| **A7** | `SiteContent` + revalidación + barrido de textos | `faq.tsx`, `layout.tsx`, `trust-band.tsx` | ⬜ Pendiente |
| **A8** | Imágenes en S3 + CloudFront | `next.config.ts`, `storage.service.ts` | ⬜ Pendiente (bucket y CDN ya desplegados) |

Orden recomendado de valor entregado: A1 → A2 → A3 → A4 → **A5.1 (pantalla de
stock)** → A8 → A5.2–A5.4 → A6 → A7. Con A5.1 y A8 ya se administra el inventario
real; A6 y A7 son lo que hace visible ese dato en el sitio público.

---

## Fase A0 — Decisiones abiertas y entorno

Ninguna línea de código antes de cerrar esto, porque cada punto cambia el esquema
o el despliegue.

### A0.1 — Decisiones que requieren al dueño del producto

**Cerradas (2026-10-26)**

| # | Decisión | Resultado | Consecuencia en el plan |
|---|---|---|---|
| 1 | Proveedor de datos, storage, auth y cómputo | **AWS**: RDS PostgreSQL, S3 + CloudFront, Cognito, todo por CDK en `infra/` (sustituye a Supabase, ver ADR-002) | Una sola cuenta para A1, A4 y A8, compartida con DeliPan; el backend también se alojará ahí |
| 2 | Precio: ¿por línea o por variante? | **Por línea** (`Product.precio`, con `precioAnterior` opcional para ofertas) | `Variant` no lleva precio; la consola edita el precio una vez por línea (A5.3) |
| 3 | Taxonomía de categorías | **Se mantienen las 6 actuales** (`disposables`, `pod-systems`, `mods-tanks`, `salt-nic`, `freebase-liquids`, `coils-accessories`) | `Product.categoria` es un enum de Prisma con esos 6 valores; los identificadores del contrato de API no cambian y A2.3 solo consolida las etiquetas, no la taxonomía |

**Abiertas**

| # | Decisión | Opciones | Impacto si se elige mal |
|---|---|---|---|
| 4 | ¿Qué líneas LifePod se publican ya? | `eco-3`, `eco.pro`, `ONE`, `fit` | `fit/` solo tiene imagen de línea y ninguna variante: o se publica sin variantes o queda en `borrador` |
| 5 | Umbral de «bajo stock» | Global (ej. 5 unidades) vs por variante | Define la alerta de la pantalla de stock (A5.1) |
| 6 | Usuarios de la consola | Solo `owner` hoy; ¿habrá `operador`? | El rol se modela desde A1 en cualquier caso, pero define si A4 necesita pantalla de invitación |

### A0.2 — Entorno AWS dev ✅

Desplegado el 2026-10-26 con CDK desde `infra/`. Inventario, operación diaria,
separación frente a DeliPan y costos: **`docs/infrastructure-aws.md`**.

| Stack | Contenido |
|---|---|
| `Vapeupar-dev-Network` | VPC `10.50.0.0/16`, 2 AZ, subredes públicas y aisladas, sin NAT, endpoint S3 |
| `Vapeupar-dev-Data` | RDS PostgreSQL 18.6 `db.t4g.micro` privada + bastión SSM `t4g.nano` |
| `Vapeupar-dev-Storage` | Bucket S3 privado + CloudFront con OAC |
| `Vapeupar-dev-Auth` | User Pool de Cognito sin registro público + cliente confidencial del backend |
| `Vapeupar-dev-Ops` | Presupuesto de 30 USD/mes filtrado por etiqueta + grupo de recursos |

### A0.3 — Variables de entorno

`npm run infra:env-backend` escribe en `backend/.env` (ignorado por git) todo lo
que el backend necesita, leído de SSM y Secrets Manager:

```
AWS_REGION=                   # us-east-1
DATABASE_URL=                 # rol vapeupar_app, localhost:15432 (vía túnel), sslmode=no-verify
MIGRATE_DATABASE_URL=         # usuario maestro: solo migraciones y db:sync-app-role
S3_CATALOG_BUCKET=            # vapeupar-dev-catalog-<cuenta>
CDN_DOMAIN=                   # dxxxx.cloudfront.net
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_CLIENT_SECRET=        # Del cliente confidencial; solo backend
REVALIDATE_SECRET=            # Generado una vez; compartido con el frontend (A7)
```

Las URLs apuntan a `localhost:15432` porque la base solo es alcanzable con el
túnel abierto (`npm run infra:db-tunnel`). Por el túnel el certificado de RDS no
coincide con `localhost`, así que se cifra sin verificar el certificado
(`sslmode=no-verify`); el tramo portátil–bastión ya va cifrado y autenticado por
Session Manager. En prod, dentro de la VPC, debe usarse `verify-full` con el
bundle de CA de RDS (`docs/infrastructure-aws.md` §8). `backend/.env.example`
documenta estas claves sin valores.

En el frontend solo se añadirá `REVALIDATE_SECRET` (mismo valor), junto a
`NEXT_PUBLIC_API_URL`, que ya existe. **Ninguna credencial de AWS en el frontend**
(ADR-002, invariante 1).

**Verificación A0**: las seis decisiones están respondidas por escrito en este
documento; `npm run infra:diff` no muestra cambios pendientes; con el túnel
abierto, `psql "$DATABASE_URL" -c 'select version()'` responde PostgreSQL 18.

---

## Fase A1 — Esquema Prisma, migración y semilla

### A1.1 — Instalar y declarar el esquema

- `prisma` + `@prisma/client` como dependencias de **`backend/` únicamente**.
- `backend/prisma/schema.prisma` con las entidades de ADR-002 §3. En Prisma 7 la
  URL no va en el esquema: el CLI la toma de `prisma.config.ts`
  (`MIGRATE_DATABASE_URL`) y el runtime de `DATABASE_URL`. RDS no usa pooler.
- Las migraciones se ejecutan desde el portátil con el túnel abierto. En
  producción, desde el pipeline de despliegue dentro de la VPC, nunca abriendo la
  base a internet.
- La aplicación no debería conectar con el usuario maestro `vapeupar_admin`.
  La primera migración crea un rol `vapeupar_app` con permisos solo sobre el
  esquema de la aplicación; el maestro queda para migraciones y mantenimiento.
- `User.id` es el `sub` de Cognito (UUID). No hay clave foránea posible hacia
  Cognito; la coherencia la garantiza el flujo de invitación de A4.
- Índices obligatorios: `Variant(productId)`, `StockMovement(variantId, createdAt)`,
  `StockMovement(operationKey)` único, `Product(slug)` único, `Brand(slug)` único,
  `SiteContent(clave, version)`.
- `Product.estado` y `Variant.activa` con valores por defecto conservadores
  (`borrador`, `true`).

### A1.2 — Capa de repositorio → se reparte entre las fases que la consumen

Los servicios dependen de interfaces de repositorio, no de Prisma: es lo que
hace posible probarlos con fixtures en memoria. Pero cada interfaz se diseña
junto al servicio que la usa, no por adelantado, para no fijar firmas que
todavía nadie necesita:

| Repositorio | Fase |
|---|---|
| `product.repository.ts` | A2 (lo consume `ProductService`) |
| `stock.repository.ts` | A3 |
| `brand.repository.ts`, `supplier.repository.ts` | A5.2 |
| `content.repository.ts` | A7 |

A1 deja el acceso a datos listo: `backend/src/db/prisma.ts` crea el cliente
bajo demanda, así que importar el módulo no abre conexiones y los tests no
necesitan base de datos.

### A1.3 — Semilla desde `assets/`

`backend/prisma/seed.ts`:

1. Crea la marca **LifePod** (`esAliada: true`, logo `logo_lifePod_white.svg`).
2. Recorre `assets/brands/<marca>/products/<linea>/`; el archivo cuyo nombre
   coincide con la línea (`eco-3.webp`, `ECO-PRO.webp`, `one.webp`, `FIT.webp`) es
   la imagen del producto, y el resto son variantes.
3. Deriva el nombre de variante del nombre de archivo
   (`WATERMELON-LEMON.webp` → «Watermelon Lemon»), y el `tipo`: `color` para la
   línea `ONE`, `flavor` para el resto.
4. **No inventa precios ni stock.** Las cuatro líneas se crean en `borrador` sin
   precio; el precio por línea se carga en la consola (A5.3) y es requisito para
   publicar. El stock inicial queda en cero y entra por la consola como
   movimientos de `ingreso`, que es justamente el registro que hoy no existe.
5. **No envía correos.** La invitación del `owner` inicial es un comando aparte
   (`npm run admin:invite -- <correo>`, A4.1), para que repetir el seed nunca
   dispare invitaciones.

Conteo esperado tras la semilla: 1 marca, 4 productos, **79 variantes**
(23 `eco-3` + 49 `eco.pro` + 7 `ONE` + 0 `fit`), 0 movimientos de stock.

**Verificación A1**: `npx prisma migrate dev` corre en limpio; el seed es
idempotente (ejecutarlo dos veces no duplica nada); los conteos coinciden con los
esperados; `grep -r "prisma" frontend/` no devuelve nada; el backend conecta con
`vapeupar_app`, no con el usuario maestro.

### Registro de ejecución A1 (2026-10-26)

**Archivos**

| Archivo | Rol |
|---|---|
| `backend/prisma.config.ts` | Configuración del CLI de Prisma 7: esquema, migraciones, semilla y `MIGRATE_DATABASE_URL` |
| `backend/prisma/schema.prisma` | Las 10 entidades de ADR-002 §3, con identificadores en inglés (como el contrato de la API) y tablas en `snake_case` |
| `backend/prisma/migrations/*_init` | Tablas, enums e índices |
| `backend/prisma/migrations/*_app_role` | Rol `vapeupar_app` y sus permisos mínimos |
| `backend/prisma/sync-app-role.ts` | Aplica la contraseña de Secrets Manager al rol (`npm run db:sync-app-role`) |
| `backend/prisma/seed.ts` | Semilla idempotente desde `assets/brands/` (`npm run db:seed`) |
| `backend/src/db/prisma.ts` | Cliente de runtime, perezoso, con `@prisma/adapter-pg` |
| `backend/src/catalog/image-keys.ts` | Claves de imagen del bucket, `slugify` y `humanize`; compartido con A8 |
| `backend/.env.example` | Claves de entorno sin valores |
| `infra/lib/data-stack.ts` | Nuevo secreto `vapeupar/dev/rds-app` y parámetro `DB_APP_SECRET_ARN` |

**Decisiones tomadas durante la ejecución**

- **Prisma 7.10.1 fijado exacto.** El tag `latest` del CLI apunta a una release
  candidate de Prisma 8. Prisma 7 exige `prisma.config.ts` y adaptador de driver
  (`@prisma/adapter-pg`); el cliente se genera en `src/generated/prisma`
  (ignorado por git, regenerado en `prebuild`).
- **Permisos que refuerzan el modelo en la base**, no solo en el código:
  `vapeupar_app` no puede hacer DDL; no tiene `DELETE` salvo en
  `brand_suppliers` (nada se borra físicamente); `stock_movements` y
  `audit_logs` son de solo inserción; de `site_content` solo puede actualizar
  `published_at`. Verificado: `CREATE TABLE`, `DELETE FROM stock_movements` y
  `DELETE FROM products` responden *permission denied*. **Toda migración futura
  que cree una tabla debe conceder sus permisos de forma explícita.**
- **La semilla no sobrescribe.** `upsert` con `update: {}`: volver a ejecutarla
  solo añade lo nuevo y nunca pisa lo editado desde la consola.
- **La semilla no carga los productos de muestra** (Lost Mary, Geekvape...). Son
  datos ficticios con fotos de Unsplash; quedan como fixture de tests (A2) y como
  fallback del frontend hasta A6.
- **Categorías provisionales**, deducidas de las imágenes de línea: ONE →
  `pod-systems` (dispositivo por color); ECO 3, ECO PRO y FIT → `disposables`
  (precargados por sabor). **Confirmar con el catálogo del proveedor** y
  corregir desde la consola.

**Verificado**

| Comprobación | Resultado |
|---|---|
| Migraciones aplicadas | ✅ `init` y `app_role` |
| Semilla | ✅ 1 marca, 4 productos, 79 variantes (23 + 49 + 7 + 0); segunda ejecución: 0 nuevos |
| Rol de aplicación | ✅ Conecta como `vapeupar_app`; DDL y borrados denegados |
| Build y tests del backend | ✅ `tsc` sin errores; 17/17 tests |

**Incidencia.** `prisma migrate dev --create-only` aplica antes las migraciones
pendientes: al repetirlo se aplicó `init` y se generó una migración vacía
(`20261027015135_init`). Se conserva porque ya está registrada en la base; es
inocua. Para crear migraciones: `npm run db:migrate:create -- --name <nombre>`
**una sola vez**, editar el SQL si hace falta, y aplicar con `npm run db:migrate`.

---

## Fase A2 — Desacoplar `ProductService` y rehacer sus tests

### A2.1 — Inyección de dependencias

`ProductService` hoy hace `private products: Product[] = [...MOCK_PRODUCTS]`.
Pasa a recibir un `ProductRepository` por constructor. El singleton exportado
(`export const productService = ...`) se conserva para no romper
`product.routes.ts`, pero construido con el repositorio de Prisma.

### A2.2 — Tests sobre fixture

`backend/src/services/product.service.test.ts` depende del contenido del mock:
`total === 6`, `disposables === 2`, búsqueda `mango` con un resultado, el slug
`lost-mary-mo10000-watermelon-ice` y `getById('prod-002')` devolviendo Geekvape.
Se reescribe con un repositorio en memoria y un fixture propio del test, de modo
que **cambiar el catálogo real no vuelva a romper la suite**. Los casos de
paginación, orden y rangos de precio se conservan tal cual: son lógica, no datos.

### A2.3 — `getCategories()` deja de llevar un `Record` a mano

El conteo por categoría pasa a `groupBy` del repositorio. Las etiquetas legibles
(«Desechables (Puffs)», etc.) quedan en un único mapa exportado, consumido por el
backend y por `CATEGORIES` del catálogo, para bajar de cinco declaraciones a dos.

**Verificación A2**: `npm run test:backend` en verde; `MOCK_PRODUCTS` ya no se
importa en ningún servicio, solo en el seed y en los fixtures.

---

## Fase A3 — Dominio de inventario

### A3.1 — `stock.service.ts`

Único punto del sistema autorizado a escribir movimientos:

```
registrarMovimiento({ variantId, tipo, cantidad, motivo, supplierId?,
                      costoUnitario?, lote?, userId, operationKey })
disponible(variantId)
kardex(variantId, { desde, hasta })
reconciliar(variantId)        // recalcula stockCache desde el libro
bajoStock(umbral)
```

Reglas que el servicio impone, no la UI:

- **Signo por tipo**: `ingreso` y `devolucion` suman; `venta` y `merma` restan;
  `ajuste` admite signo explícito y **exige motivo**.
- **Idempotencia**: `operationKey` única por operación. Un doble clic en
  «registrar ingreso» no puede duplicar 50 unidades.
- **Transacción**: el movimiento, la actualización de `stockCache` y el
  `AuditLog` se escriben en una sola transacción de Prisma.
- **No negativos** salvo en `ajuste` con motivo (un conteo físico puede revelar
  que el disponible registrado era falso).
- `stockCache` nunca se escribe desde fuera de este servicio.

### A3.2 — Auditoría

`backend/src/services/audit.service.ts`, invocado por todo servicio que escriba:
guarda `antes` / `despues` como JSON, el usuario y la entidad. Obligatorio para
precio, stock, estado de publicación y contenido.

**Verificación A3**: tests unitarios de `stock.service` cubriendo los cinco tipos
de movimiento, el rechazo por `operationKey` repetida, el rechazo de `ajuste` sin
motivo, y que `reconciliar()` devuelve `stockCache` al valor del libro tras
corromperlo a propósito en el test.

---

## Fase A4 — Autenticación y superficie `/api/admin/*`

### A4.1 — Sesión con Cognito, mediada por el backend

El User Pool `vapeupar-dev-admins` y su cliente confidencial ya existen
(stack `Vapeupar-dev-Auth`); sus IDs y el secreto llegan a `backend/.env` con
`npm run infra:env-backend`.

- `backend/src/services/auth.service.ts` es el **único** archivo que importa
  `@aws-sdk/client-cognito-identity-provider` (contención del acoplamiento,
  ADR-002 Consecuencias).
- `POST /api/admin/auth/login` llama a `InitiateAuth` con `USER_PASSWORD_AUTH` y
  el `SECRET_HASH` del cliente, y guarda access token y refresh token en cookies
  `httpOnly` + `Secure` + `SameSite=Strict`. El navegador nunca ve un token.
- Primer acceso: Cognito responde con el reto `NEW_PASSWORD_REQUIRED` (la
  contraseña de la invitación es temporal). El login lo resuelve con
  `RespondToAuthChallenge`; la consola muestra el formulario de cambio.
- `backend/src/middleware/require-auth.ts` verifica la firma del access token
  contra el JWKS del pool (`aws-jwt-verify`), lo renueva con `REFRESH_TOKEN_AUTH`
  cuando expira, y resuelve el rol desde la tabla `User`. Un usuario de Cognito
  sin fila activa en `User` recibe 403.
- `backend/src/middleware/require-role.ts` para restringir por `owner` / `operador`.
- `POST /api/admin/users/invite` (solo `owner`) llama a `AdminCreateUser` y crea
  la fila en `User`. El primer owner se invita con un script equivalente,
  `npm run admin:invite -- <correo>`. Desactivar un usuario es `activo: false`
  más `AdminUserGlobalSignOut` y `AdminDisableUser`.
- Permisos IAM del backend: solo `cognito-idp:AdminCreateUser`,
  `AdminDisableUser`, `AdminUserGlobalSignOut` sobre el ARN del pool. En dev las
  llamadas usan tus credenciales locales; en prod, el rol de la tarea del backend.

### A4.2 — Rutas

```
POST   /api/admin/auth/login | logout
GET    /api/admin/me
GET    /api/admin/stock              ?q=&bajoStock=&brandId=
POST   /api/admin/stock/movimientos
GET    /api/admin/stock/:variantId/kardex
CRUD   /api/admin/brands | suppliers | products | products/:id/variants
GET    /api/admin/content/:clave     PUT /api/admin/content/:clave
GET    /api/admin/audit              ?entidad=&desde=
```

Todas con esquema Zod propio en `backend/src/schemas/admin/`. Cada ruta de
escritura devuelve el estado resultante, para que la consola no tenga que releer.

### A4.3 — Endurecimiento

- Rate limit propio para `/api/admin`, más estricto que los 100 req/min de `/api`.
- CORS del admin separado del CORS público (`allowedOrigins` de `index.ts`).
- Cuerpo máximo distinto del público (hoy `express.json({ limit: '20kb' })`): la
  edición de contenido puede superarlo.
- Actualizar `docs/security.md` §2 con la nueva superficie autenticada.

### A4.4 — Puente AdminJS (opcional, desechable)

Si hace falta operar stock antes de A5, montar AdminJS sobre el mismo Prisma bajo
`/admin-bridge`, detrás del mismo middleware de sesión y **solo habilitado por
variable de entorno**. Sin lógica de negocio propia: escribe a través de
`stock.service`. Se retira al cerrar A5.

**Verificación A4**: un cliente sin sesión recibe 401 en todas las rutas de
escritura; con rol `operador` recibe 403 donde corresponda; el rate limit del
admin se dispara antes que el público; `docs/backend.md` documenta los endpoints
nuevos en el mismo commit.

---

## Fase A5 — Consola `/admin` en Next

Grupo de rutas `frontend/src/app/(admin)/`, con su propio layout (sin navbar
público, sin age gate, sin `.vp-glitch`) y las primitivas de `components/ui/`.
Middleware de Next que redirige a `/admin/login` sin sesión. Las mutaciones salen
de Server Actions que llaman a `/api/admin/*` **reenviando la cookie de sesión**;
nunca Prisma ni SQL desde el frontend.

### A5.1 — Pantalla de stock (la más usada, va primera)

- Tabla de variantes con marca, línea, variante, disponible y estado, con
  búsqueda y filtro de bajo stock.
- Acción de movimiento en línea: tipo, cantidad, motivo, proveedor y costo
  unitario cuando es `ingreso`.
- Panel de kardex por variante.
- `operationKey` generada en cliente por intento, para que el reintento sea seguro.
- Bloque superior con alertas: agotados y bajo umbral.

### A5.2 — Marcas aliadas y proveedores

- CRUD de marca: nombre, slug, logo, `esAliada`, orden de aparición, activa.
- CRUD de proveedor y vínculo N↔N con marcas.
- Vista por proveedor: marcas que trae, variantes abastecidas, último ingreso.

### A5.3 — Productos y variantes

- Alta y edición de línea con specs, **precio** y precio anterior opcional (oferta).
  El precio se edita aquí y solo aquí: las variantes no tienen precio.
- Gestión de variantes: nombre, tipo, imagen, activa.
- `borrador` / `publicado` explícito, con aviso de qué falta para publicar
  (imagen, precio, al menos una variante activa).

### A5.4 — Contenido del sitio

Formularios generados desde los esquemas Zod de A7, con previsualización del
texto y botón de publicar que dispara la revalidación.

**Verificación A5**: registrar un ingreso de 10 unidades y ver el disponible
actualizado sin recargar; el doble envío del mismo formulario no duplica el
movimiento; desactivar una variante la retira del sitio público tras la
revalidación; sin sesión, `/admin` redirige a login.

---

## Fase A6 — Catálogo público con variantes

Intersección con el plan visual: se respetan las decisiones de V4 y V5
(`docs/design-execution-plan.md`), en particular un solo CTA primario por vista y
sin `scale` en la imagen al hover.

### A6.1 — Contratos

`Product` con `variants: Variant[]` en `backend/src/types/product.types.ts` y su
espejo en `frontend/src/types/product.ts`. `inStock` del producto pasa a derivarse
(`variants.some(v => v.activa && v.disponible > 0)`). `FALLBACK_PRODUCTS` se
regenera con la nueva forma a partir de la semilla, y conserva su rol de respaldo.

### A6.2 — Tarjeta

- Jerarquía marca / línea / variante en lugar del nombre truncado
  (cierra el punto 6.7 de `docs/design-reset-inventory.md`).
- Selector de variante que cambia la imagen y el disponible. El precio es el de
  la línea y no cambia al elegir variante.
- El mensaje de WhatsApp incluye la variante elegida.
- Etiqueta «N sabores» cuando la línea tiene más de una variante.

### A6.3 — Filtros

Búsqueda y filtro de sabor operan sobre variantes; el filtro de marca pasa a usar
`brandId` en lugar de comparar strings; el orden por `puffs` tolera productos sin
`puffCount` (los pods recargables no lo tienen).

**Verificación A6**: con la API apagada el sitio sigue renderizando desde el
fallback; buscar «watermelon» encuentra la línea por su variante; una línea con 49
variantes ocupa una tarjeta, no 49.

---

## Fase A7 — `SiteContent`, revalidación y barrido de textos

### A7.1 — Esquemas de contenido

`backend/src/schemas/content/` con un esquema Zod por clave: `hero`,
`trust-band`, `faq`, `seo`, `contacto`. Cada esquema con límites de longitud, para
que el texto no rompa el layout. Los valores actuales de los componentes pasan a
ser los **defaults en código**, que son también el fallback.

### A7.2 — Lectura en el frontend

`frontend/src/lib/content.ts` lee `/api/content/:clave` en Server Component con
`next: { tags: ['contenido'] }` y hace `safeParse` contra el esquema; si falla o
la API no responde, devuelve el default. La página nunca se queda sin texto.

### A7.3 — Revalidación on-demand

Route handler `frontend/src/app/api/revalidate/route.ts` que valida
`REVALIDATE_SECRET` y ejecuta `revalidateTag('catalogo' | 'contenido')`. El
backend lo invoca tras publicar. El catálogo sigue renderizándose en servidor.

### A7.4 — Barrido de lo que hoy está escrito a mano

| Archivo | Qué sale de datos |
|---|---|
| `frontend/src/components/faq.tsx` | Las preguntas completas; la enumeración de marcas se **genera** de `Brand.esAliada` |
| `frontend/src/app/layout.tsx` | `keywords` y metadatos OG/Twitter desde la clave `seo` |
| `frontend/src/components/trust-band.tsx` | Los tres bloques de confianza |
| `frontend/src/components/hero.tsx` | Titular, subtítulo y CTA |
| `docs/catalog-domain.md` §1 | Las «marcas líderes» quedan como contexto de dominio, no como fuente de la UI |

**Verificación A7**: cambiar una FAQ en la consola y verla en el sitio sin
desplegar; apagar el backend y comprobar que la FAQ sale con el texto por defecto;
marcar una marca como no aliada y verla desaparecer del texto de autenticidad.

---

## Fase A8 — Imágenes en S3 + CloudFront

El bucket `vapeupar-dev-catalog-<cuenta>` y su distribución de CloudFront ya
existen (stack `Vapeupar-dev-Storage`), con CORS para `PUT` desde
`http://localhost:3000`. Falta el código que los usa:

- `backend/src/services/storage.service.ts`, único archivo que importa
  `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`.
- `POST /api/admin/uploads` valida sesión, tipo y tamaño (webp/png/svg, límite
  explícito) y devuelve una **URL prefirmada de PUT** de vida corta (5 min), con
  `Content-Type` fijado en la firma. La consola sube directo con esa URL; el
  archivo no pasa por Express, así que el límite de cuerpo de A4.3 no aplica.
- Claves del bucket ordenadas como el inventario:
  `marcas/<brand-slug>/logo.svg` y `productos/<product-slug>/<variant-slug>.webp`.
  La base guarda la clave, no la URL: la URL pública se compone con `CDN_DOMAIN`.
- Migración de los 89 archivos de `assets/` al bucket mediante script
  (`aws s3 sync` con el mapeo de claves anterior), dejando `assets/` como archivo
  maestro del negocio, no como origen de producción.
- `next.config.ts`: `remotePatterns` con el dominio de CloudFront (`CDN_DOMAIN`);
  se retira `images.unsplash.com` cuando ya no quede ninguna referencia.
  Actualizar `docs/security.md` §2, que documenta hoy la lista de orígenes
  autorizados.
- Los logos SVG no pasan por el optimizador de `next/image` (lo rechaza por
  defecto): se sirven con `<img>` o `unoptimized`, nunca activando
  `dangerouslyAllowSVG` de forma global.
- Permisos IAM del backend: `s3:PutObject` solo sobre `arn:aws:s3:::<bucket>/*`.
- Imagen OG propia (pendiente #3 del plan visual y §7.2 del inventario de diseño).

**Verificación A8**: ninguna `imageUrl` en base de datos apunta a Unsplash;
`next build` no advierte de hosts no configurados; las imágenes cargan con el
`Image` de Next sin fallback roto.

---

## Alcance explícito

**Dentro**: persistencia, modelo de inventario con libro de movimientos,
proveedores, marcas aliadas, consola de administración, contenido editable,
imágenes en storage, autenticación y auditoría.

**Fuera** (no se diseña aquí, aunque el modelo no lo impida):

- Pedidos, carrito persistente y pasarela de pago. El checkout sigue siendo
  WhatsApp, según ADR-001 y `docs/security.md` §3. El descuento de stock por venta
  se registra a mano como movimiento de `venta` hasta que exista entidad de pedido.
- Órdenes de compra formales a proveedor (`PurchaseOrder`): el `ingreso` con
  `supplierId`, `costoUnitario` y `lote` cubre la necesidad inmediata.
- Multi-bodega, reservas de stock y POS.
- Informes y analítica más allá de la alerta de bajo stock y el kardex.

---

## Dependencias externas a resolver en paralelo

| # | Dependencia | Bloquea |
|---|---|---|
| 1 | ~~Entorno de datos, storage y auth~~ | ✅ Desplegado en AWS dev (A0.2) |
| 2 | Correo del owner inicial (recibe la invitación de Cognito) | Primer acceso a la consola |
| 3 | Precio real de cada una de las cuatro líneas y conteo físico inicial del inventario | Publicar líneas (A5.3) y primer uso de A5.1 |
| 4 | Datos de los proveedores reales (contacto, condiciones) | A5.2 |
| 5 | Cómputo del backend en AWS (ECS Fargate o Lightsail Containers) y alojamiento del frontend | Despliegue público; en dev el backend corre en local. Ver `docs/infrastructure-aws.md` §8 |
| 6 | Logos de las demás marcas aliadas en SVG | A5.2 |
| 7 | Dominio propio verificado en SES | Correo de invitaciones en producción |

---

## Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| El modelo de variantes se filtra a medias y quedan dos formas de producto conviviendo | A6 cambia los contratos en un solo paso, con el fallback regenerado en el mismo commit |
| `stockCache` se desincroniza del libro | `reconciliar()` desde A3 y su test de corrupción deliberada; la pantalla de stock muestra el valor del libro cuando difieren |
| La base de datos queda expuesta a internet | Subredes aisladas y `publiclyAccessible: false` en código (`infra/lib/data-stack.ts`); cualquier cambio pasa por `cdk diff` en revisión |
| Un secreto (contraseña de RDS, secreto de Cognito) se filtra al repositorio o al frontend | Viven en Secrets Manager; solo llegan a `backend/.env` (ignorado por git) mediante `npm run infra:env-backend`, que no imprime valores |
| Un cambio de Vapeupar afecta a DeliPan en la cuenta compartida | Todo por CDK con prefijo, etiquetas, VPC y toolkit propios; ningún stack referencia recursos de DeliPan (verificado al sintetizar) |
| Los créditos se agotan sin aviso | Presupuesto `vapeupar-dev-monthly` con alertas al 80 % real y 100 % previsto |
| La consola queda expuesta por una configuración de CORS o cookie laxa | A4.3, revisión explícita en `docs/security.md` y verificación de 401/403 antes de desplegar |
| El sitio público queda en blanco si la API cae | Invariante 6 de ADR-002: fallback en código para catálogo y contenido, verificado apagando el backend |
| Alguien edita precio o stock por fuera de los servicios | `stockCache` y precios solo escribibles desde `backend/src/services/`; `AuditLog` revela cualquier escritura sin autor |
| El puente AdminJS se vuelve permanente | Habilitado solo por variable de entorno y con retirada incluida en la definición de terminado de A5 |
