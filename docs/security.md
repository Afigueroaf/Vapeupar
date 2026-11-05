# Seguridad y Cumplimiento Normativo - Vapeupar

## 1. Verificación de Mayoría de Edad (+18 / Age Gate)
- **Marco Legal**: La legislación colombiana (Ley 1335 de 2009 y normativas complementarias) y estándares internacionales prohíben estrictamente la comercialización, suministro y promoción de vaporizadores y productos con o sin nicotina a menores de 18 años.
- **Implementación Técnica en Frontend**:
  - Modal bloqueante en la primera visita (`AgeVerificationModal`) con soporte completo de accesibilidad WCAG (`role="dialog"`, `aria-modal="true"` y trampa de foco).
  - **Expiración de 30 días (TTL)**: Almacena la marca temporal en milisegundos (`vapeupar_age_verified_at`) en `localStorage`. Si transcurren más de 30 días, la verificación expira automáticamente y vuelve a solicitarse.
  - Bloqueo de navegación e interacción si el usuario declara ser menor de edad.
  - Advertencia obligatoria de salud visible de manera permanente en el pie de página de la aplicación.
  - **Validación Física en Terreno**: Protocolo de entrega local que instruye a los domiciliarios en Valledupar a solicitar la Cédula de Ciudadanía física antes de entregar cualquier paquete.

## 2. Seguridad en la API Backend
- **Cabeceras HTTP de Protección (Helmet)**:
  - Mitigación de Clickjacking con `X-Frame-Options`.
  - Prevención de ataques MIME-sniffing con `X-Content-Type-Options: nosniff`.
  - Aislamiento de recursos entre orígenes (`cross-origin`).
- **Limitación de Tasa (Rate Limiting)**:
  - Tres límites con `express-rate-limit`, del más estricto al más laxo, y los tres se aplican a la vez: **10 intentos fallidos por 15 minutos** en `/api/admin/auth/login` (solo cuenta los fallos, para no penalizar a quien acierta), **30 por minuto** en `/api/admin` y **100 por minuto** en `/api/*`. Una ráfaga contra la consola se corta por su propio límite antes que por el del público.
  - La IP se toma de la conexión y no de `X-Forwarded-For` salvo que `TRUST_PROXY` declare cuántos saltos de proxy hay delante: creerse esa cabecera sin balanceador permitiría saltarse el límite poniéndola a mano.
- **Validación Estricta de Entradas con Zod 4** (4.6.7; la rama 3.x quedó expuesta a `GHSA-mrhx-c7xc-m3w5`, agotamiento de memoria al validar colecciones grandes, y no tuvo parche):
  - Parámetros de consulta (`ProductQuerySchema`): `minPrice`, `maxPrice` (con verificación cruzada `min <= max`), `search` (máximo 100 caracteres sanitizados), `limit` (máximo 50 elementos por página) y categorías restringidas a enumeraciones estrictas.
  - Parámetros de ruta (`ProductSlugSchema`): Expresión regular `^[a-z0-9-]+$` para prevenir inyección de caracteres especiales o manipulación de rutas.
- **Prevención de SSRF en Frontend (`next.config.ts`)**:
  - Se eliminaron los comodines de dominio remoto (`hostname: "**"`).
  - Únicamente se autorizan orígenes conocidos y controlados (`images.unsplash.com`).
- **Manejo Centralizado de Excepciones**:
  - En entornos de producción, los detalles de errores de servidor o trazas internas jamás se exponen en las respuestas JSON a los clientes.

## 2.1 Superficie autenticada `/api/admin` (A4)

- **La sesión no pasa por el navegador**: los tokens de Cognito viajan en cookies `httpOnly`, `SameSite=Strict` y con `Path=/api/admin` (más `Secure` en producción). El JavaScript de la consola nunca puede leer un token, de modo que un XSS en la consola no se traduce en una sesión robada, y el sitio público jamás recibe esas cookies.
- **Autenticación y autorización separadas**: Cognito responde por la identidad (firma del access token verificada contra el JWKS del pool con `aws-jwt-verify`); la tabla `User` responde por el acceso. Un usuario válido del pool sin fila activa recibe `403`, no `401`: la credencial es correcta y reintentar no cambia nada. Quitar el acceso a alguien es una escritura en la base, no un trámite en Cognito.
- **Cierre de sesión real**: `logout` revoca los refresh tokens en Cognito (`GlobalSignOut`) además de borrar las cookies; borrar la cookie por sí solo dejaría la sesión viva para quien hubiera copiado el token. Al desactivar un usuario se revocan primero sus sesiones y después se deshabilita la cuenta, en ese orden, porque un access token sin vencer seguiría sirviendo.
- **El autor de una escritura no se acepta del cliente**: ninguna ruta de escritura lee el autor del cuerpo —ni las de inventario ni el CRUD del catálogo y del contenido—; lo toman de la sesión. `AuditLog` registra entonces a quien lo hizo, no a quien dijo haberlo hecho.
- **CORS propio del admin**: origen explícito (`ADMIN_URL`) y `credentials: true`. A diferencia del público, no se admiten peticiones sin `Origin`. Se resuelve en un único middleware que decide por petición, porque montar dos `cors()` duplicaría `Access-Control-Allow-Origin` y el navegador descartaría la respuesta.
- **Cuerpos distintos por superficie**: 20 kB en el público y 256 kB bajo `/api/admin`, donde la edición de contenido (A7) necesita más margen.
- **El reto de contraseña temporal tampoco se devuelve**: la sesión de `NEW_PASSWORD_REQUIRED` va en cookie de 10 minutos, no en el cuerpo de la respuesta.
- **Mensajes que no revelan si una cuenta existe**: el pool tiene `preventUserExistenceErrors`, y el backend traduce usuario inexistente y contraseña incorrecta al mismo `401`.
- **Escribir el catálogo es de `owner`, salvo las imágenes**: leer `/api/admin` lo puede hacer cualquier sesión, pero crear o modificar marcas, proveedores, líneas, variantes y contenido, y leer la auditoría, exigen rol `owner`. El `operator` se queda con el inventario diario —más las imágenes, ver §2.2—, que es lo que A4 le dio. Es el reparto conservador mientras la decisión #6 del plan siga abierta.
- **El registro de auditoría es de solo lectura, también para quien lo consulta**: no hay ruta que lo modifique ni que lo borre, el rol de la aplicación tampoco puede hacerlo en la base (ADR-002), y consultarlo exige `owner`: no tendría sentido que lo administrara quien queda registrado en él.
- **El stock no se puede escribir por la puerta del catálogo**: `stockCache` no figura en el esquema Zod de las variantes, así que un `stock` en el cuerpo se descarta antes de llegar al servicio. La única vía para moverlo sigue siendo un movimiento de inventario, que queda en el libro.
- **Publicar contenido no sobrescribe**: cada publicación añade una versión con autor y fecha, así que un texto cambiado por error se puede recuperar y se sabe quién lo cambió.
- **Lo que se «borra» se desactiva**: no hay `DELETE` en ninguna entidad del catálogo. El libro de inventario referencia variantes y proveedores con `onDelete: Restrict`, de modo que un borrado real rompería el rastro contable; retirar algo es `active: false`.
- **La consola no guarda ninguna credencial**: `/admin` no ve los tokens (son `httpOnly`), así que no hay nada en `localStorage` que robar ni que limpiar. La redirección al login es navegación, no una barrera: lo que protege los datos es que el backend exige sesión en cada petición. `/admin` va además con `noindex, nofollow`.
- **Pendiente**: MFA está opcional en dev y será obligatoria en prod; el backend todavía responde `501` al reto `SOFTWARE_TOKEN_MFA` y hay que resolverlo antes de exponer la consola.

