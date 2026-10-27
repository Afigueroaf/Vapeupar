# ADR-002: Consola de Administración, Persistencia y Modelo de Inventario

## Estado
Aceptado — 2026-10-26. Implementación iniciada (entorno dev en AWS desplegado).

Decisiones cerradas el 2026-10-26:

- Proveedor de infraestructura: **AWS** (decisiones 1, 6, 8 y 9). Sustituye a
  Supabase, elegido en una revisión anterior del mismo día; el motivo del cambio
  está en «Alternativas consideradas».
- **Precio por línea** (decisión 3).
- **Se mantienen las 6 categorías actuales**, sin cambio de taxonomía ni de
  contrato de API.

Supersede parcialmente la **Capa de Datos** de [ADR-001](001-stack-and-architecture.md)
(«servicio desacoplado en memoria»). El resto de ADR-001 (stack, desacoplamiento
frontend/backend, checkout por WhatsApp, age gate) sigue vigente sin cambios.

## Contexto

El catálogo vive hoy en dos arrays de TypeScript compilados:
`backend/src/data/mock-products.ts` (fuente) y `frontend/src/data/fallback-products.ts`
(copia manual). De ahí se derivan tres problemas que bloquean la operación real
del negocio:

1. **No existe fuente de verdad escribible.** Ninguna consola puede escribir en un
   array compilado. Cambiar un precio o descontar una unidad vendida exige editar
   código, duplicar el cambio en el frontend y volver a desplegar. La duplicación
   ya produjo divergencias de texto entre ambas copias
   (`docs/audit-and-fragile-points.md`, F-07).
2. **No existe modelo de inventario ni de abastecimiento.** `stock: 24` es un
   entero escrito a mano. No hay entidades de proveedor, ni de marca (la marca es
   un `string` libre dentro de cada producto), ni historial de movimientos. No se
   puede responder «¿por qué el disponible no coincide con la bodega?» ni «¿cuánto
   costó este lote?».
3. **El contenido del sitio está incrustado en componentes.** Las marcas aliadas
   aparecen escritas a mano en `frontend/src/components/faq.tsx`, las keywords de
   SEO en `frontend/src/app/layout.tsx`, y los bloques de confianza en
   `trust-band.tsx`. Cualquier cambio comercial exige un despliegue.

Un cuarto hecho condiciona el modelo: los archivos de `assets/brands/lifepod/`
describen **marca → línea → variante** (23 sabores en `eco-3/`, 49 en `eco.pro/`,
7 colores en `ONE/`, y `fit/` sin variantes todavía). Esos archivos aportan el
*catálogo de variantes con su imagen*, **no stock**: el stock no existe en ninguna
parte del proyecto y hay que crearlo. El modelo actual, con un producto por sabor
y `specs.flavorProfile` como texto libre, convertiría una sola línea en 49 filas
casi idénticas y 49 tarjetas en el grid.

## Decisión

### 1. Persistencia: Amazon RDS for PostgreSQL + Prisma, propiedad exclusiva del backend

El catálogo, el inventario y el contenido se mueven a **RDS for PostgreSQL 18**
en AWS, con Prisma como capa de acceso a datos. Prisma, el SDK de AWS y toda
credencial viven **solo** en `backend/`. El frontend no instala Prisma ni el SDK
de AWS, no recibe ninguna credencial y sigue consumiendo exclusivamente REST,
según la regla de desacoplamiento de `docs/architecture.md` §2.

Reglas de red y acceso:

- **La base de datos no es accesible desde internet.** Vive en subredes aisladas
  (sin ruta a internet) de una VPC propia de Vapeupar, con `publiclyAccessible:
  false`. Su grupo de seguridad solo admite el puerto 5432 desde el bastión y,
  en producción, desde el cómputo del backend.
- **Desde el portátil se llega por túnel de AWS Systems Manager** a través de un
  bastión sin puertos de entrada (`npm run infra:db-tunnel`). No hay SSH, ni
  claves de instancia, ni listas de IPs que mantener.
- **La credencial maestra la genera RDS en Secrets Manager**
  (`vapeupar/<env>/rds-master`). No se escribe a mano en ningún sitio; en
  desarrollo, `npm run infra:env-backend` la lleva a `backend/.env`, que está
  ignorado por git.
- Sin pooler: con un solo proceso de backend, Prisma conecta directo. Si en el
  futuro el backend escala horizontalmente o pasa a funciones, se añade RDS Proxy.

