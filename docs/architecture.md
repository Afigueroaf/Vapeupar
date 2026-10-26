# Arquitectura de Vapeupar

## 1. Visión General del Sistema

Vapeupar es una plataforma moderna de comercio digital especializada en la venta de vaporizadores, sales de nicotina, pods recargables y accesorios.
El sistema se compone de una arquitectura desacoplada:

1. **Frontend (`frontend/`)**:
   - **Framework**: Next.js 16 (App Router) + React 19.
   - **Lenguaje**: TypeScript.
   - **Estilos**: Tailwind CSS v4 + iconos Lucide React + componentes accesibles.
   - **Responsabilidad**: Presentación de landing page de alta conversión, banner y modal de verificación de edad (+18), catálogo interactivo con filtros avanzados (categoría, sabor, nivel de nicotina, rango de precio, puffs), carrito de compras local y flujo directo de checkout / pedido rápido por WhatsApp y pasarela.

2. **Backend (`backend/`)**:
   - **Runtime**: Node.js + TypeScript (compilado con `tsc` y ejecutado en desarrollo con `tsx`).
   - **Framework**: Express.js con tipado estricto y validaciones con Zod.
   - **Responsabilidad**: Exposición de API REST para productos, categorías, marcas, inventario, configuración de tienda y futuro procesamiento de pedidos.

3. **Capa de Datos**:
   - En esta fase inicial: servicio desacoplado en memoria con tipado estricto (`ProductService`), listo para conectarse a PostgreSQL / Prisma / Supabase sin romper contratos de API.
   - **Fase 2 (decidida, no implementada)**: Supabase (PostgreSQL + Auth + Storage) + Prisma, accesible únicamente desde el backend, con modelo de inventario por libro de movimientos y consola de administración. Ver [ADR-002](decisions/002-consola-de-administracion-y-persistencia.md) y `docs/admin-console-execution-plan.md`.

```
+-------------------------------------------------------+
|                       CLIENTE                         |
|  (Navegador Móvil / Desktop - Verificación de +18)    |
+-------------------------------------------------------+
                           |
                           v
+-------------------------------------------------------+
|                 FRONTEND (Next.js 16)                 |
|  - Landing Page Hero & Promos                         |
|  - Filtros y Catálogo de Productos Dinámico           |
|  - Modal de Verificación de Mayoría de Edad           |
|  - Carrito de Compras Local (LocalStorage / Context)  |
|  - Generador de Pedido vía WhatsApp Directo           |
+-------------------------------------------------------+
                           |
            REST API (JSON sobre HTTP/HTTPS)
                           |
                           v
+-------------------------------------------------------+
|               BACKEND API (Node/Express TS)           |
|  - /health (Monitoreo)                                |
|  - /api/products (Filtros, Búsqueda, Paginación)      |
|  - /api/products/categories (Taxonomía Vape)          |
|  - /api/products/:slug (Detalle técnico del producto) |
+-------------------------------------------------------+
                           |
+-------------------------------------------------------+
|                    BASE DE DATOS                      |
|       (Fase 1: In-memory Typed / Fase 2: PostgreSQL)  |
+-------------------------------------------------------+
```

## 2. Límites de Responsabilidad y Reglas de Arquitectura

- **Separación de Lógica**: La lógica de negocio del catálogo, inventario y cálculos de precios vive en el backend (`backend/src/services/`). El frontend consume los endpoints y se enfoca en UX, interactividad, animaciones y conversión.
- **Contratos de API Estables**: Cualquier cambio en la firma de datos de los endpoints (`/api/products`) debe actualizarse sincrónicamente en los tipos compartidos y en `docs/backend.md`.
- **CORS y Seguridad**: El backend solo acepta peticiones desde los dominios autorizados especificados en `FRONTEND_URL` (`.env`).
- **Verificación de Edad (+18)**: Toda sesión de usuario debe validar la mayoría de edad antes de interactuar con el catálogo de ventas, persistiendo la confirmación en almacenamiento local con expiración.