## 2.2 Subida de imágenes del catálogo (decisión del 2026-10-27)

- **El navegador no recibe credenciales de AWS.** El bucket del catálogo es privado y la consola nunca habla con S3 con credenciales propias: pide a `POST /api/admin/uploads/presign` una URL `PUT` prefirmada de 5 minutos y sube el archivo contra esa URL.
- **La clave del objeto la decide el backend**, no el cliente: se deriva de la entidad (`marcas/<slug>/logo.<ext>`, `proveedores/<id>/logo.<ext>`, `productos/<linea>/linea.<ext>`, `productos/<linea>/<variante>.<ext>`). Así nadie puede escribir fuera del prefijo del catálogo ni pisar la imagen de otra entidad eligiendo la ruta. Una entidad que no existe responde `404` y no se firma nada.
- **La firma se limita a lo declarado**: `contentType` restringido a `image/webp`, `image/jpeg` o `image/png`, y `size` a 5 MB, ambos incluidos en la firma (`ContentType` y `ContentLength`), de modo que la URL no sirve para subir otra cosa ni un archivo mayor.
- **Quién puede cambiar una imagen: `owner` y `operator`.** Quien registra el ingreso del día es quien tiene la foto del producto en la mano, así que obligar a un dueño a subirla dejaba el inventario sin imagen en la práctica. El `operator` puede entonces firmar subidas y guardar la clave de marca, proveedor, línea y variante.
- **Pero solo la imagen.** `requireOwnerOrFields` acepta un PATCH de `operator` únicamente si el cuerpo no trae más campos que el de la imagen, y la comprobación es **sobre el cuerpo sin validar**: un `operator` que mande `{ imageKey, price }` recibe `403` y no se guarda nada, en vez de que Zod descarte el campo de más y la petición pase como si solo trajera la imagen. Precio, publicación, nombres y vínculos siguen siendo de `owner`.
- **Quitar una imagen no borra el objeto**: deja la clave en nulo en la base. El archivo sigue en el bucket, que es lo que permite deshacer sin volver a subirlo; limpiar objetos huérfanos es tarea aparte y manual.
- **Invalidar la caché tampoco admite comodines.** `POST /api/admin/uploads/invalidate` solo acepta una clave concreta que empiece por `marcas/`, `proveedores/` o `productos/`, y rechaza `*` y `..`. Un `/*` costaría lo mismo pero vaciaría la caché del catálogo entero y devolvería toda la carga al origen, así que no se puede pedir desde la consola.
- **Las credenciales que firman son las del backend**, no las de un usuario. En producción tiene que ser un rol con `s3:PutObject` limitado al prefijo del catálogo y `cloudfront:CreateInvalidation` sobre la distribución del catálogo —nunca el administrador compartido de la cuenta—: quien pueda llamar al presign puede escribir donde ese rol alcance. Ver `docs/infrastructure-aws.md` §2 y §8.1.

## 3. Pasarelas de Pago y Categoría "High Risk"
- **Restricción de Pasarelas Convencionales**: Plataformas como Stripe, PayPal y Mercado Pago aplican restricciones severas o bloqueos inmediatos a cuentas que comercialicen vaporizadores o accesorios de nicotina sin licencias corporativas específicas.
- **Arquitectura de Venta Segura**:
  1. **Checkout Asistido por WhatsApp**: Enlace cifrado en URL con detalles del producto seleccionado, precio en COP y confirmación de disponibilidad inmediata.
  2. **Transferencias Electrónicas Locales**: Nequi, Daviplata, Bancolombia a la Mano.
  3. **Pago Contra Entrega (COD)**: El cliente abona en efectivo o transferencia únicamente al recibir y verificar la originalidad del producto con su sello QR.
