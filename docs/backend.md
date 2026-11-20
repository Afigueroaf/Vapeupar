# Backend API - Vapeupar

## Propósito
El backend de Vapeupar es un servicio REST desarrollado en **TypeScript** con **Node.js** y **Express.js**, enfocado en la gestión de inventario, catálogo de vaporizadores, marcas, categorías, validación estricta de esquemas y procesamiento seguro de consultas.

## Seguridad y Resiliencia
- **Cabeceras de Seguridad (Helmet)**: Configurado para proteger la API contra ataques de scripting entre sitios (XSS), sniffing de tipo MIME y clickjacking.
- **Limitación de Tasa (Rate Limiting)**: Cuatro límites, del más estricto al más laxo, y todos los que coinciden se aplican: 10 intentos fallidos por 15 minutos en `/api/admin/auth/login`, 10 pedidos creados por 15 minutos en `/api/orders` (los rechazos 4xx no cuentan), 30 peticiones por minuto en `/api/admin` y 100 por minuto en `/api/*`. Por eso una ráfaga contra la consola se corta antes que la del público.
- **Validación con Esquemas Zod 4**: Toda entrada de parámetros de consulta (`query`), de ruta (`params`) y de cuerpo se somete a validación estricta en tiempo de ejecución. Las claves desconocidas se descartan en lugar de rechazar la petición, de modo que un campo colado en un cuerpo no llega nunca al servicio. **Excepción: los pedidos** (`POST /api/orders` y las transiciones de `/api/admin/orders`) usan objetos estrictos y responden `400` a un campo de más, para que un precio enviado por el cliente se rechace en vez de ignorarse en silencio.
- **Manejo Centralizado de Errores**: Middleware global que captura excepciones no controladas y enmascara detalles técnicos internos en entornos de producción. Un cuerpo que `express.json` rechaza (JSON mal formado, demasiado grande) responde su `400`/`413` y en el registro queda solo el tipo (`entity.parse.failed`), nunca el cuerpo crudo.
- **Cierre Elegante (Graceful Shutdown)**: Captura de señales `SIGINT` y `SIGTERM` para finalizar conexiones HTTP de manera ordenada.

## Ejecución Local
- Modo desarrollo con recarga en caliente:
  ```bash
  npm run dev:backend
  # O dentro de la carpeta backend/:
  npm run dev
  ```
- Compilación a JavaScript:
  ```bash
  npm run build:backend
  # O dentro de la carpeta backend/:
  npm run build
  ```
- Producción:
  ```bash
  npm start
  ```

## Estructura de Directorios
```
backend/
├── src/
│   ├── catalog/         # Etiquetas de categoría y claves de imagen
│   ├── config/          # Configuración de Cognito, validada bajo demanda
│   ├── db/              # Cliente de Prisma bajo demanda
│   ├── middleware/      # Sesión en cookies, requireAuth y requireRole
│   ├── repositories/    # Acceso a datos: interfaz + Prisma + memoria (tests)
│   ├── routes/          # Rutas Express; routes/admin/ es la superficie autenticada
│   ├── schemas/         # Esquemas de validación Zod; schemas/admin/ los del admin
│   ├── services/        # Catálogo público y de consola, inventario, contenido, auditoría y sesión
│   ├── types/           # Interfaces y tipos TypeScript (producto, stock, pedidos)
│   ├── app.ts           # Armado de la aplicación (middlewares, CORS, límites, rutas)
│   └── index.ts         # Arranque del proceso: escucha el puerto y cierra elegante
├── tsconfig.json        # Configuración TypeScript NodeNext / ES2022 (strict: true)
├── package.json         # Scripts y dependencias
├── prisma/
│   ├── schema.prisma    # Modelo de datos (ADR-002 §3)
│   ├── migrations/      # Migraciones SQL versionadas
│   ├── seed.ts          # Semilla idempotente desde assets/brands/
│   └── sync-app-role.ts # Contraseña del rol vapeupar_app desde Secrets Manager
├── prisma.config.ts     # Configuración del CLI de Prisma 7
└── .env                 # Variables de entorno locales (ver .env.example)
```

Los servicios reciben su repositorio por constructor: en runtime el de Prisma, en
los tests uno en memoria con un fixture propio. Las etiquetas de categoría solo se
declaran en `src/catalog/categories.ts`.

**Catálogo y contenido.** `catalog.service.ts` es el único código que escribe
marcas, proveedores, líneas y variantes, y por tanto **el único que escribe
precios**; `content.service.ts`, el único que publica contenido. Cada escritura
deja su fila en `AuditLog` dentro de la misma transacción, firmada por el
usuario de la sesión. Las reglas que el esquema documenta pero no puede imponer
—qué falta para publicar, qué es inmutable, que una línea no mezcla sabores con
colores— viven ahí y no en las rutas.

**Inventario.** `stock.service.ts` es el único código que escribe movimientos y
`Variant.stockCache`: cada operación bloquea la variante, valida signo, motivo,
negativos e idempotencia (`operationKey`), y escribe movimiento, caché y
auditoría en una sola transacción. `recordMovementIn` hace lo mismo sobre una
transacción que abre quien llama: lo usan los pedidos para confirmar todas sus
líneas y su estado juntos (ADR-003). Las ventas admiten `unitPrice` (precio
cobrado); ningún otro tipo. Ver el registro de A3 en
`docs/admin-console-execution-plan.md`. El cliente generado vive en `src/generated/prisma`
(ignorado por git; `npm run db:generate` o `prebuild` lo regeneran).

