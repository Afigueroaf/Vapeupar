# Frontend - Vapeupar (Next.js & React)

## Propósito
El frontend de Vapeupar es la interfaz web del cliente y catálogo interactivo construido con **Next.js 16** (App Router), **React 19**, **Tailwind CSS v4** y **TypeScript**.

> ⚠️ **Nota sobre el alcance de este documento.**
> Lo que sigue describe la **funcionalidad, accesibilidad y resiliencia**, que se conservan
> intactas. **No describe la capa visual**, que se rehízo por completo en las fases V0 a V7
> del rediseño: fuentes Oxanium + Press Start 2P, paleta lima/violeta sobre negro, geometría
> angular de radio cero y bordes de 2px, y primitivas en `src/components/ui/`. Donde este
> documento mencione colores, formas o tamaños, manda el plan de ejecución.
>
> Siguen siendo de validación, no definitivos: las imágenes de producto (stock de Unsplash)
> y el copy.
>
> - Inventario de reemplazo: [`design-reset-inventory.md`](./design-reset-inventory.md)
> - Plan de ejecución visual y registro: [`design-execution-plan.md`](./design-execution-plan.md)

## Principales Funcionalidades y Mejoras de Resiliencia

1. **Modal de Control de Edad (+18) con TTL y Accesibilidad WCAG**:
   - Bloquea la navegación de usuarios no verificados.
   - **Expiración de 30 días**: Valida `vapeupar_age_verified_at` mediante timestamp numérico en `localStorage`. Si expira, solicita confirmación nuevamente.
   - **Accesibilidad**: Atributos `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`, bloqueo de scroll de fondo y trampa de foco.
   - Manejo amigable y pantalla de bloqueo en caso de selección "Menor de edad".

2. **Navegación Fluida y Menú Móvil (Mobile-First)**:
   - Barra de navegación con logo, accesos directos, botón de pedido por WhatsApp y badge de carrito.
   - **Menú hamburguesa responsive** desplegable en pantallas móviles (`< 768px`) con acceso directo a categorías (`#desechables`, `#pods`, `#liquidos`) y preguntas frecuentes (`#faq`).

3. **Catálogo Interactivo con Filtros Avanzados**:
   - Filtrado en tiempo real por categoría (Desechables, Pods, Sales, E-líquidos, Mods, Resistencias).
   - Detección automática de anclas URL (`hashchange` para sincronizar enlaces de navegación con el estado activo del catálogo).
   - Búsqueda instantánea accesible con `<label>` y `aria-label`.
   - Filtro por marcas y ordenamiento dinámico (Destacados, Menor precio, Mayor precio, Más caladas).

4. **Tarjetas de Producto Semánticas (`<article>`) y Control de Stock**:
   - Tarjetas construidas como `<article>` con etiquetas `aria-label` descriptivas.
   - **Validación estricta de `inStock`**: Si el producto está agotado (`inStock === false` o `stock === 0`), se muestra la etiqueta "Agotado", se desactiva el botón de compra inmediata y se ofrece "Consultar Reposición".
   - Imágenes optimizadas con `next/image` y dominios seguros restringidos en `next.config.ts`.
   - Objetivos táctiles móviles optimizados (mínimo 44px de altura).

5. **Sección de Preguntas Frecuentes (FAQ)**:
   - Acordeón interactivo accesible con información clave: domicilios express en Valledupar, métodos de pago (Nequi, Daviplata, Contra entrega), verificación de autenticidad QR y exigencia legal de cédula.

6. **SEO y Metadatos de Redes Sociales (OpenGraph & Twitter)**:
   - Configuración completa en `layout.tsx` para generar vistas previas atractivas al compartir enlaces por WhatsApp o redes sociales.

## Estructura de Componentes
```
frontend/src/
├── app/
│   ├── layout.tsx                # Metadata, Viewport, OpenGraph, Fonts y tema oscuro
│   ├── page.tsx                  # Landing page principal con ISR (revalidate: 60s)
│   ├── globals.css               # Import Tailwind v4 y soporte prefers-reduced-motion
│   └── (admin)/admin/            # Consola: layout propio, login y (panel)/{stock,products,brands,suppliers}
├── components/
│   ├── age-verification-modal.tsx# Modal +18 con TTL de 30 días y accesibilidad ARIA
│   ├── navbar.tsx                # Barra fija con menú móvil hamburguesa
│   ├── hero.tsx                  # Hero de alta conversión con propuestas de valor
│   ├── product-catalog.tsx       # Catálogo con búsqueda, filtros, ordenamiento y anclas
│   ├── product-card.tsx          # Tarjeta semántica (<article>) con verificación de stock
│   ├── faq.tsx                   # Acordeón de preguntas frecuentes (#faq)
│   ├── footer.tsx                # Pie de página con advertencia legal y jerarquía h3
│   ├── ui/                       # Primitivas del sistema VP (Button, Surface, Field…)
│   └── admin/                    # Armazón, listas, formularios del catálogo y kardex
├── lib/
│   ├── utils.ts                  # Utilidades cn(), formato COP y fecha es-CO
│   └── admin-api.ts              # Cliente de /api/admin (desde el navegador)
└── types/
    ├── product.ts                # Interfaces de datos sincronizadas con el backend
    └── admin.ts                  # Contrato de /api/admin visto desde la consola
```

