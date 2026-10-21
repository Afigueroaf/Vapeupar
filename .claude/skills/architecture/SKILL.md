---
name: architecture
description: Decisiones de arquitectura, límites entre frontend (Next.js) y backend (TypeScript Express) y ADRs de Vapeupar. Usar antes de cambios estructurales o nuevos patrones.
---

# Architecture - Vapeupar

## Propósito
Guardar la coherencia arquitectónica de Vapeupar: límites limpios entre el frontend (`frontend/`), el backend (`backend/`), el modelo de datos y las decisiones registradas (ADRs).

## Cuándo usarla
- Antes de agregar un nuevo componente de infraestructura, microservicio o patrón de comunicación.
- Cuando una tarea requiere coordinar cambios que crucen frontend y backend simultáneamente.
- Antes de diseñar esquemas de datos o integrar pasarelas de pago externas.

## Debe consultar
- `docs/architecture.md`
- `docs/decisions/`
- `docs/catalog-domain.md`

## Reglas
- Mantener el desacoplamiento: el frontend nunca interactúa directamente con bases de datos internas; se comunica exclusivamente a través de los endpoints REST del backend.
- Lógica de negocio en el backend: validaciones de inventario, reglas de descuento y precios calculados deben residir en `backend/src/services/`.
- Registrar como ADR en `docs/decisions/` cualquier decisión tecnológica o arquitectónica con impacto a largo plazo.
