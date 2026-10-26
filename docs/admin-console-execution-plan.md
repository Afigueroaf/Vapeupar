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
| **A0** | Decisiones abiertas y entorno | `.env.example`, `docs/` | 🟡 **En curso** (3 de 6 cerradas) |
| **A1** | Esquema Prisma + migración + semilla desde `assets/` | `backend/prisma/`, `backend/src/repositories/` | ⬜ Pendiente |
| **A2** | Desacoplar `ProductService` y reescribir sus tests | `backend/src/services/`, `*.test.ts` | ⬜ Pendiente |
| **A3** | Dominio de inventario: movimientos, idempotencia, auditoría | `backend/src/services/stock.service.ts` | ⬜ Pendiente |
| **A4** | Autenticación y superficie `/api/admin/*` | `backend/src/routes/admin/`, `backend/src/middleware/` | ⬜ Pendiente |
| **A5** | Consola `/admin` en Next | `frontend/src/app/(admin)/` | ⬜ Pendiente |
| **A6** | Catálogo público con variantes | `product-card.tsx`, `product-catalog.tsx`, tipos | ⬜ Pendiente |
| **A7** | `SiteContent` + revalidación + barrido de textos | `faq.tsx`, `layout.tsx`, `trust-band.tsx` | ⬜ Pendiente |
| **A8** | Imágenes en Supabase Storage | `next.config.ts`, `storage.service.ts` | ⬜ Pendiente |

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
| 1 | Proveedor de datos, storage y auth | **Supabase** (PostgreSQL + Storage + Auth) | Una sola cuenta para A1, A4 y A8. Se descarta Neon y desaparecen la elección de storage y de librería de sesiones |
| 2 | Precio: ¿por línea o por variante? | **Por línea** (`Product.precio`, con `precioAnterior` opcional para ofertas) | `Variant` no lleva precio; la consola edita el precio una vez por línea (A5.3) |
| 3 | Taxonomía de categorías | **Se mantienen las 6 actuales** (`disposables`, `pod-systems`, `mods-tanks`, `salt-nic`, `freebase-liquids`, `coils-accessories`) | `Product.categoria` es un enum de Prisma con esos 6 valores; los identificadores del contrato de API no cambian y A2.3 solo consolida las etiquetas, no la taxonomía |

**Abiertas**

| # | Decisión | Opciones | Impacto si se elige mal |
|---|---|---|---|
| 4 | ¿Qué líneas LifePod se publican ya? | `eco-3`, `eco.pro`, `ONE`, `fit` | `fit/` solo tiene imagen de línea y ninguna variante: o se publica sin variantes o queda en `borrador` |
| 5 | Umbral de «bajo stock» | Global (ej. 5 unidades) vs por variante | Define la alerta de la pantalla de stock (A5.1) |
| 6 | Usuarios de la consola | Solo `owner` hoy; ¿habrá `operador`? | El rol se modela desde A1 en cualquier caso, pero define si A4 necesita pantalla de invitación |

### A0.2 — Proyecto Supabase

Configuración del proyecto antes de la primera migración:

1. Crear el proyecto en la región más cercana a Colombia disponible.
2. **Desactivar la Data API** (Settings → API). El proyecto no usa PostgREST y,
   activa, expondría el esquema `public` a cualquiera con la `anon key`.
3. **Desactivar el registro público** en Auth (las altas son por invitación).
4. Crear el bucket `catalogo` con lectura pública y sin política de escritura
   para `anon` ni `authenticated`: solo se escribe con URL firmada.
5. Plan de pago o monitoreo de actividad antes de producción: el plan gratuito
   pausa proyectos inactivos.

### A0.3 — Variables de entorno

Añadir a `backend/.env.example`, documentando cada una junto al resto de la
configuración de entorno del proyecto:

```
DATABASE_URL=                 # Pooler de Supabase (Supavisor, modo transacción) + ?pgbouncer=true
DIRECT_URL=                   # Conexión directa; solo la usan las migraciones de Prisma
SUPABASE_URL=                 # https://<proyecto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=    # Salta RLS: solo backend, nunca en el repositorio
SUPABASE_STORAGE_BUCKET=catalogo
REVALIDATE_SECRET=            # Compartido con el frontend (A7)
ADMIN_SEED_EMAIL=             # Destinatario de la invitación del owner inicial
```

No hay `ADMIN_SEED_PASSWORD`: el owner inicial recibe una invitación de correo de
Supabase Auth y define su contraseña ahí.

En el frontend solo se añade `REVALIDATE_SECRET` (mismo valor), junto a
`NEXT_PUBLIC_API_URL`, que ya existe. **Ninguna clave de Supabase en el frontend,
ni siquiera la `anon key`** (ADR-002, invariante 1): `grep -r SUPABASE frontend/`
debe devolver vacío.

**Verificación A0**: las seis decisiones están respondidas por escrito en este
documento; el proyecto Supabase cumple los cinco puntos de A0.2; los dos
`.env.example` existen con todas las claves y sin valores reales.

---

## Fase A1 — Esquema Prisma, migración y semilla

### A1.1 — Instalar y declarar el esquema

- `prisma` + `@prisma/client` como dependencias de **`backend/` únicamente**.
- `backend/prisma/schema.prisma` con las entidades de ADR-002 §3, y el
  `datasource` usando `url = env("DATABASE_URL")` y `directUrl = env("DIRECT_URL")`.
