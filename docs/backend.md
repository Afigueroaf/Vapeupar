# Backend API - Vapeupar

## Propósito
El backend de Vapeupar es un servicio REST desarrollado en **TypeScript** con **Node.js** y **Express.js**, enfocado en la gestión de inventario, catálogo de vaporizadores, marcas, categorías, validación estricta de esquemas y procesamiento seguro de consultas.

## Seguridad y Resiliencia
- **Cabeceras de Seguridad (Helmet)**: Configurado para proteger la API contra ataques de scripting entre sitios (XSS), sniffing de tipo MIME y clickjacking.
- **Limitación de Tasa (Rate Limiting)**: Tres límites, del más estricto al más laxo, y los tres se aplican: 10 intentos fallidos por 15 minutos en `/api/admin/auth/login`, 30 peticiones por minuto en `/api/admin` y 100 por minuto en `/api/*`. Por eso una ráfaga contra la consola se corta antes que la del público.
- **Validación con Esquemas Zod**: Toda entrada de parámetros de consulta (`query`) y parámetros de ruta (`params`) se somete a validación estricta con esquemas Zod en tiempo de ejecución.
- **Manejo Centralizado de Errores**: Middleware global que captura excepciones no controladas y enmascara detalles técnicos internos en entornos de producción.
- **Cierre Elegante (Graceful Shutdown)**: Captura de señales `SIGINT` y `SIGTERM` para finalizar conexiones HTTP de manera ordenada.

## Ejecución Local
- Modo desarrollo con recarga en caliente:
  ```bash
  npm run dev:backend
  # O dentro de la carpeta backend/:
  npm run dev
  ```
- Compilación a JavaScript:
  ```bash
  npm run build:backend
  # O dentro de la carpeta backend/:
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
│   ├── catalog/         # Etiquetas de categoría y claves de imagen
│   ├── config/          # Configuración de Cognito, validada bajo demanda
│   ├── db/              # Cliente de Prisma bajo demanda
│   ├── middleware/      # Sesión en cookies, requireAuth y requireRole
│   ├── repositories/    # Acceso a datos: interfaz + Prisma + memoria (tests)
│   ├── routes/          # Rutas Express; routes/admin/ es la superficie autenticada
│   ├── schemas/         # Esquemas de validación Zod; schemas/admin/ los del admin
│   ├── services/        # Catálogo, inventario, auditoría y sesión con Cognito
│   ├── types/           # Interfaces y tipos TypeScript compartidos (product.types.ts)
│   ├── app.ts           # Armado de la aplicación (middlewares, CORS, límites, rutas)
│   └── index.ts         # Arranque del proceso: escucha el puerto y cierra elegante
├── tsconfig.json        # Configuración TypeScript NodeNext / ES2022 (strict: true)
├── package.json         # Scripts y dependencias
├── prisma/
│   ├── schema.prisma    # Modelo de datos (ADR-002 §3)
│   ├── migrations/      # Migraciones SQL versionadas
│   ├── seed.ts          # Semilla idempotente desde assets/brands/
│   └── sync-app-role.ts # Contraseña del rol vapeupar_app desde Secrets Manager
├── prisma.config.ts     # Configuración del CLI de Prisma 7
└── .env                 # Variables de entorno locales (ver .env.example)
```

Los servicios reciben su repositorio por constructor: en runtime el de Prisma, en
los tests uno en memoria con un fixture propio. Las etiquetas de categoría solo se
declaran en `src/catalog/categories.ts`.

**Inventario.** `stock.service.ts` es el único código que escribe movimientos y
`Variant.stockCache`: cada operación bloquea la variante, valida signo, motivo,
negativos e idempotencia (`operationKey`), y escribe movimiento, caché y
auditoría en una sola transacción. Ver el registro de A3 en
`docs/admin-console-execution-plan.md`. El cliente generado vive en `src/generated/prisma`
(ignorado por git; `npm run db:generate` o `prebuild` lo regeneran).

## Superficie autenticada: `/api/admin` (A4)

Consola de administración. Todo lo que no sea `/auth` exige sesión; el orden de
montaje en `routes/admin/index.ts` es la frontera, de modo que una ruta nueva
nace protegida.

| Método y ruta | Rol | Qué hace |
|---|---|---|
| `POST /api/admin/auth/login` | — | Abre sesión. Con la contraseña temporal de la invitación responde `new_password_required` |
| `POST /api/admin/auth/new-password` | — | Resuelve ese reto y abre sesión |
| `POST /api/admin/auth/logout` | sesión | Revoca los refresh tokens en Cognito y borra las cookies |
| `GET /api/admin/me` | sesión | Identidad y rol del usuario de la sesión |
| `GET /api/admin/stock` | sesión | Inventario paginado. `?q=&brandId=&lowStock=&threshold=&page=&limit=` |
| `POST /api/admin/stock/movements` | sesión | Registra un movimiento. `201`, o `200` si fue un reintento (`replayed`) |
| `GET /api/admin/stock/:variantId/kardex` | sesión | Kardex de la variante. `?from=&to=` |
| `POST /api/admin/users/invite` | **owner** | Invita a la consola y crea la fila en `User` |
| `POST /api/admin/users/:id/deactivate` | **owner** | Desactiva la fila y deshabilita la cuenta en el pool |

