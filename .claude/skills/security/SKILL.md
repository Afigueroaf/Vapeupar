---
name: security
description: Seguridad, cumplimiento normativo (+18), variables de entorno y prevención de fraudes en Vapeupar. Usar al tocar flujos de verificación, datos sensibles o pagos.
---

# Security - Vapeupar

## Propósito
Garantizar el cumplimiento legal de restricción de edad (+18) para productos de nicotina, la protección de datos personales de clientes y el manejo seguro de pagos e infraestructura.

## Cuándo usarla
- Al revisar o modificar el modal o middleware de verificación de edad (`AgeVerificationModal`).
- Al configurar pasarelas de pago o integración con servicios de mensajería (WhatsApp, Nequi, etc.).
- Al agregar variables de entorno o credenciales de servicios externos.
- Al configurar cabeceras CORS o políticas de seguridad en el backend.

## Debe consultar
- `docs/security.md`
- `docs/architecture.md`

## Reglas
- **Nunca omitir el control de edad**: Es una exigencia legal estricta para la comercialización de vaporizadores y líquidos.
- **Sin secretos en código**: Ninguna clave de API, token o secreto debe commitearse al repositorio. Utilizar siempre `.env` y documentar en `.env.example`.
- **CORS Estricto**: No permitir `*` como origin en el backend para rutas de negocio sensibles.