- **Cada migración que crea una tabla activa RLS en ella**
  (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`) sin crear políticas. Prisma no lo
  genera solo: se añade a mano al SQL de la migración. El backend conecta con un
  rol que salta RLS, así que esto no le afecta; protege contra una Data API
  reactivada por error.
- `User.id` es el `uuid` de `auth.users`, sin clave foránea entre esquemas
  (`auth` lo gestiona Supabase); la coherencia la garantiza el flujo de
  invitación de A4.
- Índices obligatorios: `Variant(productId)`, `StockMovement(variantId, createdAt)`,
  `StockMovement(operationKey)` único, `Product(slug)` único, `Brand(slug)` único,
  `SiteContent(clave, version)`.
- `Product.estado` y `Variant.activa` con valores por defecto conservadores
  (`borrador`, `true`).

### A1.2 — Capa de repositorio

Crear `backend/src/repositories/` con `product.repository.ts`,
`brand.repository.ts`, `supplier.repository.ts`, `stock.repository.ts`,
`content.repository.ts`. Los servicios dependen de interfaces de repositorio, no
de Prisma: es lo que hace posible A2 (tests con fixture en memoria, sin base de
datos).

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
5. Envía la invitación del `owner` inicial a `ADMIN_SEED_EMAIL` por la API de
   administración de Supabase Auth y crea su fila en `User` con rol `owner`.

Conteo esperado tras la semilla: 1 marca, 4 productos, **79 variantes**
(23 `eco-3` + 49 `eco.pro` + 7 `ONE` + 0 `fit`), 0 movimientos de stock.

**Verificación A1**: `npx prisma migrate dev` corre en limpio; el seed es
idempotente (ejecutarlo dos veces no duplica nada ni reenvía la invitación); los
conteos coinciden con los esperados; `grep -r "prisma" frontend/` no devuelve
nada; la consulta
`select relname from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace and not relrowsecurity;`
devuelve cero filas (ninguna tabla sin RLS).

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

### A4.1 — Sesión con Supabase Auth, mediada por el backend

- `backend/src/services/auth.service.ts` es el **único** archivo que importa el
  SDK de Auth de Supabase (contención del acoplamiento, ADR-002 Consecuencias).
- `POST /api/admin/auth/login` autentica contra Supabase Auth y guarda el access
  token y el refresh token en cookies `httpOnly` + `Secure` + `SameSite=Strict`.
  El navegador nunca ve un token en JavaScript.
- `backend/src/middleware/require-auth.ts` valida el access token contra
  Supabase, lo renueva con el refresh token cuando expira, y resuelve el rol desde
  la tabla `User`. Un usuario de Supabase Auth sin fila activa en `User` recibe 403.
- `backend/src/middleware/require-role.ts` para restringir por `owner` / `operador`.
- `POST /api/admin/users/invite` (solo `owner`) invita por correo y crea la fila
  en `User`. Desactivar un usuario es `activo: false` más revocar sus sesiones en
  Supabase.

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

## Fase A8 — Imágenes en Supabase Storage

- `backend/src/services/storage.service.ts`, único archivo que importa el SDK de
  Storage de Supabase.
- `POST /api/admin/uploads` valida sesión, tipo y tamaño (webp/png/svg, límite
  explícito) y devuelve una **URL firmada de subida** al bucket `catalogo`
  (`createSignedUploadUrl`). La consola sube directo con esa URL; el archivo no
  pasa por Express, así que el límite de cuerpo de A4.3 no aplica.
- Rutas del bucket ordenadas como el inventario:
  `marcas/<brand-slug>/logo.svg` y `productos/<product-slug>/<variant-slug>.webp`.
- Migración de los 89 archivos de `assets/` al bucket mediante script, dejando
  `assets/` como archivo maestro del negocio, no como origen de producción.
- `next.config.ts`: `remotePatterns` con `hostname: "<proyecto>.supabase.co"` y
  `pathname: "/storage/v1/object/public/catalogo/**"`; se retira
  `images.unsplash.com` cuando ya no quede ninguna referencia. Actualizar
  `docs/security.md` §2, que documenta hoy la lista de orígenes autorizados.
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
| 1 | Proyecto Supabase configurado según A0.2, con sus claves | A1, A4 y A8 |
| 2 | Correo del owner inicial (recibe la invitación) | Primer acceso a la consola |
| 3 | Precio real de cada una de las cuatro líneas y conteo físico inicial del inventario | Publicar líneas (A5.3) y primer uso de A5.1 |
| 4 | Datos de los proveedores reales (contacto, condiciones) | A5.2 |
| 5 | Hosting del backend con variables de entorno y secretos | Despliegue de A4 |
| 6 | Logos de las demás marcas aliadas en SVG | A5.2 |

---

## Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| El modelo de variantes se filtra a medias y quedan dos formas de producto conviviendo | A6 cambia los contratos en un solo paso, con el fallback regenerado en el mismo commit |
| `stockCache` se desincroniza del libro | `reconciliar()` desde A3 y su test de corrupción deliberada; la pantalla de stock muestra el valor del libro cuando difieren |
| Las tablas quedan legibles desde internet vía la Data API de Supabase | Data API desactivada (A0.2) **y** RLS en cada tabla (A1.1), con la consulta de verificación de A1 en cada migración nueva |
| La `service_role key` se filtra al frontend o al repositorio | Solo en variables del backend; `grep -r SUPABASE frontend/` vacío como verificación de A0 |
| La consola queda expuesta por una configuración de CORS o cookie laxa | A4.3, revisión explícita en `docs/security.md` y verificación de 401/403 antes de desplegar |
| El sitio público queda en blanco si la API cae | Invariante 5 de ADR-002: fallback en código para catálogo y contenido, verificado apagando el backend |
| Alguien edita precio o stock por fuera de los servicios | `stockCache` y precios solo escribibles desde `backend/src/services/`; `AuditLog` revela cualquier escritura sin autor |
| El puente AdminJS se vuelve permanente | Habilitado solo por variable de entorno y con retirada incluida en la definición de terminado de A5 |
