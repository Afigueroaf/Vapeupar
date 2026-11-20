# Vapeupar 💨

> Tienda en línea con catálogo interactivo de vaporizadores y e-líquidos en Valledupar, Colombia,
> con pedido por WhatsApp y consola de administración propia.

En producción en **https://vapeupar.ddns.net** (entorno `dev` de AWS, que es la producción desde el
2026-11-06; ver [`docs/infrastructure-aws.md`](docs/infrastructure-aws.md)).

---

## 🛠️ Stack Tecnológico

- **Frontend** (`frontend/`): Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide,
  Three.js con React Three Fiber (vitrina 3D) y Vitest.
- **Backend** (`backend/`): Node.js, Express 4, TypeScript, Zod 4, Prisma 7 y Vitest.
- **Datos y servicios**: RDS PostgreSQL (inventario por libro de movimientos), Cognito (sesión de la
  consola `/admin`), S3 + CloudFront (imágenes del catálogo).
- **Infraestructura** (`infra/`): AWS CDK en TypeScript. La web, la consola y la API corren en una
  EC2 con nginx y systemd; las releases se publican en S3 y se activan por SSM, a mano o desde
  GitHub Actions con OIDC.
- **Monorepo**: npm workspaces (`frontend`, `backend`, `infra`). Instalar siempre desde la raíz.

---

## 🚀 Inicio Rápido Local

### 1. Requisitos Previos
- Node.js 22 (la versión de la instancia y de CI) y npm 10 o superior.
- Para el backend con datos reales: AWS CLI con acceso a la cuenta y el túnel a la base
  (`npm run infra:db-tunnel`). Sin backend, el frontend muestra un catálogo de respaldo.

### 2. Instalación de Dependencias
```bash
npm install
```

### 3. Iniciar Entorno de Desarrollo