## Consola de administración (`/admin`, fase A5)

Grupo de rutas `app/(admin)/admin/` con layout propio: sin navbar pública, sin
footer, sin verificación de edad y sin `.vp-glitch`. Comparte con el sitio el
layout raíz —tipografías y tokens VP— y las primitivas de `components/ui/`. Va
con `robots: noindex, nofollow`: es una herramienta interna.

| Ruta | Qué es |
|---|---|
| `/admin` | Redirección a `/admin/stock`; no tiene portada propia |
| `/admin/login` | Acceso, con el segundo paso de contraseña nueva cuando la invitación trae una temporal |
| `/admin/stock` | Pantalla de inventario (A5.1): alertas, búsqueda, filtro de bajo stock, movimiento en línea y kardex |
| `/admin/products` | Líneas y variantes (A5.3): filtros por marca, categoría y estado; alta y edición con **precio**; panel de variantes; aviso de qué falta para publicar |
| `/admin/brands` | Marcas (A5.2): alta y edición, orden de aparición y marca aliada |
| `/admin/suppliers` | Proveedores (A5.2): ficha con las marcas que trae, variantes abastecidas y último ingreso; edición con el vínculo N↔N |

**Las peticiones salen del navegador, no del servidor de Next.** Es la
desviación más importante respecto del plan, que preveía un `proxy.ts` (el
antiguo `middleware.ts`, renombrado en Next 16) y Server Actions reenviando la
cookie de sesión. No es posible: las cookies que pone el backend son `httpOnly`
con `Path=/api/admin` sobre **su** origen (A4.1), así que el navegador solo las
manda a esas rutas y el servidor de Next no las ve nunca. Un Server Action no
puede reenviar lo que no recibe, y un `proxy.ts` no puede comprobar una sesión
que no ve. De ahí `credentials: "include"` en `lib/admin-api.ts` y el CORS
propio del admin con origen explícito (`ADMIN_URL`).

La consecuencia es que **la puerta de `/admin` es navegación, no defensa**:
`components/admin/admin-shell.tsx` llama a `GET /api/admin/me` al montar y
manda a `/admin/login` si responde 401. Quien entre a la URL sin sesión ve el
armazón un instante y acaba en el login, pero no obtiene ningún dato: la
defensa está en el backend, que exige sesión en cada petición. La propia
documentación de Next dice que el proxy no sirve como gestión de sesión.

No hay ningún token en `localStorage` ni en memoria del cliente: no hay token
que guardar. Cerrar sesión es una llamada al backend, que revoca en Cognito y
borra las cookies.

**Lo que comparten las cuatro pantallas** vive en `components/admin/`:
`record-list.tsx` (la rejilla con paneles desplegables, que no es un `<table>`
para no obligar a desplazamiento horizontal en un teléfono, y que resuelve el
`aria-expanded`/`aria-controls` del desplegable en un solo sitio),
`use-admin-query.ts` (la lectura con el estado de carga **derivado**, porque
React 19 prohíbe marcarlo con `setState` dentro del efecto que pide los datos),
`screen.tsx` (cabecera, paginación y vacíos) y `form.tsx` (etiqueta, casilla,
grupo de campos y las dos líneas de aviso con su rol ARIA).

**Las escrituras son del dueño.** Cualquier sesión lee; crear y editar marcas,
proveedores, líneas y variantes es `owner` (A4). Las pantallas ocultan los
botones de escritura a un `operator`, y el backend responde `403` de todos
modos: lo que se oculta es ruido, no la defensa. Tampoco hay borrado en ningún
formulario: retirar algo del sitio es desactivarlo o pasarlo a borrador, porque
el libro de inventario y las líneas referencian con `Restrict`.

## Ejecución Local
```bash
npm run dev:frontend
```
Acceso: `http://localhost:3000`, y la consola en `http://localhost:3000/admin`.
Necesita el backend levantado (`npm run dev:backend`) con `NEXT_PUBLIC_API_URL`
apuntando a él: sin backend, la consola muestra «Sesión no disponible» porque no
puede comprobar la sesión.