Los arrays actuales no se borran: se degradan a **semilla** (`prisma/seed.ts`) y a
**fallback de presentación** en el frontend para el caso de API caída.

### 2. El stock es un libro de movimientos, no un entero mutable

```
StockMovement {
  id, variantId, tipo: ingreso | venta | ajuste | merma | devolucion,
  cantidad (entero con signo), motivo, supplierId?, costoUnitario?, lote?,
  userId, operationKey (idempotencia), createdAt
}
```

El disponible de una variante es la suma de `cantidad` sobre su libro. Se admite
un contador cacheado (`Variant.stockCache`) por rendimiento, pero el libro es la
autoridad y existe un comando de reconciliación que lo recalcula.

Razón: con un entero mutable, un descuadre entre pantalla y bodega no es
diagnosticable. Con el libro se sabe quién lo tocó, cuándo y por qué; el conteo
físico se registra como `ajuste` con motivo en lugar de sobreescribir el valor; y
el costo promedio y el margen por proveedor salen de los movimientos de `ingreso`.

### 3. Modelo de entidades

```
Supplier { id, nombre, nit?, contacto, whatsapp, condicionesPago, notas, activo }
Brand    { id, nombre, slug, logoUrl, esAliada, orden, activa }
BrandSupplier (N↔N entre Brand y Supplier)
Product  { id, slug, brandId, categoria, nombre, descripcion, shortDescription,
           specs(JSON), precio, precioAnterior?, estado: borrador | publicado }
Variant  { id, productId, tipo: flavor | color, nombre, slug, imageUrl,
           activa, stockCache }
StockMovement (arriba)
SiteContent { clave, valor(JSON), version, publicadoEn, userId }
AuditLog { id, userId, entidad, entidadId, accion, antes(JSON), despues(JSON), createdAt }
User     { id (= sub de Cognito), email, rol: owner | operador, activo }
```

Tres reglas del modelo:

- **`Product` es la línea, `Variant` es el sabor o el color.** LifePod ECO PRO es
  un producto con 49 variantes, no 49 productos. La imagen de línea
  (`ECO-PRO.webp`, `eco-3.webp`, `one.webp`, `FIT.webp`) es la del producto; la de
  variante es la del archivo de sabor.
- **Marca aliada y proveedor son entidades distintas, relacionadas N↔N.** La marca
  es lo que ve el cliente (LifePod, con logo y presencia en la landing); el
  proveedor es de quién se compra, y un distribuidor puede traer varias marcas.
- **`Variant.activa` no significa «con stock».** Una variante descontinuada se
  desactiva y desaparece del sitio; una agotada sigue visible como «Consultar
  reposición», comportamiento que `product-card.tsx` ya implementa.

**El precio es de la línea, no de la variante.** Todos los sabores de ECO PRO
cuestan lo mismo, así que `Variant` no tiene campo de precio: cambiar el precio de
una línea es una sola edición, no 49. `precioAnterior` conserva el precio tachado
que hoy muestra la etiqueta «Oferta» de la tarjeta (`compareAtPrice`). Si algún día
una variante necesita precio propio, se añade `Variant.precio` como columna
nullable con fallback al de la línea: es un cambio aditivo que no rompe contratos.

Los precios se almacenan como **entero en pesos colombianos**, nunca `float`.
Nada se borra físicamente: borrado lógico con `activo: false`, porque las
variantes tienen historial de movimientos referenciado.

### 4. La consola es `/admin` en el frontend, sobre `/api/admin/*`

La consola se construye como un grupo de rutas protegidas dentro de la app Next
existente (`frontend/src/app/(admin)/`), reutilizando el sistema visual VP y las
primitivas de `components/ui/`. Toda escritura pasa por endpoints REST
`/api/admin/*` del backend; la lógica de inventario vive en
`backend/src/services/` (regla de `docs/architecture.md` §2).

**Puente temporal admitido:** AdminJS montado en el propio Express sobre el mismo
esquema de Prisma, bajo una ruta separada y con la misma sesión, para poder
operar el stock antes de que `/admin` esté terminado. Es desechable por
definición: cuando `/admin` cubre los flujos, se apaga y se retira la dependencia.
No se le añade lógica de negocio propia.

### 5. El contenido del sitio es dato tipado, con fallback en código