## Superficie autenticada: `/api/admin` (A4)

Consola de administración. Todo lo que no sea `/auth` exige sesión; el orden de
montaje en `routes/admin/index.ts` es la frontera, de modo que una ruta nueva
nace protegida.

| Método y ruta | Rol | Qué hace |
|---|---|---|
| `POST /api/admin/auth/login` | — | Abre sesión, o responde el paso que falta: `new_password_required` (contraseña temporal), `mfa_required` (la cuenta tiene TOTP) o `mfa_setup` (hay que enrolar TOTP; trae `secret` y `otpauthUri`) |
| `POST /api/admin/auth/new-password` | — | Resuelve el reto de contraseña temporal; puede responder también un paso de MFA |
| `POST /api/admin/auth/mfa` | — | Código TOTP de 6 dígitos: entra con una cuenta que ya tiene TOTP o termina de enrolarlo. Código malo: `400 INVALID_MFA_CODE` |
| `POST /api/admin/auth/logout` | sesión | Revoca los refresh tokens en Cognito y borra las cookies |
| `GET /api/admin/me` | sesión | Identidad y rol del usuario de la sesión |
| `GET /api/admin/stock` | sesión | Inventario paginado. `?q=&brandId=&lowStock=&threshold=&page=&limit=`. Sin `threshold` aplica el configurado; `meta` trae `threshold` (aplicado) y `configuredThreshold` |
| `GET /api/admin/stock/threshold` | sesión | Umbral global de bajo stock (5 si nunca se configuró) |
| `PUT /api/admin/stock/threshold` | **owner** | Cambia el umbral. Se guarda en `site_content` con clave `setting.low-stock-threshold` (versión nueva por cambio) y en `AuditLog` |
| `POST /api/admin/stock/movements` | sesión | Registra un movimiento. `201`, o `200` si fue un reintento (`replayed`) |
| `GET /api/admin/stock/:variantId/kardex` | sesión | Kardex de la variante. `?from=&to=` |
| `GET /api/admin/stock/image-alerts` | sesión | Variantes `published` con stock y sin `imageKey`; alimenta la alerta de imágenes del inventario |
| `POST /api/admin/uploads/presign` | sesión | URL `PUT` prefirmada (5 min) para logos, líneas y variantes. La clave la deriva el backend; `contentType` limitado a webp/jpeg/png y `size` a 5 MB |
| `POST /api/admin/uploads/invalidate` | sesión | Invalida en CloudFront la clave recién subida. Solo una ruta concreta del catálogo; `503` si falta `CDN_DISTRIBUTION_ID` |
| `GET /api/admin/orders` | sesión | Pedidos del más reciente al más antiguo, con datos del cliente, líneas y `total`. `?status=&q=&from=&to=&page=&limit=`; `q` busca en referencia, nombre y (con 3 cifras o más) teléfono |
| `GET /api/admin/orders/:id` | sesión | Un pedido. `404` si no existe |
| `POST /api/admin/orders/:id/confirm` | sesión; descuento solo **owner** | `received` → `confirmed`. `{ deliveryFee, lines?: [{ variantId, unitPrice }] }`. Un movimiento `sale` por línea en una transacción, con `unitPrice`, la referencia en `lot` y `operationKey` `order:<id>:sale:<variantId>`. Sin stock: `409 INSUFFICIENT_STOCK` con `lines` y nada registrado. Otro precio que el de catálogo con `operator`: `403` |
| `POST /api/admin/orders/:id/deliver` | sesión | `confirmed` → `delivered` |
| `POST /api/admin/orders/:id/cancel` | sesión | `received`/`confirmed` → `cancelled`. `{ reason? }`. Si estaba confirmado, un `return` por línea (`order:<id>:return:<variantId>`). Entregado: `409` |
| `POST /api/admin/orders/:id/anonymize` | **owner** | Supresión de datos del cliente (nombre, teléfono, barrio y motivo) en un pedido entregado o cancelado |
| `POST /api/admin/orders/retention` | **owner** | Plazo de conservación: anonimiza los cerrados hace más de 365 días y caduca (cancela y anonimiza) los recibidos hace más de 30. Responde `{ cancelled, anonymized }` |
| `GET /api/admin/inventory-notes` | sesión | Notas de inventario, con `authorEmail` y el nombre de la variante y su línea. `?variantId=&resolved=` |
| `POST /api/admin/inventory-notes` | **owner** | Crea una nota general o asociada a una variante. Audita `inventory_note.create` |
| `PATCH /api/admin/inventory-notes/:id/resolve` | **owner** | Marca la nota como resuelta. Audita `inventory_note.resolve` |
| `GET /api/admin/brands` | sesión | Marcas paginadas. `?q=&active=&isPartner=&page=&limit=` |
| `GET /api/admin/brands/:id` | sesión | Una marca, con su número de líneas |
| `POST /api/admin/brands` | **owner** | Crea la marca. `201` con la fila resultante |
| `PATCH /api/admin/brands/:id` | **owner**, u `operator` solo con `logoKey` | Cambia solo los campos que trae el cuerpo |
| `GET /api/admin/suppliers` | sesión | Proveedores paginados. `?q=&active=&page=&limit=` |
| `GET /api/admin/suppliers/:id` | sesión | Ficha con las marcas que trae, las variantes distintas que ha abastecido (`suppliedVariantCount`) y la fecha del último ingreso |
| `POST /api/admin/suppliers` | **owner** | Crea el proveedor; `brandIds` fija el vínculo con marcas |
| `PATCH /api/admin/suppliers/:id` | **owner**, u `operator` solo con `imageKey` | Igual; `brandIds` reemplaza la lista completa |
| `GET /api/admin/products` | sesión | Líneas paginadas, borradores primero, con el número de variantes (no las variantes). `?q=&brandId=&category=&status=&page=&limit=` |
| `GET /api/admin/products/:id` | sesión | Ficha con sus variantes y `meta.readiness` (qué falta para publicar) |
| `POST /api/admin/products` | **owner** | Crea la línea. Nace en `draft` salvo que se pida otra cosa |
| `PATCH /api/admin/products/:id` | **owner**, u `operator` solo con `imageKey` | Precio, specs, publicación. `409` con `missing` si falta algo para publicar |
| `GET /api/admin/products/:id/variants` | sesión | Variantes de la línea, en su orden de aparición |
| `POST /api/admin/products/:id/variants` | **owner** | Crea la variante. El stock nace en cero y no se acepta del cuerpo |
| `PATCH /api/admin/products/:id/variants/:variantId` | **owner**, u `operator` solo con `imageKey` | Nombre, imagen, orden y `active` |
| `GET /api/admin/content` | sesión | Las claves de contenido disponibles |
| `GET /api/admin/content/:key` | sesión | Última versión publicada de la clave. `404` si nunca se publicó |
| `GET /api/admin/content/:key/versions` | sesión | Historial para volver atrás. `?limit=` |
| `PUT /api/admin/content/:key` | **owner** | Publica una **versión nueva**; no sobrescribe. `201`. El `value` se valida con el esquema de su clave (`schemas/content/`, A7.1): campos desconocidos, que falte uno o textos fuera de límite son `400` con el campo culpable en el mensaje (`value.items.0.title: …`) y en `errors[]` (`{ field, message }`, A5.4) |
| `POST /api/admin/content/:key/versions/:version/restore` | **owner** | «Restaurar» de la consola (A5.4): vuelve a publicar el valor de la versión N como versión **nueva** (N+1); el historial no se reescribe. `201` con `meta.revalidated`; `404` si la versión no existe; `400` si ya no cumple el esquema. Auditado como `content.restore` con `after.restoredFrom` |
| `GET /api/admin/audit` | **owner** | Registro de escrituras. `?entity=&entityId=&action=&userId=&from=&to=&page=&limit=` |
| `GET /api/admin/users` | **owner** | Todas las cuentas de la consola, activas e inactivas, por correo |
| `POST /api/admin/users/invite` | **owner** | Invita a la consola y crea la fila en `User` |
| `POST /api/admin/users/:id/deactivate` | **owner** | Desactiva la fila y deshabilita la cuenta en el pool |

