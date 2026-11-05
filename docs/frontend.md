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
│   ├── touch-cursor.tsx          # Cursor virtual táctil y desplazamiento por zonas (solo móvil)
│   ├── ui/                       # Primitivas del sistema VP (Button, Surface, Field…)
│   └── admin/                    # Armazón, listas, formularios del catálogo y kardex
├── lib/
│   ├── utils.ts                  # Utilidades cn(), formato COP y fecha es-CO
│   ├── touch-cursor.ts           # Números, curva de velocidad y estado del cursor táctil
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

## Cursor táctil (solo móvil)

El sistema VP dibuja media interfaz «al apuntar»: borde lima de la tarjeta,
lámina holográfica que sigue al puntero, inclinación 3D, empuje de la nube de
puntos, cabeceo del prisma. En un teléfono no hay puntero, y Tailwind compila
`hover:*` dentro de `@media (hover: hover)`, así que **nada de eso se veía
nunca desde un móvil**. El cursor táctil lo rescata con un gesto.

**El gesto.** Dedo quieto 350 ms → aparece un cursor 56px por encima del dedo.
Desde ahí, la posición del dedo manda el desplazamiento por zonas: 40% superior
sube, 20% central quieto, 40% inferior baja, con velocidad proporcional al
cuadrado de la distancia a la franja central (tope 1200 px/s). La página se
desliza **por debajo** del cursor, de modo que los elementos se encienden al
pasar bajo la punta. Al levantar el dedo se pulsa lo que estuviera señalado,
salvo que la página se haya movido en los últimos 150 ms.

**Reparto.** `lib/touch-cursor.ts` tiene los números, la curva de velocidad y
el estado compartido; `components/touch-cursor.tsx`, la maquinaria de eventos;
`globals.css` §CURSOR TÁCTIL, lo que es estilo. Se monta en `app/page.tsx` y
**no** en el layout raíz: la consola de administración se queda con táctil
normal.

**Cómo se simula el puntero.** `:hover` no se puede falsificar, y el real lo
decide la posición del dedo, que va 56px por debajo de la punta y casi siempre
sobre otro elemento. Así que:

1. Se despacha en la punta la secuencia completa de eventos de puntero y de
   ratón, incluidos los de frontera (`pointerenter`/`pointerleave`), que no
   burbujean y hay que emitir elemento a elemento contra el ancestro común.
   De esos eventos ya vivían `ui/card-field.tsx`, `vaporizer-point-cloud.tsx`
   y `prism/scene.ts`: no se ha tocado la lógica de ninguno, solo se les ha
   quitado la exigencia de puntero fino a los dos primeros.
2. La cadena bajo la punta se marca con `.vp-hot`, y `globals.css` redefine la
   variante `hover` de Tailwind para que todas las utilidades `hover:*` del
   proyecto respondan también a esa clase. Las reglas escritas a mano de la
   tarjeta llevan su espejo `.vp-hot` y descuelgan el `:hover` real mientras el
   cursor está encendido (si no, se encenderían dos tarjetas: la señalada y la
   que tapa el dedo).
3. Los eventos **reales** del dedo se detienen en la fase de captura de
   `window` y no llegan a la página. Sin eso todo pasaría dos veces y en dos
   sitios distintos. Los sintéticos se distinguen por `isTrusted === false`.

**Decisiones, con su motivo:**

