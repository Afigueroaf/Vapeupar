---
name: infrastructure
description: Entorno de desarrollo local, scripts de ejecución y despliegue de Vapeupar. Usar para cambios en package.json raíz, scripts npm o variables de entorno.
---

# Infrastructure - Vapeupar

## Propósito
Gestionar la infraestructura de desarrollo local y futuro despliegue de Vapeupar (Next.js frontend en Vercel/Node + Express API backend en VPS/Render/Railway).

## Cuándo usarla
- Al ajustar scripts del `package.json` raíz o de los workspaces (`frontend/`, `backend/`).
- Al configurar nuevas variables de entorno o actualizar `.env.example`.
- Al preparar contenedores Docker o pipelines de CI/CD.

## Debe consultar
- `docs/architecture.md`
- `docs/security.md`

## Reglas
- Mantener la facilidad de ejecución local con un único comando o comandos claros por workspace.
- Nunca commitear archivos `.env` reales con credenciales.
- Documentar cualquier nuevo requisito de runtime (versión mínima de Node.js, puertos, etc.).