**Escribir es de `owner`; leer, de cualquier sesión.** La decisión #6 del plan
(si habrá `operator` y para qué) sigue abierta, así que el reparto es el
conservador: el `operator` hace lo que A4 ya le dio, que es el inventario
diario, y el catálogo, el contenido y la auditoría quedan para `owner`.
Relajarlo es una línea por ruta.

**Las imágenes son la excepción** (decisión del 2026-10-27, en
`docs/security.md` §2.2). Quien hace el ingreso diario es quien tiene la foto,
así que el `operator` firma subidas y guarda la clave de marca, proveedor,
línea y variante. Lo impone `requireOwnerOrFields`, que mira el cuerpo **sin
validar**: un PATCH de `operator` con cualquier campo de más se rechaza entero
con `403` en vez de que Zod lo descarte y pase como si solo trajera la imagen.

**Pedidos (ADR-003).** Las transiciones responden `200` con el pedido y
`meta: { replayed, revalidated }`; repetir una transición ya hecha con los
mismos datos es `replayed: true` y no escribe nada, y con otros datos es `409
CONFLICT`. Un estado del que no sale la transición es `409 INVALID_STATE`. Los
cuerpos son estrictos. Confirmar y cancelar un confirmado escriben en el libro
con `recordMovementIn` (`stock.service.ts`) dentro de la transacción del pedido,
que está bloqueado (`FOR UPDATE`): todas las líneas o ninguna. La auditoría
(`order.create`, `order.confirm`, `order.deliver`, `order.cancel`,
`order.anonymize`, `order.retention`) **no copia nombre, teléfono, barrio ni el
motivo de cancelación**.

**No hay DELETE en ninguna de estas entidades.** El libro de inventario
referencia variantes y proveedores con `onDelete: Restrict`, y las líneas
referencian marcas igual: borrar de verdad rompería el rastro contable. Retirar
algo es `active: false`, y retirar una línea es `status: 'draft'`.

