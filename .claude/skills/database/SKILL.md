---
name: database
description: Modelado de datos, catálogo de productos, variantes e integridad referencial de Vapeupar. Usar para cambios de entidades, persistencia y consultas de datos.
---

# Database - Vapeupar

## Propósito
Mantener la coherencia del modelo de datos de productos, categorías, inventario y pedidos de Vapeupar.

## Estado actual
- Persistencia en **RDS PostgreSQL con Prisma 7** (en producción desde el 2026-10-26). Esquema en `backend/prisma/schema.prisma`, migraciones SQL versionadas en `backend/prisma/migrations/` y cliente en `backend/src/db/`.
- **Inventario por libro de movimientos**: la autoridad es la suma de `StockMovement` (ingreso, venta, ajuste, merma, devolución) y `Variant.stockCache` es solo una caché; toda escritura pasa por `backend/src/services/stock.service.ts` y deja `AuditLog`.
- Dos credenciales: `DATABASE_URL` con el rol `vapeupar_app` (runtime, sin DDL; `npm run db:sync-app-role`) y `MIGRATE_DATABASE_URL` con el usuario maestro, solo para migraciones.
- Acceso a datos por repositorios (`backend/src/repositories/`): interfaz + implementación Prisma; las `in-memory-*` son solo para tests.

## Cuándo usarla
- Al agregar o modificar campos de productos (puffs, resistencia, volumen de líquido, niveles de nicotina).
- Al tocar entidades de pedidos (`Order`, `OrderLine`, `OrderConsent`, ADR-003), variantes, stock o contenido del sitio.
- Al crear una migración de Prisma o cambiar permisos del rol `vapeupar_app`.

## Debe consultar
- `docs/catalog-domain.md`
- `docs/architecture.md`
- `docs/backend.md` (sección de base de datos y scripts `db:*`)
- `docs/decisions/002-consola-de-administracion-y-persistencia.md` y `docs/decisions/003-pedidos.md`

## Reglas
- Mantener integridad en los tipos: cualquier cambio en las entidades de datos debe actualizarse en `backend/src/types/product.types.ts` y sincronizarse con `frontend/src/types/product.ts`.
- No alterar identificadores únicos ni slugs de productos existentes para preservar URLs amigables e indexación SEO.
- Toda migración se crea con `npm run db:migrate:create --workspace=backend` y se revisa el SQL antes de aplicarla; una migración aplicada no se edita (Prisma la valida por checksum, por eso `backend/prisma/migrations/**/*.sql` va siempre con LF).
- En producción las migraciones las aplica `activate.sh` en cada despliegue: un cambio destructivo necesita snapshot previo de RDS y un plan de vuelta atrás.
- Stock y precios solo se escriben desde `backend/src/services/`, nunca con SQL directo ni desde el frontend.