- **Frontend (Next.js)** en [http://localhost:3000](http://localhost:3000):
  ```bash
  npm run dev:frontend
  ```

- **Backend (Express API)** en [http://localhost:4000](http://localhost:4000) (`/health`, `/api/products`):
  ```bash
  npm run infra:env-backend   # escribe backend/.env desde SSM y Secrets Manager
  npm run infra:db-tunnel     # en otra terminal; dejarla abierta
  npm run dev:backend
  ```

- **Ambos a la vez**: `npm run dev:all`.

### 4. Otros scripts de la raíz

| Script | Qué hace |
|---|---|
| `npm test` | Tests de backend, frontend e infra |
| `npm run build` | Compila backend y frontend |
| `npm run check:bundle` | Guarda del JS inicial de la portada (sin three.js y dentro de presupuesto); va tras `npm run build` |
| `npm run db:migrate` · `db:seed` · `db:sync-app-role` | Migraciones, semilla y rol `vapeupar_app` (ver [`docs/backend.md`](docs/backend.md)) |
| `npm run admin:invite -- …` | Invita a un usuario de la consola |
| `npm run infra:diff` · `infra:deploy` | Cambios de infraestructura con CDK |
| `npm run app:deploy` · `app:rollback` | Despliegue y vuelta atrás de la aplicación en la EC2 |
| `npm run deathnote` | Roadmap vivo en la terminal ([`docs/deathnote/`](docs/deathnote/)) |

---

## 📁 Estructura del Repositorio

- `frontend/`: Web pública (modal +18, portada con vitrina 3D, catálogo con filtros, colecciones, ficha
  de producto, carrito con pedido por WhatsApp) y consola `/admin` (stock, catálogo, marcas,
  proveedores, usuarios, contenido del sitio y pedidos).
- `backend/`: API REST pública (`/api/products`, `/api/content`, `/api/brands`, `/api/orders`) y
  autenticada (`/api/admin/*`), con Prisma sobre RDS. `backend/scripts/` reúne los scripts de
  operación (invitaciones, subida de imágenes, conteo físico).
- `infra/`: Stacks de CDK y lo que se instala en la EC2 (ver [`infra/README.md`](infra/README.md)).
- `scripts/`: CLI del Deathnote y guarda del bundle.
- `assets/`: Archivo maestro del negocio (fotos y logos de partida).
- `.claude/skills/`: Skills de Claude Code para este repositorio. `.agents/skills/` es el juego de
  otros agentes y no se mantiene en paralelo.
- `docs/`: Documentación técnica:
  - [`architecture.md`](docs/architecture.md): Arquitectura del sistema y flujo de datos.
  - [`frontend.md`](docs/frontend.md): Estructura del cliente Next.js y de la consola.
  - [`backend.md`](docs/backend.md): Endpoints, base de datos y scripts del servicio.
  - [`catalog-domain.md`](docs/catalog-domain.md): Taxonomía y especificaciones del mundo del vapeo.
  - [`security.md`](docs/security.md): Normativa legal +18, superficie autenticada y pagos.
  - [`infrastructure-aws.md`](docs/infrastructure-aws.md): Runbook del entorno AWS (despliegue, alarmas, costos).
  - [`aws-full-deployment-plan.md`](docs/aws-full-deployment-plan.md): Plan por fases del despliegue en EC2 (F1–F7).
  - [`admin-console-execution-plan.md`](docs/admin-console-execution-plan.md): Plan y registro de la consola (A0–A8).
  - [`design-execution-plan.md`](docs/design-execution-plan.md): Plan y registro del sistema visual VP (V0–V8).
  - [`performance-optimization-plan.md`](docs/performance-optimization-plan.md): Auditoría y plan de rendimiento.
  - [`decisions/`](docs/decisions/): ADRs del proyecto (001 stack, 002 consola y persistencia, 003 pedidos).
  - [`deathnote/`](docs/deathnote/): Roadmap vivo (`npm run deathnote`).
  - Históricos (no describen el estado actual): [`design-reset-inventory.md`](docs/design-reset-inventory.md),
    [`improvement-plan.md`](docs/improvement-plan.md), [`audit-and-fragile-points.md`](docs/audit-and-fragile-points.md)
    y [`session-handoff-2026-10-27-inventory-images.md`](docs/session-handoff-2026-10-27-inventory-images.md).

---

## 🎨 Estado del Diseño

El sistema visual VP está terminado (fases V0 a V8): Oxanium + Press Start 2P, paleta lima/violeta
sobre negro, geometría angular y primitivas en `frontend/src/components/ui/`. El plan y su registro
están en [`docs/design-execution-plan.md`](docs/design-execution-plan.md); el porqué del cambio, en el
inventario histórico [`docs/design-reset-inventory.md`](docs/design-reset-inventory.md).

---

## 🤖 Reglas para agentes y colaboradores

Las reglas de trabajo viven en `.claude/skills/` (una por área). Las que aplican a todo el repositorio:

1. **+18 obligatorio**: el modal de mayoría de edad (TTL de 30 días) y las advertencias sanitarias de
   nicotina están en todas las vistas públicas y no se pueden eludir.
2. **Negocio en el backend**: filtros, precios, inventario y stock se calculan y escriben solo en
   `backend/src/services/`; el frontend los consume.
3. **Validación Zod**: toda ruta con query, params o body se valida con esquemas de
   `backend/src/schemas/` (`schemas/admin/` para la consola).
4. **Tipado estricto**: sin `any` ni `as` sin validación previa; los tipos de `backend/src/types/` y
   `frontend/src/types/` cambian juntos.
5. **Mobile first**: diseño fluido, menú móvil y objetivos táctiles de 44 px o más.
6. **La documentación va con el cambio**: cada endpoint, cambio de diseño o decisión estructural se
   refleja en `docs/` en el mismo cambio, y las decisiones de largo plazo como ADR en `docs/decisions/`.

---

## ⚖️ Aviso Legal y Cumplimiento
Este proyecto implementa mecanismos de verificación de edad (+18) y advertencias sanitarias conforme a la normativa sobre consumo y venta de productos con nicotina.