**Qué falta para publicar.** Una línea se publica con precio, imagen y al menos
una variante activa (A5.3). El detalle lo adelanta en `meta.readiness` y el
intento de publicar sin eso responde `409` con la lista en `missing`, para que la
consola pueda decir qué falta en vez de solo negarse. Tampoco se renombra una
línea publicada: su URL está indexada y renombrarla exige una redirección 301.

**Imagen de variante.** Es opcional: no bloquea publicar ni activar la variante.
Se sube desde el ingreso de stock con una URL prefirmada y se guarda su
`imageKey`. El inventario alerta de las variantes publicadas con stock y sin
imagen; la revisión final es responsabilidad de los administradores.

**Imagen de proveedor.** `Supplier.imageKey` es opcional y se edita desde la
ficha del proveedor con el mismo flujo de subida.

**Claves del bucket.** Una sola convención, en español, para la semilla y para
las subidas desde la consola (`catalog/image-keys.ts`):

```txt
marcas/<marca-slug>/logo[-<versión>].<ext>
proveedores/<proveedor-id>/logo[-<versión>].<ext>
productos/<linea-slug>/linea[-<versión>].<ext>
productos/<linea-slug>/<variante-slug>[-<versión>].<ext>
```

La semilla escribe las claves sin versión; **cada subida desde la consola lleva
una** (milisegundos en base 36, p. ej. `mango-ice-m3k9x2ab.webp`), así que
reemplazar una imagen produce una URL nueva.

La base guarda la clave, nunca la URL: la pública se compone con `CDN_DOMAIN`.
El proveedor va por `id` y no por slug porque no tiene uno.

**Reemplazar una imagen.** Cada subida genera una clave nueva, y la imagen
cambia en el sitio al guardar el formulario, que es lo que apunta la fila a esa
clave. Antes la clave era fija y el objeto se sobrescribía en la misma URL:
CloudFront se invalidaba, pero el optimizador de imágenes de Next guarda cada
URL 4 horas (`minimumCacheTTL`) y le indica al navegador lo mismo, de modo que
la foto nueva tardaba hasta 4 horas en verse. Con una URL por versión ninguna
caché tiene nada viejo que servir y la consola ya no invalida.
`POST /uploads/invalidate` se conserva para las claves sin versión de la
semilla.

**La imagen anterior se borra al guardar.** Cuando un `PATCH` de marca,
proveedor, línea o variante cambia (o quita) la clave de imagen,
`CatalogService` borra del bucket el objeto anterior: después de confirmar la
transacción, solo si ninguna otra fila de las cuatro tablas lo sigue usando, y
sin que un fallo de S3 deshaga el guardado (queda un `console.warn`). Necesita
`s3:DeleteObject` sobre los prefijos del catálogo (`infra/lib/app-stack.ts`).
Una imagen subida y no guardada no la referencia ninguna fila y se queda en el
bucket. Ver `docs/infrastructure-aws.md` §2.

**Sesión.** Los tokens de Cognito viven en cookies `httpOnly` + `SameSite=Strict`
limitadas a `/api/admin` (y `Secure` en producción). El JavaScript de la consola
nunca ve un token, así que un XSS no se lleva la sesión. Cuando el access token
vence, `requireAuth` lo renueva con el refresh token y la petición continúa; el
cliente solo nota un `Set-Cookie` nuevo.

**Dos puertas, dos códigos.** Cognito dice quién eres: si eso falla, `401`. La
tabla `User` dice si puedes entrar: si no hay fila activa para ese `sub`, `403`,
porque reintentar el login no cambiaría nada. Desactivar a alguien es, por tanto,
una escritura en la base; Cognito solo se usa además para cerrarle las sesiones
abiertas.

**El autor no se acepta del cliente.** Ninguna escritura lee el autor del
cuerpo: `POST /stock/movements` y todo el CRUD lo toman de la sesión, así que lo
que queda en `AuditLog` es quien lo hizo de verdad. Un `userId` colado en el
cuerpo se descarta antes de llegar al servicio.

**Las escrituras publicadas refrescan el sitio (A7.3).** Después de una
escritura que ya salió bien, el backend avisa a Next con
`POST /internal/revalidate` (`services/site-revalidation.service.ts`,
`notifySite`), y el cambio se ve al recargar sin esperar el ISR de 60 s:

| Escritura | Etiqueta |
|---|---|
| `PUT /api/admin/content/:key` y `POST …/versions/:version/restore` | `contenido` |
| `POST`/`PATCH` de marcas, líneas y variantes | `catalogo` (también basta para las marcas aliadas: `getPartnerBrands` lleva las dos) |
| `POST /api/admin/stock/movements` (ventas, ingresos, ajustes; también un reintento) | `catalogo` |
| `POST /api/admin/orders/:id/confirm` y `…/cancel` de un pedido confirmado | `catalogo` |

La respuesta espera el aviso como mucho 3 s y lleva `meta.revalidated`: `false`
si el frontend no contestó, rechazó el secreto o no hay secreto; el cambio se
verá igual en ≤60 s. **Nunca cambia el `201`/`200`**: un fallo deja solo un
`console.warn` en el journal. El revalidador se inyecta en
`createAdminRouter({ revalidate })`; los tests pasan uno falso.