Los textos editables (FAQ, banda de confianza, copy del hero, keywords de SEO,
datos de contacto) pasan a `SiteContent`, cada clave con su **esquema Zod**
compartido entre backend y frontend. La consola genera el formulario desde el
esquema y valida al guardar.

El frontend lee el contenido en Server Component **con fallback a los valores por
defecto en código**: si la API no responde, el sitio se sirve con el texto actual
en lugar de vacío — el mismo criterio que ya aplica `FALLBACK_PRODUCTS`.

La lista de marcas aliadas en la FAQ y en la landing se **genera** a partir de
`Brand.esAliada = true`. No se vuelve a escribir a mano, para que no quede
nombrando marcas que ya no se venden.

### 6. Autenticación con Amazon Cognito, mediada por el backend

La identidad y las contraseñas las gestiona un **User Pool de Cognito**: no se
guardan hashes propios ni se firman tokens a mano. Pero el navegador no habla con
Cognito:

- El login entra por `POST /api/admin/auth/login` del backend, que autentica con
  un **cliente confidencial** de Cognito (con secreto, flujo
  `USER_PASSWORD_AUTH`) y guarda los tokens en cookies `httpOnly` + `Secure` +
  `SameSite=Strict`. Nada de tokens en `localStorage` ni en JavaScript del cliente.
- En cada petición a `/api/admin/*`, el middleware verifica la firma del access
  token contra las claves públicas (JWKS) del User Pool y lo renueva con el
  refresh token cuando expira. La revocación de tokens está activada.
- El **rol** (`owner` / `operador`) vive en la tabla propia `User`, enlazada por
  el `sub` de Cognito, y lo resuelve el backend. Existir en Cognito no da acceso a
  la consola si no existe la fila en `User` con `activo: true`.
- El registro público está **desactivado** en el User Pool. Las altas se hacen
  por invitación desde el backend (`AdminCreateUser`, rol `owner`): Cognito envía
  una contraseña temporal que se cambia en el primer acceso. Nunca hay
  contraseñas en variables de entorno.
- MFA por TOTP: opcional en desarrollo, **obligatorio en producción**.
- Correo: en desarrollo, el correo integrado de Cognito (límite diario bajo,
  suficiente para invitar a pocas personas). En producción, Amazon SES con
  dominio verificado.

Roles `owner` y `operador` desde el primer día, aunque hoy exista un solo
usuario. `/api/admin/*` lleva un rate limit propio más estricto que el
público (hoy `/api` entero usa 100 req/min) y queda fuera de la política CORS del
sitio público. Toda mutación valida con Zod en el borde, igual que ya hacen las
lecturas con `ProductQuerySchema`.

### 7. Publicación con revalidación on-demand, conservando SSR

Tras una escritura relevante, el backend invoca una ruta de revalidación del
frontend con un secreto compartido, que ejecuta `revalidateTag()` sobre las
etiquetas `catalogo` y `contenido`. El catálogo **no** se mueve a fetching en
cliente: el SEO orgánico es un objetivo declarado en ADR-001 y el renderizado en
servidor se mantiene.

### 8. Imágenes en S3 servidas por CloudFront

Las imágenes de producto y los logos de marca viven en un bucket de **S3
privado** (bloqueo de acceso público total), servido por una distribución de
**CloudFront** con Origin Access Control: CloudFront es el único lector del
bucket. La escritura entra **solo con URL prefirmada de subida (PUT)**, que emite
el backend tras validar sesión, tipo y tamaño; la consola sube el archivo directo
a S3 con esa URL y el backend guarda la clave resultante. La única regla CORS del
bucket es ese PUT desde el origen de la consola.

`next.config.ts` autoriza en `remotePatterns` el dominio de la distribución de
CloudFront, no `*.amazonaws.com`. No se versionan 80 archivos `.webp` en el
repositorio ni se sirven desde `frontend/public/`, que no es escribible en
producción y no sobrevive un despliegue.

### 9. Infraestructura como código con AWS CDK, en una cuenta compartida con DeliPan

Toda la infraestructura de Vapeupar se declara en TypeScript con **AWS CDK** en
el workspace `infra/`. Nada se crea a mano en la consola: lo que no está en
`infra/` no existe para el proyecto. La configuración de cada entorno (dev y
prod) vive en `infra/lib/config.ts`, de modo que pasar a producción consiste en
revisar sus diferencias y desplegar, no en escribir infraestructura nueva.

