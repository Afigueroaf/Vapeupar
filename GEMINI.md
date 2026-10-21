# Vapeupar - Guía del Proyecto y Reglas para el Agente

Bienvenido al repositorio de **Vapeupar**, landing page con catálogo de ventas para una tienda de vaporizadores ubicada en Valledupar, Colombia.

---

## 1. Stack Tecnológico

- **Frontend (`frontend/`)**:
  - Next.js 16 (App Router) + React 19.
  - TypeScript 5.
  - Tailwind CSS v4.
  - Lucide React (iconografía).
- **Backend (`backend/`)**:
  - Node.js + Express 4.
  - TypeScript (ejecución con `tsx watch` y compilación con `tsc`).
  - Zod (validación de esquemas).
  - CORS habilitado para el frontend.
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

# Compilar ambos proyectos
npm run build
```

---

## 3. Estructura del Proyecto

```
vapeupar/
├── .agents/skills/      # Skills para el agente de IA (diseño, front, back, seguridad, etc.)
├── .claude/skills/      # Espejo de skills compatible
├── docs/                # Documentación técnica completa
│   ├── architecture.md  # Límites de capas y flujo de datos
│   ├── frontend.md      # Guía de componentes y Next.js
│   ├── backend.md       # Endpoints API y servicios REST
│   ├── catalog-domain.md# Taxonomía vape (desechables, pods, sales, puffs, nicotina)
│   ├── security.md      # Verificación de edad (+18) y pasarelas de pago
│   └── decisions/       # ADRs arquitectónicos
├── frontend/            # App Next.js 16 + React 19
└── backend/             # API REST en TypeScript
```

---

## 4. Skills Disponibles en el Proyecto

El proyecto cuenta con skills especializadas en `.agents/skills/`:
- **`frontend-design`**: Principios de diseño visual distintivo, paletas de colores intencionales y tipografía con personalidad (evita diseños genéricos de plantilla).
- **`shadcn`**: Reglas y mejores prácticas para componentes de interfaz.
- **`frontend`**: Convenciones de Next.js App Router, componentes y consumo de endpoints.
- **`backend`**: Arquitectura de servicios Express, validaciones y tipado en TypeScript.
- **`architecture`**: Coherencia y límites entre capas.
- **`security`**: Reglas de verificación de mayoría de edad (+18) y manejo seguro de datos.
- **`accessibility`**: Prácticas de accesibilidad web (WCAG, navegación por teclado, contrastes).
- **`inclusive-design`**: Diseño inclusivo para redes móviles y diversas capacidades.
- **`code-review`**: Checklist de auditoría de código previo a commits o PRs.

---

## 5. Reglas Mandatorias para el Agente

1. **Cumplimiento Legal +18**: El modal de confirmación de edad y las advertencias sanitarias de nicotina son obligatorios en todas las vistas del catálogo.
2. **Separación de Responsabilidades**: La lógica de negocio, filtros de catálogo e inventario deben originarse o validarse en el backend.
3. **Tipado Estricto**: No usar `any` en TypeScript. Mantener sincronizados los tipos de `backend/src/types/` y `frontend/src/types/`.
4. **Mobile First**: El diseño debe ser 100% fluido y responsive para smartphones, dado que la mayoría de compradores usan WhatsApp y redes móviles.
5. **Preservar Documentación**: Cada nuevo endpoint, cambio de diseño o decisión estructural debe reflejarse en `docs/`.
