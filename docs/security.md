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
  - Protección de endpoints bajo `/api/*` con `express-rate-limit`: máximo 100 peticiones por ventana de 1 minuto por IP.
- **Validación Estricta de Entradas con Zod**:
  - Parámetros de consulta (`ProductQuerySchema`): `minPrice`, `maxPrice` (con verificación cruzada `min <= max`), `search` (máximo 100 caracteres sanitizados), `limit` (máximo 50 elementos por página) y categorías restringidas a enumeraciones estrictas.
  - Parámetros de ruta (`ProductSlugSchema`): Expresión regular `^[a-z0-9-]+$` para prevenir inyección de caracteres especiales o manipulación de rutas.
- **Prevención de SSRF en Frontend (`next.config.ts`)**:
  - Se eliminaron los comodines de dominio remoto (`hostname: "**"`).
  - Únicamente se autorizan orígenes conocidos y controlados (`images.unsplash.com`).
- **Manejo Centralizado de Excepciones**:
  - En entornos de producción, los detalles de errores de servidor o trazas internas jamás se exponen en las respuestas JSON a los clientes.

## 3. Pasarelas de Pago y Categoría "High Risk"
- **Restricción de Pasarelas Convencionales**: Plataformas como Stripe, PayPal y Mercado Pago aplican restricciones severas o bloqueos inmediatos a cuentas que comercialicen vaporizadores o accesorios de nicotina sin licencias corporativas específicas.
- **Arquitectura de Venta Segura**:
  1. **Checkout Asistido por WhatsApp**: Enlace cifrado en URL con detalles del producto seleccionado, precio en COP y confirmación de disponibilidad inmediata.
  2. **Transferencias Electrónicas Locales**: Nequi, Daviplata, Bancolombia a la Mano.
  3. **Pago Contra Entrega (COD)**: El cliente abona en efectivo o transferencia únicamente al recibir y verificar la originalidad del producto con su sello QR.
