---
name: backend
description: Backend API de Vapeupar en backend/ (Node.js + Express + TypeScript). Usar para endpoints REST, servicios de productos, lógica de catálogo, filtros, validaciones y contratos de datos.
---

# Backend - Vapeupar

## Propósito
Implementar y mantener la API REST en TypeScript de Vapeupar (`backend/`) — rutas Express, servicios de catálogo de productos, validaciones con Zod y tipado estricto.

## Cuándo usarla
- Al crear o modificar un endpoint en `backend/src/routes/`.
- Al agregar lógica de negocio o filtros en `backend/src/services/product.service.ts`.
- Al modificar modelos de datos o interfaces en `backend/src/types/product.types.ts`.
- Al integrar una base de datos relacional (PostgreSQL/Prisma) o servicios externos.
- Al configurar middlewares (CORS, logging, autenticación, rate limiting).

## Debe consultar
- `docs/backend.md`
- `docs/architecture.md`
- `docs/catalog-domain.md`
- `docs/security.md`

## Reglas
- La lógica de negocio vive en `backend/src/services/`, no en los controladores de ruta (`backend/src/routes/`).
- Tipado estricto: Todo parámetro de entrada, modelo de datos y respuesta debe estar completamente tipado en TypeScript. No usar `any`.
- Validar datos de entrada con esquemas Zod para endpoints que reciban datos en el body o parámetros complejos.
- Mantener el contrato de la API estable: si cambia la forma del JSON de respuesta en un endpoint, actualizar de inmediato los tipos del frontend y `docs/backend.md`.
- CORS restringido: Asegurar que el backend solo acepte orígenes autorizados definidos en `FRONTEND_URL`.
