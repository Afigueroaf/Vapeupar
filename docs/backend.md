# Backend API - Vapeupar

## Propósito
El backend de Vapeupar es un servicio REST desarrollado en **TypeScript** con **Node.js** y **Express.js**, enfocado en la gestión de inventario, catálogo de vaporizadores, marcas, categorías y procesamiento de pedidos.

## Ejecución Local
- Modo desarrollo con recarga en caliente:
  ```bash
  cd backend
  npm run dev
  ```
- Compilación a JavaScript:
  ```bash
  npm run build
  ```
- Producción:
  ```bash
  npm start
  ```

## Estructura de Directorios
```
backend/
├── src/
│   ├── config/          # Variables de entorno y configuración
│   ├── data/            # Mock dataset inicial con tipado estricto
│   ├── routes/          # Rutas Express (/api/products, etc.)
│   ├── services/        # Lógica de negocio (filtrado, stock, cálculos)
│   ├── types/           # Interfaces y tipos TypeScript compartidos
│   └── index.ts         # Punto de entrada de la aplicación Express
├── tsconfig.json        # Configuración TypeScript NodeNext / ES2022
├── package.json         # Scripts y dependencias
└── .env                 # Variables de entorno locales
```

## Endpoints Disponibles

### 1. `GET /health`
Verifica el estado del servicio.
**Respuesta:**
```json
{
  "status": "ok",
  "service": "vapeupar-backend",
  "timestamp": "2026-10-21T20:00:00.000Z"
}
```

### 2. `GET /api/products`
Obtiene la lista de productos filtrables.
- **Parámetros de consulta (Query Params):**
  - `category`: `disposables` | `pod-systems` | `mods-tanks` | `salt-nic` | `freebase-liquids` | `coils-accessories`
  - `brand`: nombre de la marca (ej: `Lost Mary`, `Geekvape`, `OXVA`)
  - `search`: búsqueda libre por nombre, descripción, sabor o etiquetas
  - `minPrice`: precio mínimo en COP
  - `maxPrice`: precio máximo en COP
  - `featured`: `true` | `false`
**Respuesta:**
```json
{
  "success": true,
  "data": [...],
  "total": 6
}
```

### 3. `GET /api/products/categories`
Obtiene las categorías disponibles con su conteo de productos.

### 4. `GET /api/products/:slug`
Obtiene los detalles completos de un producto por su slug amigable.

## Reglas de Desarrollo
1. Toda lógica de negocio debe residir en `src/services/`, no en los controladores o routers.
2. Todas las estructuras deben estar fuertemente tipadas en `src/types/`.
3. Mantener contratos de datos consistentes con el frontend.
