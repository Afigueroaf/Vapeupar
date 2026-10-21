# Seguridad y Consideraciones Legales en Vapeupar

## 1. Verificación de Mayoría de Edad (+18 / Age Gate)
- **Marco Legal**: La legislación colombiana y estándares internacionales prohíben estrictamente la comercialización, suministro y promoción de productos de vapeo y tabaco a menores de 18 años (Ley 1335 de 2009 y normativas complementarias sobre cigarrillos electrónicos).
- **Implementación Técnica**:
  - Modal bloqueante en la primera visita (`AgeVerificationModal`).
  - Persistencia en almacenamiento del navegador (`localStorage`) con opción de renovación periódica.
  - Mensaje explícito de advertencia de salud en todas las vistas públicas y checkout.
  - Validación física del documento de identidad (Cédula de Ciudadanía) por el domiciliario al momento de la entrega.

## 2. Pasarelas de Pago y Categoría "High Risk"
- **Restricción de Pasarelas**: Las plataformas globales (Stripe, PayPal, Mercado Pago) clasifican los vaporizadores y accesorios de nicotina como productos de alto riesgo o derechamente prohibidos en sus términos de uso.
- **Estrategia Recomendada para Vapeupar**:
  1. **Checkout Vía WhatsApp**: Permite coordinar pedidos directamente con el comprador, validando stock y preferencia de sabor.
  2. **Transferencias Bancarias Locales**: Nequi, Daviplata, Bancolombia a la Mano, PSE (con comercio registrado debidamente).
  3. **Pago Contra Entrega (COD)**: El cliente paga en efectivo o transferencia al recibir y verificar su producto.
  4. **Pasarelas de Alto Riesgo Especializadas**: Si se desea cobro con tarjeta en la web, se debe tramitar una cuenta comercial clasificada para tabaco/vapeo con procesadores autorizados.

## 3. Seguridad Técnica en Backend y Frontend
- **CORS Estricto**: El backend solo responde a orígenes autorizados definidos en `FRONTEND_URL`.
- **Variables de Entorno**: Nunca almacenar credenciales de producción o claves secretas en repositorios de código. Utilizar `.env.example` para documentar la estructura de variables.
- **Validación de Datos**: Toda entrada que provenga del cliente debe ser validada con esquemas estrictos (Zod) antes de ser procesada por los servicios.