| Variable | Por defecto | Qué es |
|---|---|---|
| `REVALIDATE_SECRET` | — | Secreto compartido con el frontend. Sin él no se avisa |
| `REVALIDATE_URL` | `http://127.0.0.1:3000/internal/revalidate` | Next en la misma máquina |

En la instancia los escribe `infra/deploy/write-env.mjs` desde el secreto
`vapeupar/<env>/revalidate` (stack App); en local, `npm run infra:env-backend`,
que copia el mismo valor a `frontend/.env.local`.

**Primer acceso.** La ruta de invitación exige ser `owner`, así que el primero
entra por script:

```bash
npm run admin:invite -- correo@dominio.com            # rol owner por defecto
npm run admin:invite -- otro@dominio.com --role operator
```

Necesita credenciales de AWS y el túnel abierto. Cognito envía la contraseña
temporal por correo y vence en 3 días.

## Base de Datos (PostgreSQL en AWS RDS + Prisma 7)

La base solo es alcanzable por túnel (`docs/infrastructure-aws.md`). Desde la raíz:

```bash
npm run infra:env-backend   # escribe DATABASE_URL y MIGRATE_DATABASE_URL en backend/.env
npm run infra:db-tunnel     # en otra terminal; dejarla abierta
npm run db:migrate          # aplica migraciones pendientes (usuario maestro)
npm run db:sync-app-role    # habilita el login de vapeupar_app
npm run db:seed             # catálogo inicial desde assets/brands/
npm run db:upload-images --workspace=backend -- --dry-run   # qué imágenes faltan en el bucket
npm run db:upload-images --workspace=backend                # subirlas y rellenar imageKey
```

- **Imágenes del catálogo de partida** (`scripts/upload-catalog-images.ts`). Lee
  `assets/brands/` con el mismo mapa que la semilla
  (`src/catalog/catalog-assets.ts`), compara con el bucket
  (`S3_CATALOG_BUCKET`) y sube **solo lo que falta**, con su `ContentType`. Luego
  rellena la imagen de las marcas, líneas y variantes que **no tienen ninguna**, con
  la clave canónica y una entrada `image.backfill` en `AuditLog` sin usuario.
  Nunca sobrescribe un objeto ni una clave existente (las subidas de la consola
  llevan versión en el nombre). Lista además las filas cuya clave no está en el
  bucket y que esta carga no arregla. Necesita el túnel y credenciales con
  `s3:ListBucket` y `s3:PutObject`. Empezar siempre por `--dry-run`.

