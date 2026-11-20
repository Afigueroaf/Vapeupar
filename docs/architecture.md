# Arquitectura de Vapeupar

## 1. Visión General del Sistema

Vapeupar es una plataforma moderna de comercio digital especializada en la venta de vaporizadores, sales de nicotina, pods recargables y accesorios.
El sistema se compone de una arquitectura desacoplada:

1. **Frontend (`frontend/`)**:
   - **Framework**: Next.js 16 (App Router) + React 19.
   - **Lenguaje**: TypeScript.
   - **Estilos**: Tailwind CSS v4 + iconos Lucide React + componentes accesibles.
   - **Responsabilidad**: Presentación de landing page de alta conversión, banner y modal de verificación de edad (+18), catálogo interactivo con filtros avanzados (categoría, sabor, nivel de nicotina, rango de precio, puffs), colecciones y ficha de producto con sabores, carrito local con pedido por WhatsApp (y, con `ORDERS_ENABLED`, pedido registrado en la base, ADR-003) y la consola de administración `/admin`. No hay pasarela de pago.

2. **Backend (`backend/`)**:
   - **Runtime**: Node.js + TypeScript (compilado con `tsc` y ejecutado en desarrollo con `tsx`).
   - **Framework**: Express.js con tipado estricto y validaciones con Zod.
   - **Responsabilidad**: API REST pública (productos, categorías, contenido del sitio, marcas aliadas y, con `ORDERS_ENABLED`, creación de pedidos) y superficie autenticada `/api/admin/*` (inventario por libro de movimientos, catálogo, marcas, proveedores, usuarios, contenido, imágenes, pedidos y auditoría). Tras cada escritura que afecta al sitio avisa a Next para revalidar (A7.3).

3. **Capa de Datos**:
   - **RDS PostgreSQL con Prisma 7**, en producción desde el 2026-10-26 y accesible únicamente desde el backend (rol `vapeupar_app`; el usuario maestro solo migra). Inventario por libro de movimientos, auditoría y contenido del sitio versionado. Ver [ADR-002](decisions/002-consola-de-administracion-y-persistencia.md) y [`admin-console-execution-plan.md`](admin-console-execution-plan.md).
   - Los servicios reciben su repositorio por constructor; los repositorios en memoria (`backend/src/repositories/in-memory-*.ts`) solo se usan en los tests.
   - **Cognito** guarda la identidad de los usuarios de la consola; **S3 + CloudFront** sirven las imágenes del catálogo, que la consola sube con URL prefirmada.

4. **Despliegue**: todo en AWS por CDK (`infra/`). Una EC2 con nginx delante del frontend (Next, puerto 3000) y del backend (Express, puerto 4000), ambos con systemd, en https://vapeupar.ddns.net. Detalle en [`infrastructure-aws.md`](infrastructure-aws.md) y [`aws-full-deployment-plan.md`](aws-full-deployment-plan.md).

```
+-------------------------------------------------------+
|                       CLIENTE                         |
|  (Navegador Móvil / Desktop - Verificación de +18)    |
+-------------------------------------------------------+
                           |  HTTPS (vapeupar.ddns.net)
                           v
+-------------------------------------------------------+
|            EC2 · nginx (TLS, límites de tasa)         |
|   /api/*  -> backend :4000     resto -> frontend :3000|
+-------------------------------------------------------+
           |                               |
           v                               v
+---------------------------+   +---------------------------+
|   FRONTEND (Next.js 16)   |   | BACKEND API (Express TS)  |
| - Portada, vitrina 3D     |   | - /health                 |
| - Catálogo y colecciones  |   | - /api/products (+ /:slug,|
| - Ficha /producto/[slug]  |   |   /categories, /id/:id)   |
| - Modal +18               |   | - /api/content/:key       |
| - Carrito + WhatsApp      |   | - /api/brands/partners    |
| - Consola /admin          |   | - /api/orders (flag)      |
| - /internal/revalidate    |   | - /api/admin/* (Cognito)  |
+---------------------------+   +---------------------------+
           |                          |            |
           v                          v            v
+---------------------------+   +-----------+ +-----------+
| CloudFront -> S3 (fotos)  |   | RDS       | | Cognito   |
+---------------------------+   | PostgreSQL| | (consola) |
                                +-----------+ +-----------+
```

`/internal/revalidate` solo lo llama el backend por loopback tras una escritura que cambia el sitio; nginx lo responde con 404 desde fuera.

## 2. Límites de Responsabilidad y Reglas de Arquitectura

- **Separación de Lógica**: La lógica de negocio del catálogo, inventario y cálculos de precios vive en el backend (`backend/src/services/`). El frontend consume los endpoints y se enfoca en UX, interactividad, animaciones y conversión.
- **Contratos de API Estables**: Cualquier cambio en la firma de datos de los endpoints (`/api/products`, `/api/content`, `/api/orders`, `/api/admin/*`) debe actualizarse sincrónicamente en los tipos compartidos y en `docs/backend.md`.
- **CORS y Seguridad**: El backend solo acepta peticiones desde los dominios autorizados especificados en `FRONTEND_URL` (`.env`); la consola tiene su propio origen explícito, `ADMIN_URL`, con credenciales.
- **Verificación de Edad (+18)**: Toda sesión de usuario debe validar la mayoría de edad antes de interactuar con el catálogo de ventas, persistiendo la confirmación en almacenamiento local con expiración.
