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
- **El autor de una escritura no se acepta del cliente**: las rutas de inventario ignoran cualquier `userId` del cuerpo y firman el movimiento con el de la sesión. `AuditLog` registra entonces a quien lo hizo, no a quien dijo haberlo hecho.
- **CORS propio del admin**: origen explícito (`ADMIN_URL`) y `credentials: true`. A diferencia del público, no se admiten peticiones sin `Origin`. Se resuelve en un único middleware que decide por petición, porque montar dos `cors()` duplicaría `Access-Control-Allow-Origin` y el navegador descartaría la respuesta.
- **Cuerpos distintos por superficie**: 20 kB en el público y 256 kB bajo `/api/admin`, donde la edición de contenido (A7) necesita más margen.
- **El reto de contraseña temporal tampoco se devuelve**: la sesión de `NEW_PASSWORD_REQUIRED` va en cookie de 10 minutos, no en el cuerpo de la respuesta.
- **Mensajes que no revelan si una cuenta existe**: el pool tiene `preventUserExistenceErrors`, y el backend traduce usuario inexistente y contraseña incorrecta al mismo `401`.
- **Pendiente**: MFA está opcional en dev y será obligatoria en prod; el backend todavía responde `501` al reto `SOFTWARE_TOKEN_MFA` y hay que resolverlo antes de exponer la consola.

## 3. Pasarelas de Pago y Categoría "High Risk"
- **Restricción de Pasarelas Convencionales**: Plataformas como Stripe, PayPal y Mercado Pago aplican restricciones severas o bloqueos inmediatos a cuentas que comercialicen vaporizadores o accesorios de nicotina sin licencias corporativas específicas.
- **Arquitectura de Venta Segura**:
  1. **Checkout Asistido por WhatsApp**: Enlace cifrado en URL con detalles del producto seleccionado, precio en COP y confirmación de disponibilidad inmediata.
  2. **Transferencias Electrónicas Locales**: Nequi, Daviplata, Bancolombia a la Mano.
  3. **Pago Contra Entrega (COD)**: El cliente abona en efectivo o transferencia únicamente al recibir y verificar la originalidad del producto con su sello QR.
