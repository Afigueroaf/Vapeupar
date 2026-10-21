---
name: frontend
description: Frontend de Vapeupar en frontend/ (Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + Lucide). Usar para páginas, componentes, catálogo, landing page, UX o consumo de API del backend.
---

# Frontend - Vapeupar

## Propósito
Implementar y mantener la aplicación web de cara al cliente y catálogo interactivo de Vapeupar (`frontend/`) — Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + Lucide Icons.

## Cuándo usarla
- Al crear o modificar una página (`frontend/src/app/`) o componente de interfaz (`frontend/src/components/`).
- Al integrar o ajustar filtros de catálogo, búsqueda o tarjetas de producto.
- Al modificar el flujo de verificación de edad (+18) en `frontend/src/components/age-verification-modal.tsx`.
- Al conectar el consumo de la API REST del backend (`frontend/src/app/page.tsx` o servicios en `frontend/src/lib/`).
- Al diseñar o ajustar el flujo de checkout o pedidos directos por WhatsApp.

## Debe consultar
- `docs/frontend.md`
- `docs/architecture.md`
- `docs/catalog-domain.md`
- `.agents/skills/frontend-design/SKILL.md` (para decisiones de diseño distintivo, paletas de color y tipografía)
- `.agents/skills/shadcn/SKILL.md` (si se agregan componentes shadcn)

## Reglas
- Respetar la arquitectura App Router de Next.js: usar Server Components por defecto y `"use client"` únicamente en componentes interactivos con estado, hooks de navegador o eventos.
- No duplicar la lógica de precios o inventario calculada por el backend: consumir los datos del backend o de los tipos en `frontend/src/types/product.ts`.
- Mantener la verificación de mayoría de edad (+18) activa y no eludible para cumplir con la legislación de productos de vapeo.
- Toda imagen externa debe estar permitida en `frontend/next.config.ts` (propiedad `images.remotePatterns`).
- Usar clases semánticas de Tailwind y la función de utilidad `cn()` de `frontend/src/lib/utils.ts`.
- Garantizar accesibilidad y diseño responsive mobile-first, ya que la gran mayoría de compradores de vaporizadores acceden desde smartphones.