La cuenta AWS (`342284838697`) **es compartida con la infraestructura de staging
de DeliPan**, creada a mano y sin CloudFormation. La separación se garantiza así:

| Mecanismo | Vapeupar | DeliPan |
|---|---|---|
| Etiquetas | `Project=Vapeupar`, `Environment=<env>`, `ManagedBy=cdk` en todo recurso | `Project=Delipan`, `Environment=staging` (incompletas en la red) |
| Nombres físicos | Prefijo `vapeupar-<env>-` | Prefijo `delipan-staging-` |
| Stacks de CloudFormation | `Vapeupar-<env>-*` y `CDKToolkit-Vapeupar` | Ninguno |
| Toolkit de CDK | Qualifier propio `vapeupar` (roles `cdk-vapeupar-*`) | No usa CDK |
| Red | VPC propia `10.50.0.0/16` (dev) y `10.51.0.0/16` (prod) | VPC `10.42.0.0/16` |
| Parámetros | `/vapeupar/<env>/*` en SSM | `/delipan/staging/*` |
| Secretos | `vapeupar/<env>/*` en Secrets Manager | SSM SecureString |
| Costos | Presupuesto propio filtrado por etiqueta + grupo de recursos | Presupuesto general de la cuenta |

Los rangos de red no se solapan, para que un peering futuro sea posible sin
renumerar. La separación por cuenta (AWS Organizations, una cuenta por proyecto)
es el aislamiento fuerte y se evalúa en la transición a producción
(`docs/infrastructure-aws.md` §8).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| **Supabase (PostgreSQL + Auth + Storage)** | Elegido en una primera revisión y sustituido el mismo día. No aloja el backend Express, que igualmente necesitaba otro proveedor; expone por defecto las tablas a internet vía su Data API, lo que obligaba a mitigaciones (desactivarla, RLS en cada tabla); y el equipo ya dispone de créditos en una cuenta AWS. AWS concentra base de datos, autenticación, imágenes y cómputo del backend en una sola cuenta, con la base sin acceso público por diseño |
| **Neon + storage y auth por separado** | Postgres equivalente, pero suma dos proveedores más que integrar y mantener (storage y librería de sesiones), y tampoco aloja el backend |
| **RDS pública con lista de IPs, en lugar de bastión** | Más simple el primer día, pero la IP doméstica cambia, la base queda expuesta a internet y la topología de dev se aleja de la de prod. El bastión SSM cuesta ~10 USD/mes y mantiene la base privada en ambos entornos |
| **Cuenta AWS separada para Vapeupar (AWS Organizations)** | Es el aislamiento más fuerte, pero convertir la cuenta actual en cuenta de gestión de una organización afecta también a DeliPan. Se pospone a la transición a producción; mientras tanto, la separación es por etiquetas, nombres, VPC y toolkit de CDK (decisión 9) |
| **Precio por variante** | Ningún sabor cuesta distinto de su línea; multiplicaría por 49 cada cambio de precio en la consola sin beneficio. Queda como extensión aditiva (decisión 3) |
| **Seguir con arrays en TypeScript** | Imposible de administrar sin despliegue; mantiene F-07. Descartada por el objetivo mismo del ADR |
| **CMS headless (Strapi / Directus / Payload) como dueño del modelo** | Resuelve el CRUD, pero el modelo de datos pasa a ser propiedad del CMS, y un inventario con libro de movimientos e idempotencia no es un caso de uso de CMS. Express quedaría como capa delgada sin reglas de negocio, contra `docs/architecture.md` §2 |
| **Next.js con Prisma o SDK de AWS directo, sin Express** | Más corto, pero rompe la regla de desacoplamiento del proyecto y deja sin API a los consumidores futuros (POS, app móvil) previstos en ADR-001 |
| **Hoja de cálculo o NocoDB + script de sincronización** | Cero desarrollo, pero sin integridad referencial, sin auditoría y sin validación. Aceptable como puente de días, no como arquitectura |
| **AdminJS como consola definitiva** | UI genérica, ajena al sistema visual VP, y los flujos propios (ajuste masivo, kardex, alertas de bajo stock) quedan forzados. Se conserva solo como puente (decisión 4) |

## Consecuencias

**A favor**

