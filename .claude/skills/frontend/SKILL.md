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
- `.claude/skills/backend/SKILL.md` (si el cambio de UI requiere tocar el contrato de la API)

## Reglas
- Respetar la arquitectura App Router de Next.js: usar Server Components por defecto y `"use client"` únicamente en componentes interactivos con estado, hooks de navegador o eventos.
- No duplicar la lógica de precios o inventario calculada por el backend: consumir los datos del backend o de los tipos en `frontend/src/types/product.ts`.
- Mantener la verificación de mayoría de edad (+18) activa y no eludible para cumplir con la legislación de productos de vapeo.
- Toda imagen externa debe estar permitida en `frontend/next.config.ts` (propiedad `images.remotePatterns`).
- Usar clases semánticas de Tailwind y la función de utilidad `cn()` de `frontend/src/lib/utils.ts`.
- Garantizar accesibilidad y diseño responsive mobile-first, ya que la gran mayoría de compradores de vaporizadores acceden desde smartphones. En concreto: objetivos táctiles ≥44px, foco visible en todo elemento interactivo y contraste suficiente sobre los fondos oscuros de la identidad VP.
- Reutilizar lo que ya existe en `frontend/src/components/` y `frontend/src/components/ui/` (`button`, `field`, `card-field`, `surface`, `pixel-label`) antes de escribir markup nuevo. Si un patrón se repite, extraerlo a `components/ui/` en vez de duplicarlo.
- El acceso a la API del backend se centraliza en `frontend/src/lib/` — no hacer `fetch` directo desde un componente. Hoy solo `frontend/src/app/page.tsx` lo hace; al agregar la segunda llamada, extraer un cliente compartido antes de duplicar la lógica de URL base y manejo de errores.
- No asumir que un ajuste "ya está cubierto en otro lado". Si un cambio afecta a varias vistas (catálogo, tarjeta de producto, FAQ, footer), verificarlas explícitamente antes de dar la tarea por terminada.

## Restricciones
- No agregar dependencias nuevas sin necesidad clara: el stack (Next.js 16, Tailwind v4, Lucide) ya cubre routing, estilos, iconografía y estado para el alcance actual.
- No modificar `backend/` salvo que el cambio de UI exija un ajuste de contrato, y en ese caso coordinarlo explícitamente con la skill `backend` y actualizar `docs/backend.md` en el mismo cambio.
- No duplicar en el cliente reglas de negocio del backend (precios, disponibilidad, filtros): consumir el endpoint.
