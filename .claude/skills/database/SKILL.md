---
name: database
description: Modelado de datos, catálogo de productos, variantes e integridad referencial de Vapeupar. Usar para cambios de entidades, persistencia y consultas de datos.
---

# Database - Vapeupar

## Propósito
Mantener la coherencia del modelo de datos de productos, categorías, inventario y pedidos de Vapeupar.

## Cuándo usarla
- Al agregar o modificar campos de productos (puffs, resistencia, volumen de líquido, niveles de nicotina).
- Al diseñar las entidades de pedidos, clientes o variantes de sabor.
- Al implementar la persistencia relacional con PostgreSQL, Prisma o Supabase en fases posteriores.

## Debe consultar
- `docs/catalog-domain.md`
- `docs/architecture.md`

## Reglas
- Mantener integridad en los tipos: cualquier cambio en las entidades de datos debe actualizarse en `backend/src/types/product.types.ts` y sincronizarse con `frontend/src/types/product.ts`.
- No alterar identificadores únicos ni slugs de productos existentes para preservar URLs amigables e indexación SEO.
