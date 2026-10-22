# Vapeupar - Guía del Proyecto y Reglas para el Agente

Bienvenido al repositorio de **Vapeupar**, landing page con catálogo de ventas para una tienda de vaporizadores ubicada en Valledupar, Colombia.

---

## 1. Stack Tecnológico

- **Frontend (`frontend/`)**:
  - Next.js 16 (App Router) + React 19.
  - TypeScript 5.
  - Tailwind CSS v4 con soporte `prefers-reduced-motion`.
  - Lucide React (iconografía).
  - Modal legal +18 con TTL de 30 días, accesibilidad WCAG y menú móvil drawer.
- **Backend (`backend/`)**:
  - Node.js + Express 4.
  - TypeScript (ejecución con `tsx watch` y compilación con `tsc`).
  - Zod (validación estricta de esquemas en tiempo de ejecución para query params y slugs).
  - Helmet (cabeceras de seguridad HTTP).
  - Express-Rate-Limit (protección contra saturación DoS y fuerza bruta).
  - CORS configurado para el frontend.
- **Monorepo / Workspace**:
  - npm workspaces configurados en el `package.json` raíz.

---

## 2. Comandos Rápidos de Desarrollo

```bash
# Instalar dependencias globales
npm install

# Iniciar Frontend (Next.js en http://localhost:3000)
npm run dev:frontend

# Iniciar Backend (Express API en http://localhost:4000)
npm run dev:backend

# Compilar ambos proyectos con validación de tipos
npm run build
```

---

## 3. Estructura del Proyecto

```
vapeupar/
├── .agents/skills/      # Skills para el agente de IA (12 skills de diseño, arquitectura, etc.)
├── .claude/skills/      # Espejo de skills compatible
├── docs/                # Documentación técnica completa
│   ├── architecture.md  # Límites de capas y flujo de datos
│   ├── frontend.md      # Guía de componentes y Next.js
│   ├── backend.md       # Endpoints API, esquemas Zod y servicios REST
│   ├── catalog-domain.md# Taxonomía vape (desechables, pods, sales, puffs, nicotina)
│   ├── security.md      # Verificación de edad (+18, TTL), rate limit y pasarelas
│   ├── audit-and-fragile-points.md # Diagnóstico y matriz de puntos frágiles
│   ├── improvement-plan.md         # Plan de mejora y evolución arquitectónica
│   └── decisions/       # ADRs arquitectónicos
├── frontend/            # App Next.js 16 + React 19 + Tailwind v4
└── backend/             # API REST en TypeScript + Zod + Helmet
```

---

## 4. Skills Disponibles en el Proyecto

El proyecto cuenta con 12 skills especializadas en `.agents/skills/` y `.claude/skills/`:
- **`frontend`**: Convenciones de Next.js App Router, componentes semánticos, catálogo y consumo de endpoints.
- **`backend`**: Arquitectura de servicios Express, validaciones Zod y tipado estricto en TypeScript.
- **`architecture`**: Coherencia y límites entre capas frontend, backend y datos.
- **`architecture-feature-first`**: Organización modular por features.
- **`database`**: Modelado de datos de productos, variantes, integridad y preparación para PostgreSQL.
- **`security`**: Reglas de verificación de mayoría de edad (+18, TTL de 30 días), Helmet, rate limiting y pagos.
- **`infrastructure`**: Entorno de desarrollo local, scripts de ejecución y despliegue.
- **`frontend-design`**: Principios de diseño visual distintivo, paletas de colores intencionales y tipografía con personalidad.
- **`shadcn`**: Reglas y mejores prácticas para componentes de interfaz shadcn/ui.
- **`accessibility`**: Prácticas de accesibilidad web (WCAG, navegación por teclado, focus traps, contrastes).
- **`inclusive-design`**: Diseño inclusivo para redes móviles y diversas capacidades.
- **`code-review`**: Checklist de auditoría de código previo a commits o PRs.

---

## 5. Reglas Mandatorias para el Agente

1. **Cumplimiento Legal +18**: El modal de confirmación de edad con TTL de 30 días y las advertencias sanitarias de nicotina son obligatorios en todas las vistas públicas.
2. **Separación de Responsabilidades**: La lógica de negocio, filtros de catálogo e inventario deben originarse o validarse en el backend.
3. **Validación Zod Obligatoria**: Toda ruta que reciba parámetros de query o body debe validarse contra esquemas Zod en `backend/src/schemas/`.
4. **Tipado Estricto**: No usar `any` ni type assertions forzadas (`as`) sin validación previa. Mantener sincronizados los tipos de `backend/src/types/` y `frontend/src/types/`.
5. **Mobile First**: El diseño debe ser 100% fluido y responsive para smartphones, asegurando menú móvil y touch targets ≥44px.
6. **Preservar Documentación**: Cada nuevo endpoint, cambio de diseño o decisión estructural debe reflejarse en `docs/`.