| Decisión | Por qué |
| --- | --- |
| 350 ms y 10px de tolerancia | Por debajo de ~250 ms el cursor se cuela en deslices lentos. El desliz nativo queda intacto: si el dedo se mueve antes, manda el navegador. |
| Velocidad al cuadrado | Las zonas miden el 40% de pantalla. Lineal, al borde mismo del centro ya iría a 300 px/s y no habría forma de posar el cursor sobre una tarjeta. |
| Levantar el dedo = clic, con guarda de 150 ms sin scroll | Es el modo de pulsar sin salir del gesto; la guarda evita que terminar un recorrido largo abra un producto. |
| El clic se despacha **síncrono** en `pointerup` | La activación de usuario solo vive durante el gesto. Fuera de ella el antipopups bloquearía los `<a target="_blank">` (WhatsApp, CTA de cada tarjeta). |
| `preventDefault` en `touchmove`, no solo `touch-action: none` | El navegador fija `touch-action` al empezar el gesto, y el cursor nace 350 ms después. |
| Selección de texto apagada en **todo** el táctil, no solo durante el gesto | Colgada del gesto llegaba 350 ms tarde: la espera del dedo ya había arrancado la selección del navegador —pinzas azules y barra de copiar— y apagarla después no la retira. Los campos de formulario quedan fuera, o no habría cursor de texto que arrastrar. El escritorio conserva seleccionar y copiar. |
| Vibración de 10 ms al encender | Confirma que el modo entró. Android sí; iOS no expone vibración desde la web y ahí no hace nada. |
| Rótulo traslúcido abajo a la izquierda | El gesto no se descubre solo. Va `aria-hidden`: es una pista de puntero, y con lector de pantalla se navega con otros gestos. La derecha es del botón de WhatsApp. |

**Dos trampas que el cursor destapó** (ninguna de las dos era visible mientras
`pointerEnabled` se medía una sola vez al montar; en caliente sí):

- **La nube volvía de golpe al apagar el cursor.** `cursorScatter` se pasaba
  como `pointerEnabled ? cursorScatter : 0`, y ese valor acaba en `uScatter`,
  que es la **amplitud** del desplazamiento (`point-material.ts`: `escape *
  (uScatter * influence)`). Cortarla teletransporta a su sitio cualquier
  partícula suelta, aunque su estado siga decayendo en la textura — el mismo
  tirón que `scatter-field.ts` se había propuesto quitar. Ahora la amplitud no
  se toca: lo que apaga la interacción es poner `inside` en falso, y el campo
  devuelve lo que había a su ritmo (`CURSOR_RELEASE`).
- **`setPointerCapture` con un puntero que no existe.** El cursor despacha su
  secuencia de clic con un identificador propio (`VIRTUAL_POINTER_ID`), que no
  es ningún puntero activo del navegador, así que `setPointerCapture` lanza
  `NotFoundError`. En `prism/scene.ts` la excepción abortaba el manejador justo
  antes de resolver el panel pulsado y el toque dejaba de centrar la cara; va
  en `try/catch`, porque la captura es una mejora para arrastrar fuera del
  lienzo y no un requisito. **Cualquier código nuevo que llame a
  `setPointerCapture` tiene que tolerar lo mismo.**

**Lo que no hace, a propósito:** no se activa sobre campos de formulario ni
dentro de la puerta +18 (`[aria-modal]`); no abre el desplegable nativo de un
`<select>` —un `click` sintético no lo abre en ningún navegador, y el toque
corto normal sigue sirviendo—; no da el foco al elemento que pulsa, igual que
un ratón; y respeta `prefers-reduced-motion` allí donde ya se respetaba (la
inclinación de las tarjetas sigue sin activarse).

**PENDIENTE DE PROBAR EN UN TELÉFONO DE VERDAD.** El gesto no se puede
verificar con el emulador: el código exige `isTrusted`, así que ningún evento
inyectado por herramientas lo dispara, y Chrome ya no aplicaba `:active` a los
toques sintéticos del protocolo (ver el aviso de `globals.css` §LÁMINA
HOLOGRÁFICA). Lo comprobado hasta ahora es la compilación del CSS —las ramas
`.vp-hot` se emiten— y la curva de velocidad, no el gesto.

## Ejecución Local
```bash
npm run dev:frontend
```
Acceso: `http://localhost:3000`, y la consola en `http://localhost:3000/admin`.
Necesita el backend levantado (`npm run dev:backend`) con `NEXT_PUBLIC_API_URL`
apuntando a él: sin backend, la consola muestra «Sesión no disponible» porque no
puede comprobar la sesión.