- Desaparece la duplicación de datos: F-07 queda cerrado por construcción.
- El negocio puede operar stock, marcas y proveedores sin tocar código ni desplegar.
- El libro de movimientos deja trazabilidad y habilita costo, margen y conteos físicos.
- El modelo de variantes refleja el inventario real: 4 productos LifePod con sus
  variantes en lugar de ~79 filas planas, y resuelve el punto 6.7 de
  `docs/design-reset-inventory.md` (jerarquía marca / modelo / sabor).
- La API REST queda lista para POS o app móvil, como anticipaba ADR-001.

**En contra / costos asumidos**

- Entra infraestructura que operar: red, permisos IAM, copias de seguridad,
  parches del bastión. CDK reduce el riesgo de error al hacerla revisable y
  repetible, pero no elimina el trabajo de entender lo que se despliega.
- **Costo.** El entorno dev cuesta del orden de 26 USD/mes, cubiertos hoy por los
  créditos del plan gratuito de AWS, compartidos con DeliPan (detalle y fecha
  estimada de agotamiento en `docs/infrastructure-aws.md` §6.1). Al agotarse los
  créditos o vencer el plan hay que pasar la cuenta a plan de pago (decisión
  conjunta con DeliPan); el presupuesto propio avisa al 80 %.
- **Acoplamiento a AWS contenido.** La base es PostgreSQL estándar detrás de
  Prisma y se migra a cualquier Postgres cambiando la URL. Cognito y S3 sí son
  específicos de AWS; se contienen en `backend/src/services/auth.service.ts` y
  `storage.service.ts` para que un cambio de proveedor toque dos archivos.
- **Cuenta compartida con DeliPan.** Un error de permisos o un borrado manual en
  consola puede afectar a ambos proyectos. Mitigación: todo recurso de Vapeupar
  se gestiona por CDK, lleva sus etiquetas y su prefijo, y no se modifica nada
  de DeliPan desde este repositorio.
- `Product` deja de ser plano: se añade un nivel de anidación que afecta la
  tarjeta, el catálogo, los filtros y el mensaje de WhatsApp.
- Los tipos compartidos crecen y hay que mantenerlos sincronizados entre
  `backend/src/types/` y `frontend/src/types/` (regla de la skill `database`)
  hasta que exista un paquete de workspace que los centralice.
- Aparece una superficie autenticada, con sus propias obligaciones de seguridad.

**Rupturas conocidas**

- `backend/src/services/product.service.test.ts` está acoplado al contenido del
  mock (`total === 6`, `disposables === 2`, búsqueda `mango` con 1 resultado,
  `getById('prod-002')` devolviendo Geekvape): se reescribe contra un fixture propio.
- `ProductService` construye su estado con `[...MOCK_PRODUCTS]`; pasa a recibir un
  repositorio por constructor.
- `next.config.ts` solo autoriza `images.unsplash.com`.
- La taxonomía de categorías está declarada en cinco lugares (tipos del backend,
  `CategoryEnum`, `getCategories()`, tipos del frontend y `CATEGORIES` en
  `product-catalog.tsx`); cualquier cambio de taxonomía los toca todos.

**Sobre los slugs.** La skill `database` prohíbe alterar slugs existentes para no
romper URLs indexadas. Los seis slugs actuales son de datos de muestra que nunca
se publicaron, así que la migración los reemplaza sin deuda de SEO. **A partir de
la migración la regla aplica en firme**: un slug publicado es inmutable, y
renombrarlo exige redirección 301.

## Invariantes que este ADR fija

1. El frontend no accede a la base de datos ni a ningún servicio de AWS, y no
   recibe ninguna credencial. Solo REST del backend.
2. La lógica de inventario, precios y publicación vive en `backend/src/services/`.
3. El libro de movimientos es la autoridad del stock; cualquier contador es caché.
4. Ninguna escritura entra sin validación Zod y sin registro en `AuditLog`.
5. La base de datos nunca es accesible desde internet: solo desde dentro de su
   VPC (backend y bastión).
6. El contenido del sitio siempre tiene fallback en código: la caída de la API
   degrada el contenido, nunca tumba la página.
7. Todo cambio de contrato de API se refleja en `docs/backend.md` en el mismo
   commit (regla de `docs/architecture.md` §2).
8. Todo recurso AWS de Vapeupar se crea desde `infra/` y lleva
   `Project=Vapeupar`. Nada de DeliPan se modifica desde este repositorio.