**Sesión.** Los tokens de Cognito viven en cookies `httpOnly` + `SameSite=Strict`
limitadas a `/api/admin` (y `Secure` en producción). El JavaScript de la consola
nunca ve un token, así que un XSS no se lleva la sesión. Cuando el access token
vence, `requireAuth` lo renueva con el refresh token y la petición continúa; el
cliente solo nota un `Set-Cookie` nuevo.

**Dos puertas, dos códigos.** Cognito dice quién eres: si eso falla, `401`. La
tabla `User` dice si puedes entrar: si no hay fila activa para ese `sub`, `403`,
porque reintentar el login no cambiaría nada. Desactivar a alguien es, por tanto,
una escritura en la base; Cognito solo se usa además para cerrarle las sesiones
abiertas.

**El autor no se acepta del cliente.** `POST /stock/movements` ignora cualquier
`userId` del cuerpo y firma el movimiento con el de la sesión: lo que queda en
`AuditLog` es quien lo hizo de verdad.

**Primer acceso.** La ruta de invitación exige ser `owner`, así que el primero
entra por script:

```bash
npm run admin:invite -- correo@dominio.com            # rol owner por defecto
npm run admin:invite -- otro@dominio.com --role operator
```

Necesita credenciales de AWS y el túnel abierto. Cognito envía la contraseña
temporal por correo y vence en 3 días.

## Base de Datos (PostgreSQL en AWS RDS + Prisma 7)

La base solo es alcanzable por túnel (`docs/infrastructure-aws.md`). Desde la raíz:

```bash
npm run infra:env-backend   # escribe DATABASE_URL y MIGRATE_DATABASE_URL en backend/.env
npm run infra:db-tunnel     # en otra terminal; dejarla abierta
npm run db:migrate          # aplica migraciones pendientes (usuario maestro)
npm run db:sync-app-role    # habilita el login de vapeupar_app
npm run db:seed             # catálogo inicial desde assets/brands/
```

- **El catálogo público sale de la base.** Solo se sirven productos `published`
  con precio; tras la semilla todos están en borrador, así que `/api/products`
  devuelve una lista vacía hasta que se publiquen desde la consola (A5.3). Sin
  túnel la API responde 500 y el frontend usa `FALLBACK_PRODUCTS`.
- **Dos credenciales.** `DATABASE_URL` usa el rol `vapeupar_app` (runtime, sin DDL);
  `MIGRATE_DATABASE_URL` usa el maestro y solo la lee el CLI de Prisma.
- **Nueva migración:** `npm run db:migrate:create --workspace=backend -- --name <nombre>`
  una sola vez, revisar el SQL y aplicar con `npm run db:migrate`. Si crea una
  tabla, la misma migración debe conceder sus permisos a `vapeupar_app`.

## Endpoints Disponibles

### 1. `GET /health`
Verifica el estado del servicio y el timestamp del servidor.
**Respuesta:**
```json
{
  "status": "ok",
  "service": "vapeupar-backend",
  "timestamp": "2026-10-21T20:00:00.000Z"
}
```

### 2. `GET /api/products`
Obtiene la lista de productos filtrables y paginados.
- **Parámetros de consulta validados con Zod:**
  - `category`: `disposables` | `pod-systems` | `mods-tanks` | `salt-nic` | `freebase-liquids` | `coils-accessories`
  - `brand`: nombre de la marca (ej: `Lost Mary`, `Geekvape`, `OXVA`)
  - `search`: búsqueda libre por nombre, descripción, sabor o etiquetas (máx. 100 caracteres)
  - `nicotine`: filtro por concentración de nicotina (ej: `50mg`, `35mg`, `0mg`)
  - `minPrice`: precio mínimo en COP (entero positivo)
  - `maxPrice`: precio máximo en COP (entero positivo)
  - `featured`: `true` | `false`
  - `page`: número de página (por defecto `1`)
  - `limit`: productos por página (por defecto `20`, máx. `50`)
  - `sortBy`: `price` | `name` | `puffCount`
  - `sortOrder`: `asc` | `desc` (por defecto `asc`)

**Respuesta Exitosa (200 OK):**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 6,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

**Respuesta de Error de Validación (400 Bad Request):**
```json
{
  "success": false,
  "message": "Parámetros de consulta inválidos",
  "errors": [
    {
      "field": "minPrice",
      "message": "El precio mínimo no puede ser mayor que el precio máximo"
    }
  ]
}
```

### 3. `GET /api/products/categories`
Obtiene las categorías disponibles con su conteo de productos.

### 4. `GET /api/products/id/:id`
Obtiene un producto por su identificador único interno (UUID). Un id con otro formato, o de un producto en borrador, responde 404.

### 5. `GET /api/products/:slug`
Obtiene los detalles completos de un producto por su slug alfanumérico amigable (ej. `lifepod-eco-pro`).
