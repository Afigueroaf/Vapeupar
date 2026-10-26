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
- `docs/security.md` (si toca auth, validación de entrada, secretos o rate limiting)
- `.claude/skills/database/SKILL.md` (ante cualquier cambio de modelo o persistencia)

## Reglas
- La lógica de negocio vive en `backend/src/services/`, no en los controladores de ruta (`backend/src/routes/`).
- Tipado estricto: Todo parámetro de entrada, modelo de datos y respuesta debe estar completamente tipado en TypeScript. No usar `any`.
- Validar datos de entrada con esquemas Zod para endpoints que reciban datos en el body o parámetros complejos.
- Mantener el contrato de la API estable: un cambio en la forma de la respuesta **o en el status code** es un cambio de contrato. Actualizar los tipos del frontend y `docs/backend.md` en el mismo cambio, nunca después.
- CORS restringido: Asegurar que el backend solo acepte orígenes autorizados definidos en `FRONTEND_URL`.
- Revisar `backend/src/services/` antes de escribir una función nueva: no duplicar lógica que ya existe en un servicio.
- Todo cambio de modelo de datos o de persistencia pasa por la skill `database`, nunca con una modificación directa del esquema sin registrar la decisión.
- No asumir que un efecto secundario "ya se cubre en otro lado". Si un endpoint nuevo o modificado introduce una acción con impacto en el catálogo o en datos del cliente, verificar explícitamente los demás puntos que deberían reflejarla antes de dar la tarea por terminada — auditar el servicio completo, no inferirlo.

## Restricciones
- No modificar `frontend/` salvo que sea estrictamente necesario para un cambio de contrato, y en ese caso coordinarlo explícitamente con la skill `frontend`.
- No escribir secretos (valores de `.env`) en código, logs ni documentación.
- No agregar dependencias nuevas sin necesidad clara: Express + Zod + TypeScript cubren el alcance actual de routing, validación y tipado.