- **Conteo físico inicial** (`scripts/export-count-template.ts` y
  `scripts/import-initial-stock.ts`, lógica en `src/catalog/initial-count.ts` y
  `src/services/initial-count.service.ts`). El exportador escribe una planilla
  con una fila por variante activa; el dueño rellena cantidades y costos en
  Excel y el importador la registra de una vez como movimientos de stock.

  *Formato.* CSV en UTF-8 **con BOM** y separador **`;`**: es lo que Excel en
  español (Colombia usa coma decimal, así que su separador de listas es `;`)
  abre con doble clic en columnas y con tildes; sin BOM las leería como ANSI. El
  importador acepta además `,` y el «CSV (delimitado por comas)» que guarda
  Excel, que va en Windows-1252. Columnas:

  | Columna | Quién | Contenido |
  |---|---|---|
  | `variantId` | exportador | UUID de la variante; es la clave. No tocar |
  | `marca`, `linea`, `variante` | exportador | Para leer; se ignoran al importar |
  | `lineSlug`, `variantSlug` | exportador | Se comprueban contra `variantId`: detectan filas desplazadas al ordenar |
  | `stockSistema` | exportador | `stockCache` al exportar; si cambió, el import avisa |
  | `cantidad` | dueño | Entero ≥ 0 contado. Obligatoria: 0 si no hay |
  | `costoUnitario` | dueño | Pesos por unidad, entero > 0 (`21000`, `21.000` o `$ 21.000`; el formato moneda de Excel con decimales, `$ 21.000,00`, se rechaza: quítale los decimales); el de la línea, repetido en cada variante. Obligatorio si es un ingreso |
  | `proveedor` | dueño | Opcional; nombre de un proveedor activo creado en `/admin`, sin distinguir mayúsculas |

  ```
  variantId;marca;linea;variante;lineSlug;variantSlug;stockSistema;cantidad;costoUnitario;proveedor
  0192…;LifePod;LifePod ECO 3;Mango Ice;lifepod-eco-3;mango-ice;0;12;21000;Distribuidora Norte
  0192…;LifePod;LifePod ONE;Electric Blue;lifepod-one;electric-blue;0;0;;
  ```

  *Qué registra cada fila.* Si la variante tenía stock 0 y se contó algo, un
  `inbound` con costo y proveedor. Si ya tenía stock, un `adjustment` por la
  diferencia con motivo «Conteo físico inicial `<lote>`» (el libro solo guarda
  costo y proveedor en ingresos: en ese caso se ignoran con un aviso). Si la
  cantidad coincide con el stock, nada (si había costo escrito, un aviso dice
  que se descarta). Cada movimiento pasa por
  `stockService.recordMovement`: bloquea la variante, queda en `AuditLog` firmado
  por el owner de `--user-email` y lleva la `operationKey`
  `conteo-inicial:<lote>:<lineSlug>/<variantSlug>`. Repetir el mismo `--batch`
  no duplica (las filas ya registradas salen como «ya registradas»); corregir
  una fila ya aplicada exige un `--batch` nuevo, que registra el ajuste.

  *Validación.* Sin `--apply` es un dry-run que lee la base y no escribe nada.
  El informe lista los movimientos, los errores con su número de fila de Excel
  (cantidad o costo inválidos, `variantId` inexistente o inactivo, filas
  repetidas o desplazadas, proveedor inexistente, inactivo o ambiguo entre los
  activos, ingreso sin costo), las variantes activas sin fila, los avisos y los totales por línea.
  Con un solo error o una variante sin fila, `--apply` no escribe nada. Con
  `--apply` pide escribir el lote para confirmar, recalcula el plan y aborta si
  difiere de la vista previa confirmada (variante, tipo, cantidad, costo o
  proveedor). Cada movimiento lleva el stock con el que se calculó
  (`expectedStock`) y `recordMovement` lo comprueba bajo el bloqueo de la
  variante: si una venta entró en medio, se detiene con `STOCK_CHANGED`. Ante
  cualquier fallo informa cuántos movimientos se aplicaron; repetir el mismo
  lote continúa donde quedó sin duplicarlos. Para reconocer las filas ya
  registradas se usa el saldo del libro tras el movimiento del lote, que
  `listMovements` ordena por fecha y desempata por id (UUIDv7).

  **El dry-run se revisa fila a fila.** Ordenar una sola columna en Excel
  (p. ej. `cantidad` sin extender la selección) mueve las cantidades a otras
  variantes sin tocar `variantId` ni los slugs, y eso no se puede detectar:
  compara en el informe cada «fila N: ingreso/ajuste» con lo contado.

  *Procedimiento* (decisiones `dec-quien-cuenta-y-cuando` y
  `dec-proveedores-y-costo-del-inventario-inicial`): los proveedores se crean
  antes en `/admin`; el conteo se hace de una vez con la tienda cerrada y **sin
  ventas entre el conteo y el `--apply`**. Ejecutar los comandos desde
  **PowerShell o cmd**: en Git Bash el script no detecta la terminal y la
  confirmación del `--apply` no llega. npm los ejecuta desde `backend/`, así
  que las rutas relativas parten de ahí. Sin `--out` la planilla va a
  `backend/scripts/data/conteo-<fecha>.csv`, ignorada por git; la alternativa es
  Documentos (`--out "%USERPROFILE%\Documents\conteo.csv"` en cmd o
  `--out "$env:USERPROFILE\Documents\conteo.csv"` en PowerShell). No usar
  `../../`: desde `backend/` es `C:\`, donde un usuario normal no puede
  escribir. La planilla lleva costos: el exportador se niega a escribirla en
  otro sitio del repo y a sobrescribir un archivo sin `--force`.

  ```powershell
  npm run infra:env-backend
  npm run infra:db-tunnel        # en otra terminal; dejarla abierta
  npm run db:count-template --workspace=backend          # escribe backend/scripts/data/conteo-<fecha>.csv
  # rellenar en Excel y guardar como CSV (UTF-8 o delimitado por comas)
  npm run db:import-stock --workspace=backend -- --file scripts/data/conteo-<fecha>.csv --user-email <owner> --batch 2026-11
  npm run db:import-stock --workspace=backend -- --file scripts/data/conteo-<fecha>.csv --user-email <owner> --batch 2026-11 --apply
  npm run db:import-stock --workspace=backend -- --file scripts/data/conteo-<fecha>.csv --user-email <owner> --batch 2026-11 --apply   # 0 creados
  ```

  Después, revisar el kardex de algunas variantes y `GET
  /api/admin/stock/image-alerts`.

- **El catálogo público sale de la base.** Solo se sirven productos `published`
  con precio; tras la semilla todos están en borrador, así que `/api/products`
  devuelve una lista vacía hasta que se publiquen desde la consola (A5.3). Sin
  túnel la API responde 500 y el frontend usa `FALLBACK_PRODUCTS`.
- **Dos credenciales.** `DATABASE_URL` usa el rol `vapeupar_app` (runtime, sin DDL);
  `MIGRATE_DATABASE_URL` usa el maestro y solo la lee el CLI de Prisma.
- **Nueva migración:** `npm run db:migrate:create --workspace=backend -- --name <nombre>`
  una sola vez, revisar el SQL y aplicar con `npm run db:migrate`. Si crea una
  tabla, la misma migración debe conceder sus permisos a `vapeupar_app`.
  Sin base a mano, la migración se puede escribir desde el esquema anterior:
  `npx prisma migrate diff --from-schema <anterior.prisma> --to-schema prisma/schema.prisma --script`
  (desde `backend/`; no conecta a nada).
- **Pedidos (ADR-003), migración `20261120120000_orders`.** Se aplica con la
  release (`migrate deploy` al activar): es aditiva y segura. El endpoint
  público sigue apagado tras `ORDERS_ENABLED` hasta la aprobación del dueño y la
  revisión legal.
  Crea `orders`, `order_lines` y `order_consents` y añade
  `stock_movements.unit_price`; solo es aditiva. Concede a `vapeupar_app`
  `SELECT`/`INSERT` en las tres, `UPDATE` solo en las columnas que cambian las
  transiciones y la anonimización (`orders`) y el precio cobrado
  (`order_lines.unit_price`), y ningún `DELETE`; `order_consents` es solo
  inserción. `db:sync-app-role` no cambia: solo gestiona la contraseña.

## Endpoints Disponibles

### 1. `GET /health`
Verifica el estado del servicio y el timestamp del servidor.
**Respuesta:**
```json
{
  "status": "ok",
  "service": "vapeupar-backend",
  "timestamp": "2026-10-21T20:00:00.000Z"
}
```

### 2. `GET /api/products`
Obtiene la lista de productos filtrables y paginados.
- **Parámetros de consulta validados con Zod:**
  - `category`: `disposables` | `pod-systems` | `mods-tanks` | `salt-nic` | `freebase-liquids` | `coils-accessories`
  - `brand`: slug de la marca (`lifepod`), que es lo que usa el sitio; también acepta el nombre sin distinguir mayúsculas (`LifePod`)
  - Cada producto trae `brand` (nombre visible) y `brandSlug` (identificador estable)
  - `search`: búsqueda libre por nombre, descripción, sabor o etiquetas (máx. 100 caracteres)
  - `nicotine`: filtro por concentración de nicotina (ej: `50mg`, `35mg`, `0mg`)
  - `minPrice`: precio mínimo en COP (entero positivo)
  - `maxPrice`: precio máximo en COP (entero positivo)
  - `featured`: `true` | `false`
  - `page`: número de página (por defecto `1`)
  - `limit`: productos por página (por defecto `20`, máx. `50`)
  - `sortBy`: `price` | `name` | `puffCount`
  - `sortOrder`: `asc` | `desc` (por defecto `asc`)

**Respuesta Exitosa (200 OK):**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 6,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

**Respuesta de Error de Validación (400 Bad Request):**
```json
{
  "success": false,
  "message": "Parámetros de consulta inválidos",
  "errors": [
    {
      "field": "minPrice",
      "message": "El precio mínimo no puede ser mayor que el precio máximo"
    }
  ]
}
```

### 3. `GET /api/products/categories`
Obtiene las categorías disponibles con su conteo de productos.

### 4. `GET /api/products/id/:id`
Obtiene un producto por su identificador único interno (UUID). Un id con otro formato, o de un producto en borrador, responde 404.

### 5. `GET /api/products/:slug`
Obtiene los detalles completos de un producto por su slug alfanumérico amigable (ej. `lifepod-eco-pro`).

### Variantes en el producto público

Todas las respuestas de producto (`/api/products`, `/id/:id` y `/:slug`) traen
`variants`: los sabores o colores **activos** de la línea, en el orden de la
consola (`sortOrder` y luego nombre). Una variante inactiva no aparece; una
agotada sí, con `inStock: false`, para que la ficha pueda enseñarla y ofrecer
la consulta por WhatsApp.

```json
"variants": [
  {
    "id": "01a1…",
    "kind": "flavor",
    "name": "Mango Ice",
    "slug": "mango-ice",
    "imageUrl": "",
    "inStock": true,
    "stock": 7
  }
]
```

- `kind`: `flavor` | `color`.
- `slug` es único dentro de su línea, no en el catálogo; la ficha lo usa en `?sabor=`.
- `imageUrl` vacía = sin foto propia, se usa la de la línea.
- `stock` sale de la caché del libro de inventario y nunca es negativo. El
  `stock` de la línea es la suma de sus variantes.
- `search` también busca en el nombre de las variantes: `?search=mango` encuentra
  la línea que tiene ese sabor.

El precio es de la línea, no de la variante (ADR-002 §3). No hay endpoint de
pedidos: el carrito vive en el navegador y el pedido se envía por WhatsApp
(ADR-001 §3, `frontend/src/lib/cart.ts`).

### 6. `GET /api/content/:key` (A7.2)

Texto vigente de una clave del contenido editable del sitio, sin sesión.
Claves: `hero`, `trust-band`, `faq`, `seo`, `contact`. Cualquier otra —incluidos
los ajustes internos `setting.*`, que viven en la misma tabla— es `400`.

```json
{
  "success": true,
  "data": {
    "key": "faq",
    "value": { "title": "Preguntas frecuentes", "intro": "…", "items": [ … ] },
    "source": "published",
    "version": 3,
    "publishedAt": "2026-11-18T15:00:00.000Z"
  }
}
```

- Una clave nunca publicada **no es 404**: responde con el valor por defecto en
  código y `source: "default"`, `version: null`. Lo mismo si la última fila no
  cumple el esquema (una anterior a A7.1); el backend lo avisa en el log.
- Si la base falla, `500`: el frontend cae entonces a su propio respaldo.

**Esquemas** (`backend/src/schemas/content/`, uno por clave, con límites de
longitud y objetos estrictos):

| Clave | Forma | Dónde se pinta |
|---|---|---|
| `hero` | `label` (32), `tagline` (32) | Etiqueta pixel y reclamo de la intro |
| `trust-band` | `items`: **exactamente 3** de `label` (16), `title` (48), `detail` (80) y, opcionales, `icon` (`delivery` \| `original` \| `payment`), `highlight` (24) y `points` 1–2 (60). Sin enlaces | Tarjetas del panel de información |
| `faq` | `title` (60), `intro` (200), `items`: 1–11 de `question` (160), `answer` (800), **sin** la pregunta legal | FAQ de la portada |
| `seo` | `title` (70), `description` (160), `keywords` 1–20 (40), `openGraph` y `twitter` con `title` (70) y `description` (200) | Metadatos de `layout.tsx` |
| `contact` | `about` (240), `location` (80), `hours` 1–4 (60), `service` 1–6 (60) | Pie de página |

Los campos opcionales de `trust-band` llegaron con el rediseño de las tarjetas
(2026-11): son opcionales para que una fila publicada antes, con solo `label`,
`title` y `detail`, siga validando sin migración. El sitio pone el icono de la
posición si falta y no pinta el dato ni las líneas que no vengan. El copy por
defecto es prudente a propósito (sin tiempos, horarios ni zonas fuera de
Valledupar; el QR condicionado) hasta que el dueño confirme entrega y pago.

El teléfono y el WhatsApp **no** son contenido editable: siguen en variables de
entorno, para que nadie pueda desviar pedidos cambiando un número sin desplegar.

Una respuesta de la FAQ puede llevar el marcador `{marcas}`: el sitio lo cambia
por las marcas aliadas de `GET /api/brands/partners` («LifePod», «A y B»…), o
por «nuestras marcas aliadas» si no hay lista. Así la FAQ no nombra marcas que
ya no se venden (ADR-002 §5). El marcador solo vale en la FAQ: en cualquier
otra clave, publicar es `400`.

**La pregunta legal +18 de la FAQ no es contenido** (decisión
`dec-texto-legal-de-mayoria-de-edad`, 2026-11-19): la de la cédula obligatoria
(Ley 1335 de 2009) vive en código como `LEGAL_FAQ_ITEM` y el sitio la inserta
siempre en la cuarta posición (`LEGAL_FAQ_INDEX`). `faq.items` guarda solo las
editables, de ahí el máximo de 11. `stripLegalFaqItem` quita cualquier pregunta
igual (sin mirar espacios, mayúsculas, tildes ni signos de puntuación) **al
publicar, al restaurar y al leer**: una versión antigua que la lleve dentro no la
duplica, y nadie puede quitarla ni cambiarla desde la consola. Al leer, además,
una FAQ antigua con más de 11 preguntas editables se recorta a 11
(`normalizeFaqForRead`, con aviso en el log) en vez de caer al texto por defecto.
No hizo falta migración de datos.

El frontend lleva un **espejo** de estos esquemas en
`frontend/src/lib/content/schemas.ts`; `content-parity.test.ts` compara ambos
(JSON Schema, valores por defecto, la pregunta legal y su filtrado) y falla si
divergen.

### 7. `GET /api/brands/partners` (A7.4)

Marcas aliadas **activas** (`isPartner` y `active`), en el orden de la consola.
Solo nombre y slug:

```json
{ "success": true, "data": [{ "name": "LifePod", "slug": "lifepod" }] }
```

### 8. `POST /api/orders` (ADR-003)

El sitio registra el pedido antes de abrir WhatsApp. **Apagado por defecto**:
solo existe con `ORDERS_ENABLED=true` (ni `write-env.mjs` ni `infra/` lo
encienden); sin él responde el 404 genérico. Se enciende tras la aprobación del
dueño y la revisión legal de la política (ADR-003, Estado).

Público, con límite propio de **10 pedidos por IP cada 15 minutos**
(`rateLimits.ordersMax`) además del general; solo cuentan los que crean o
repiten un pedido (`skipFailedRequests`), porque con CGNAT móvil muchos clientes
comparten IP y un error de tecleo no debe gastarles el cupo. Cuerpo
**estricto** (`schemas/order.schema.ts`):

```json
{
  "submissionKey": "UUID generado por el navegador una vez por envío",
  "customer": { "name": "Ana Pérez", "phone": "300 123 4567", "neighborhood": "Novalito" },
  "consent": { "accepted": true, "policyVersion": "borrador-2026-11-20" },
  "lines": [{ "variantId": "uuid", "quantity": 2 }]
}
```

- **No hay precio en el cuerpo**: el servidor lo toma del catálogo (línea
  publicada con precio, variante activa). Un campo de más es `400`.
- El teléfono se normaliza a `+573XXXXXXXXX` (móvil colombiano); nombre y barrio,
  2–80 caracteres sin marcas. Hasta 20 líneas de 1–10 unidades, sin variantes
  repetidas.
- `consent.policyVersion` tiene que ser la vigente (`DATA_POLICY_VERSION`); la
  política es un **borrador pendiente de revisión legal**. Se guarda versión,
  finalidad y fecha del servidor en `order_consents`.
- La referencia `VP-XXXXXX` la genera el servidor. Un pedido recibido **no
  reserva stock**; si una línea no se puede pedir o no alcanza el disponible,
  `409 UNAVAILABLE` con `lines: [{ variantId, reason, available? }]` y no se crea
  nada.
- Respuesta mínima: `201 { "success": true, "data": { "reference": "VP-…", "subtotal": 90000 } }`.
  Un reintento con la misma `submissionKey` responde `200` con lo mismo; con otras
  líneas, `409 CONFLICT`. No existe ninguna lectura pública de pedidos.
