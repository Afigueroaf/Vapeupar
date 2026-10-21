# Vapeupar 💨

> Landing page con catálogo interactivo de ventas para tienda de vaporizadores y e-líquidos en Valledupar, Colombia.

---

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide Icons.
- **Backend**: Node.js, Express, TypeScript, Zod.
- **Monorepo**: npm workspaces.

---

## 🚀 Inicio Rápido Local

### 1. Requisitos Previos
- Node.js 18+ (probado en v24)
- npm 9+ (probado en v11)

### 2. Instalación de Dependencias
```bash
npm install
```

### 3. Iniciar Entorno de Desarrollo
Puedes iniciar ambos servicios en terminales separadas o con los scripts dedicados:

- **Frontend (Next.js)**:
  ```bash
  npm run dev:frontend
  ```
  Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

- **Backend (Express API)**:
  ```bash
  npm run dev:backend
  ```
  API disponible en [http://localhost:4000](http://localhost:4000) (Health check: `/health`, Catálogo: `/api/products`).

---

## 📁 Estructura del Repositorio

- `frontend/`: Aplicación web Next.js con modal de control de edad (+18), hero interactivo, catálogo con filtros por categoría/marca/sabor y botón de compra rápida por WhatsApp.
- `backend/`: Servicio REST en TypeScript con servicios de catálogo, filtrado inteligente y dataset de productos.
- `.agents/skills/` y `.claude/skills/`: Skills de IA para diseño frontend, backend, accesibilidad, arquitectura y seguridad clonadas y adaptadas.
- `docs/`: Documentación técnica detallada:
  - `docs/architecture.md`: Arquitectura del sistema y flujo de datos.
  - `docs/frontend.md`: Estructura del cliente Next.js.
  - `docs/backend.md`: Endpoints y modelo del servicio.
  - `docs/catalog-domain.md`: Taxonomía y especificaciones del mundo del vapeo.
  - `docs/security.md`: Normativa legal +18 y pasarelas de pago.
  - `docs/decisions/`: ADRs del proyecto.

---

## ⚖️ Aviso Legal y Cumplimiento
Este proyecto implementa mecanismos de verificación de edad (+18) y advertencias sanitarias conforme a la normativa sobre consumo y venta de productos con nicotina.
