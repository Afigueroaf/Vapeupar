# Plan de Ejecución Visual — VP (Fases V0 a V3)

> Plan de los **primeros cambios visuales** del rediseño. Parte del inventario completo de
> reemplazo en [`design-reset-inventory.md`](./design-reset-inventory.md) y de la dirección
> de identidad definida para VP: Oxanium + Press Start 2P, paleta lima/violeta sobre negro,
> geometría angular y bordes gruesos.
>
> **Criterio de orden**: primero los fundamentos que todo lo demás consume (tipografía y
> tokens), luego las primitivas, y solo después las secciones visibles. Rediseñar el hero
> antes de tener tokens obliga a rehacerlo dos veces.

---

## Resumen de fases

| Fase | Objetivo | Archivos | Estado |
|---|---|---|---|
| **V0** | Limpieza previa (sin cambio visual) | `public/`, `page.tsx`, `src/data/`, `src/lib/contact.ts` | ✅ **Ejecutada** |
| **V1** | Fundamentos: fuentes + tokens | `layout.tsx`, `globals.css` | ✅ **Ejecutada** |
| **V2** | Primitivas de UI | `src/components/ui/` | ✅ **Ejecutada** |
| **V3** | Hero + Navbar reconstruidos | `hero.tsx`, `navbar.tsx`, `trust-band.tsx` | ✅ **Ejecutada** |
| **V4** | Tarjeta de producto + efecto de tarjeta | `product-card.tsx`, `ui/card-field.tsx`, `globals.css` | ✅ **Ejecutada** |
| **V5** | Catálogo y filtros | `product-catalog.tsx` | ✅ **Ejecutada** |
| **V6** | FAQ + footer | `faq.tsx`, `footer.tsx` | ✅ **Ejecutada** |
| **V7** | Modal +18 | `age-verification-modal.tsx` | ✅ **Ejecutada** |
| **V8** | Rutas nuevas y 3D | `/producto/[slug]`, `/coleccion/[categoria]`, `/nosotros` | ⬜ Pendiente |

Este documento **planificó** V0 a V3. Las fases V4 a V7 se ejecutaron después sin plan
previo escrito, a petición directa: su registro está en
[Registro de ejecución (V4 – V7)](#registro-de-ejecución-v4--v7), al final, con las
decisiones tomadas durante la ejecución. V8 sigue pendiente y no está planificada aquí.

---

## Fase V0 — Limpieza previa

**Por qué primero**: `page.tsx` tiene 160+ líneas de datos de producto incrustadas. Mientras
estén ahí, cualquier cambio de composición de la página mezcla diseño con datos en el mismo
diff y hace ilegible la revisión.

### V0.1 — Extraer los datos de respaldo

- Crear `frontend/src/data/fallback-products.ts` y mover `FALLBACK_PRODUCTS` allí.
- `page.tsx` queda solo con `getProducts()` y la composición de secciones.
- Mantener el comentario que marca la sincronía con `backend/src/data/mock-products.ts`.

### V0.2 — Borrar assets del template

- Eliminar `frontend/public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`.
- Verificar con una búsqueda que ninguno se referencia antes de borrar.

### V0.3 — Centralizar el contacto

- Crear `frontend/src/lib/contact.ts` con el número de WhatsApp, el teléfono y un
  constructor de enlaces (`waLink(message: string)`).
- Reemplazar las 4 lecturas duplicadas de `process.env.NEXT_PUBLIC_WHATSAPP_NUMBER`.
- **Quitar el valor por defecto `573001234567`**: si falta la variable de entorno, el CTA no
  debe apuntar a un número inventado. Documentar la variable en `.env.example`.

**Verificación V0**: `npm run build` en `frontend/` pasa y la página se ve idéntica a antes.

---

## Fase V1 — Fundamentos: tipografía y tokens

El cambio de mayor impacto por línea de código. Al terminar esta fase, **toda** la interfaz
cambia de fuente y de paleta sin tocar un solo componente, porque los componentes pasan a
consumir tokens.

### V1.1 — Cargar las fuentes

En `frontend/src/app/layout.tsx`, sustituir `Geist` y `Geist_Mono`:

```ts
import { Oxanium, Press_Start_2P } from "next/font/google";

const oxanium = Oxanium({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-oxanium",
  display: "swap",
});

const pressStart = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-press-start",
  display: "swap",
});
```

Y en el elemento raíz:

```tsx
<html lang="es" dir="ltr" className={`${oxanium.variable} ${pressStart.variable} h-full`}>
```

Notas de implementación:

- **Eliminar la clase `dark`** del `<html>`: es huérfana, no hay modo claro y VP es dark-only
  por identidad (inventario §2.6).
- **Eliminar `bg-zinc-950 text-zinc-100` del `<body>`** y dejar el fondo declarado solo en
  `globals.css` sobre tokens (inventario §2.3).
- Oxanium se pide con pesos explícitos porque el sistema solo usa 400 / 600 / 700.
- Press Start 2P **solo existe en peso 400**; cualquier `font-bold` sobre ella es un error.

### V1.2 — Declarar los tokens en Tailwind v4

En `frontend/src/app/globals.css`, reemplazar el bloque `:root` actual por un `@theme`, que
es la forma en que Tailwind v4 genera utilidades a partir de tokens. Esto resuelve el
problema de fondo del inventario §2.2: hoy las variables existen y **nadie las usa**.

```css
@import "tailwindcss";

@theme {
  /* --- Color --- */
  --color-vp-black: #080808;
  --color-vp-white: #f5f5f5;
  --color-vp-lime: #d7ff00;
  --color-vp-violet: #8b35ff;
  --color-vp-panel: #202020;

  /* Roles semánticos (lo que consumen los componentes) */
  --color-background: var(--color-vp-black);
  --color-foreground: var(--color-vp-white);
  --color-surface: var(--color-vp-panel);
  --color-action: var(--color-vp-lime);
  --color-action-ink: var(--color-vp-black);
  --color-accent: var(--color-vp-violet);
  --color-line: var(--color-vp-white);
  --color-muted: #8a8a8a;

  /* --- Tipografía --- */
  --font-display: var(--font-oxanium), system-ui, sans-serif;
  --font-pixel: var(--font-press-start), monospace;

  /* --- Geometría --- */
  --radius-vp: 0px;
  --radius-vp-chamfer: 2px;

  /* --- Movimiento --- */
  --ease-vp: cubic-bezier(0.2, 0, 0, 1);
}
```

Esto genera automáticamente `bg-background`, `text-foreground`, `bg-action`, `border-line`,
`font-display`, `font-pixel`, etc. **A partir de aquí, ningún componente escribe `zinc-*`,
`emerald-*` ni un hex literal.**

### V1.3 — Base del documento y escala tipográfica

En el mismo `globals.css`, después del `@theme`:

```css
body {
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-display);
}

h1, h2, h3, nav, button {
  font-family: var(--font-display);
}

/* Etiqueta pixel: único uso autorizado de Press Start 2P */
.vp-label {
  font-family: var(--font-pixel);
  font-size: 0.625rem;    /* 10px — mínimo del sistema */
  line-height: 1.8;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

Se **elimina** `font-feature-settings: "rlig" 1, "calt" 1` (ajuste heredado pensado para
Geist) y se **conserva intacto** el bloque `prefers-reduced-motion`.

### V1.4 — Escala tipográfica del sistema

Tabla de referencia que las fases V2–V3 aplican. Los tamaños móviles no son una reducción
proporcional: Oxanium a 80px en móvil rompe el layout, y Press Start 2P nunca baja de 10px.

| Rol | Fuente | Peso | Desktop | Móvil | Clase Tailwind |
|---|---|---|---|---|---|
| Titular de portada | Oxanium | 700 | 72px | 40px | `text-[2.5rem] sm:text-7xl` |
| Título de sección | Oxanium | 700 | 40px | 28px | `text-[1.75rem] sm:text-[2.5rem]` |
| Nombre de producto | Oxanium | 700 | 22px | 20px | `text-xl sm:text-[1.375rem]` |
| Precio | Oxanium | 700 | 28px | 24px | `text-2xl sm:text-[1.75rem]` |
| Navegación | Oxanium | 600 | 15px | 15px | `text-[0.9375rem] font-semibold` |
| Botón | Oxanium | 700 | 15px | 15px | `text-[0.9375rem] font-bold` |
| Párrafo | Oxanium | 400 | 17px | 16px | `text-base sm:text-[1.0625rem]` |
| Etiqueta pixel | Press Start 2P | 400 | 10px | 10px | `.vp-label` |

**Regla de proporción**: Oxanium ≈ 85–90 % del texto, Press Start 2P ≈ 10–15 %, y solo en
etiquetas de 1–3 palabras (`NEW DROP`, `LVL 01`, `PLAYER 01`, `[ SYSTEM ONLINE ]`).

**Verificación V1**:

- `npm run build` pasa.
- La página se ve "rota" en el sentido esperado: tipografía Oxanium en todo, pero los
  componentes aún llevan sus colores `zinc`/`emerald` hardcodeados. Es normal: V1 instala los
  fundamentos, V2–V3 los consumen.
- Inspeccionar en el navegador que `--font-oxanium` y `--font-press-start` están presentes en
  el `<html>` y que no se descarga ninguna fuente Geist.

---

## Fase V2 — Primitivas de UI

Crear `frontend/src/components/ui/` para dejar de repetir cadenas de 12 clases en cada
componente (inventario §10.2). Cada primitiva usa `cn()` de `src/lib/utils.ts`, que hoy está
sin usar (§10.4).

### V2.1 — `ui/pixel-label.tsx`

Etiqueta arcade. Reemplaza las pills redondeadas actuales.

- Variantes: `lime` (fondo lima, texto negro), `violet` (borde violeta, texto blanco),
  `outline` (borde blanco).
- Forma rectangular, borde de 2px, sin radio.
- Prop `as` para renderizar `span` o `div`.
- **Nunca acepta más de ~16 caracteres**: documentarlo en el JSDoc del componente.

### V2.2 — `ui/button.tsx`

- `primary`: fondo `action` (lima), texto `action-ink` (negro), borde 2px negro, Oxanium 700.
- `secondary`: fondo transparente, borde 2px `line`, texto `foreground`.
- `ghost`: solo texto, subrayado al hover.
- Alto mínimo **44px** en todas las variantes (conserva §9.5).
- Estado `:focus-visible` con contorno lima de 2px y offset de 2px.
- Micro-interacción: desplazamiento duro de 2px (`translate`) en lugar de `scale` (§8.1).

### V2.3 — `ui/surface.tsx`

Panel/tarjeta geométrica.

- Fondo `surface` (`#202020`) **con borde obligatorio de 2px**, porque el panel sobre el
  fondo da 1.2:1 de contraste y sin borde desaparece (inventario §11).
- Sin radio, sin `backdrop-blur`, sin sombra difusa. Si hace falta profundidad: offset duro.

### V2.4 — `ui/field.tsx`

Input de búsqueda y `select`.

- Borde 2px, sin radio, alto mínimo 44px, foco lima.
- El `select` nativo necesita `appearance-none` + chevron propio para ser estilizable
  (inventario §5.4).

**Verificación V2**: renderizar las cuatro primitivas con todas sus variantes en una ruta
temporal `/_dev/ui` (o un archivo de prueba), comprobar foco con teclado y medir contraste de
cada variante contra la tabla de §11 del inventario.

---

## Fase V3 — Hero y Navbar

Primera pantalla con identidad VP completa. Consume V1 y V2.

### V3.1 — Navbar

Estructura propuesta (inventario §6.3):

```
VP®        TIENDA · COLECCIONES · NOSOTROS        [WhatsApp]  [Carrito]
```

- Logo: `VP®` como lockup tipográfico en Oxanium 700 (placeholder tipográfico hasta que
  exista el SVG definitivo). **Fuera el icono `Flame`** (§4.1).
- Enlaces en Oxanium 600 a 15px, separados por `·`.
- Fondo sólido `background` con **regla inferior de 2px** en `line`, sin `backdrop-blur` (§3.5).
- Menú móvil: se conserva la lógica de estado y los atributos `aria-expanded`/`aria-label`
  existentes; se rehace solo la presentación (panel a pantalla completa, enlaces en Oxanium
  600 a mayor tamaño, objetivos táctiles de 44px).

### V3.2 — Hero

Composición propuesta:

```
[ SYSTEM ONLINE ]          <- .vp-label, variante outline

LEVEL UP                   <- Oxanium 700, 72px desktop / 40px móvil
YOUR STYLE.

Dispositivos, accesorios y cultura digital
en una sola frecuencia.    <- Oxanium 400, 17px

[ EXPLORAR TIENDA ↗ ]      <- Button primary, único CTA primario de la vista

                           <- espacio reservado para el modelo 3D del producto
```

- **Eliminar** los dos `div` de ambient glow con `blur-3xl` (§3.4).
- **Eliminar** el gradiente de texto del H1 y los gradientes de fondo y de CTA (§2.4).
- Pasar de composición centrada a composición asimétrica: texto alineado a la izquierda y
  una columna reservada para el render 3D del producto. En móvil, la columna del 3D se coloca
  bajo el titular con `aspect-square`.
- En esta fase el espacio del 3D se ocupa con un bloque placeholder geométrico (borde violeta
  de 2px). La decisión técnica del 3D (secuencia de imágenes vs. `<model-viewer>` vs. React
  Three Fiber) se trata en una fase posterior con presupuesto de peso propio.
- El módulo de 3 "value props" con iconos **sale del hero** (§5.7): se reubica como una banda
  propia entre el hero y el catálogo, en una fase posterior.
- `aria-label` de la sección y jerarquía de encabezados: se conservan.

### V3.3 — Verificación de la fase

1. `npm run build` pasa sin errores de TypeScript ni de ESLint.
2. Revisar a 375px, 768px y 1440px de ancho.
3. Navegación completa con `Tab`: foco visible en todos los elementos interactivos del
   navbar y del hero.
4. Contraste medido de cada combinación nueva contra la tabla de §11.
5. Capturas de antes/después de la primera pantalla para registrar el avance.

---

## Alcance explícito de este plan

**Incluye**: fuentes, tokens de color y tipografía, primitivas de UI, navbar y hero.

> **Nota posterior.** Lo que sigue era el "no incluye" de V0–V3. Las últimas cuatro
> entradas (rediseño visual del modal +18, catálogo, tarjeta de producto, FAQ y footer)
> **ya están ejecutadas** en V4–V7; el resto sigue vigente. Ver el registro del final.

**No incluye** (fases posteriores, ya inventariadas):

- Logo VP definitivo en SVG, favicon e icon set (§4.1, §4.3) — requiere los archivos de marca.
- Fotografía real de producto y renders 3D (§7.1, §7.5) — requiere los assets del negocio.
- Imagen de OpenGraph propia (§7.2).
- Decisión sobre el set de iconografía (§4.5).
- Datos reales de contacto, horarios y teléfono (§6.9) — requiere confirmación del negocio.
- Rutas nuevas: `/producto/[slug]`, `/coleccion/[categoria]`, `/nosotros` (§5.6).
- Rediseño visual del modal +18, catálogo, tarjeta de producto, FAQ y footer.

## Dependencias externas que conviene resolver en paralelo

1. **Logo VP en SVG** (y su versión monocroma para el favicon).
2. **Fotografía o render de los productos reales** del inventario.
3. **Número de WhatsApp, teléfono y horarios definitivos** para eliminar los placeholders.
4. **Decisión sobre el 3D**: cuántos productos lo llevan y con qué presupuesto de peso.

---

# Registro de ejecución (V0 – V3)

Fecha: 2026-10-22. Verificado con `npm run build` (compila, TypeScript limpio) y con
inspección del HTML y el CSS servidos por el servidor de desarrollo.

## Archivos creados

| Archivo | Rol |
|---|---|
| `frontend/src/data/fallback-products.ts` | Datos de respaldo extraídos de `page.tsx` |
| `frontend/src/lib/contact.ts` | Fuente única de WhatsApp y teléfono, sin valores por defecto |
| `frontend/src/components/ui/pixel-label.tsx` | Etiqueta arcade (`lime` / `violet` / `outline`) |
| `frontend/src/components/ui/button.tsx` | Botón (`primary` / `secondary` / `ghost`) + `buttonStyles()` |
| `frontend/src/components/ui/surface.tsx` | Panel geométrico con borde obligatorio |
| `frontend/src/components/ui/field.tsx` | `TextField` y `SelectField` con `appearance-none` |
| `frontend/src/components/trust-band.tsx` | Banda de confianza extraída del hero |
| `frontend/src/app/dev-ui/page.tsx` | Banco de pruebas de primitivas, 404 en producción |

## Archivos modificados

`layout.tsx` (fuentes), `globals.css` (tokens), `page.tsx` (composición), `hero.tsx`,
`navbar.tsx`, `product-card.tsx` y `footer.tsx` (contacto y anclas),
`product-catalog.tsx` (ancla `#colecciones`), `.env.example`, `frontend/.env.local`.

## Decisiones tomadas durante la ejecución

1. **Logo: pendiente explícito.** El navbar y el hero usan el lockup tipográfico `VP®` en
   Oxanium 700 como placeholder. Cada uno lleva un comentario que lo marca como pendiente.
   Sustituir por el SVG definitivo cuando exista.
2. **La banda de confianza se creó en V3, no en una fase posterior.** El plan sacaba las
   "value props" del hero sin reubicarlas todavía, lo que habría eliminado las señales de
   confianza de la página durante varias fases. Se creó `trust-band.tsx` con las primitivas
   nuevas para no perder contenido.
3. **Destinos de la navegación.** `TIENDA · COLECCIONES · NOSOTROS` apuntan a anclas de la
   página actual (`#catalogo`, `#colecciones`, `#nosotros`) porque las rutas reales no
   existen todavía (§5.6). Se añadió `id="colecciones"` al filtro de categorías y
   `id="nosotros"` a la columna de marca del footer. Se convierten en rutas en V8.
4. **`--color-muted` es `#9a9a9a`**, no el `#8a8a8a` del borrador: da **7.1:1** sobre el
   fondo (AAA) y sirve como borde por defecto de `Surface`.
5. **Foco global.** En lugar de repetir `focus:ring` por componente, hay una sola regla
   `:focus-visible` en `globals.css` con contorno lima de 2px y offset de 2px.
6. **`NEXT_PUBLIC_STORE_PHONE`** es una variable nueva. Sin ella, el footer omite la fila
   de llamadas en lugar de mostrar un número inventado.

## Verificado

- `npm run build`: compila, TypeScript sin errores, 5 rutas generadas.
- HTML servido: se cargan `oxanium` y `press_start_2p`; **cero referencias a Geist**.
- CSS servido: los tokens se emiten en `:root` y Tailwind genera `bg-action`,
  `text-action-ink`, `border-accent`, `border-muted`, `bg-surface`, `rounded-vp`,
  `text-muted` y `ease-vp`. La clase `.vp-label` está presente.
- `/dev-ui` responde 200 en desarrollo y se prerenderiza como 404 en el build de producción.

## No verificado

- **Revisión visual a 375 / 768 / 1440 px y recorrido con `Tab`**: no fue posible tomar
  capturas (la extensión de Chrome no estaba conectada). La verificación se hizo sobre el
  HTML y el CSS servidos, no sobre el render. **Queda pendiente la revisión visual.**

## Estado visual de la página tras V3

La página queda deliberadamente **mixta**, tal como anticipaba el plan: navbar, hero y banda
de confianza ya están en identidad VP, mientras que catálogo, tarjeta de producto, FAQ,
footer y modal +18 **siguen con las clases `zinc-*` / `emerald-*` del lienzo**. Se migran en
V4–V7. Las utilidades por defecto de Tailwind siguen disponibles, así que nada se rompe
mientras conviven.

## Pendientes abiertos

| # | Pendiente | Bloqueado por |
|---|---|---|
| 1 | **Logo VP en SVG** + favicon e icon set | Archivos de marca |
| 2 | Fotografía real y renders 3D de producto | Assets del negocio |
| 3 | Imagen de OpenGraph propia (hoy sigue apuntando a Unsplash) | Diseño del lockup |
| 4 | Set de iconografía definitivo (Lucide sigue en uso de forma provisional) | Decisión de diseño |
| 5 | Teléfono, WhatsApp y horarios reales | Confirmación del negocio |
| 6 | Revisión visual en los tres breakpoints | Extensión de Chrome |
| 7 | Rutas `/tienda`, `/coleccion/[categoria]`, `/nosotros` | Fase V8 |
| 8 | Error de lint preexistente: `set-state-in-effect` en `age-verification-modal.tsx` | Es lógica conservada (§9.1); requiere decisión aparte |

> Esta tabla es el estado **al cerrar V3**. El estado actual, con lo que se resolvió y lo
> que apareció después, está al final de este documento.

---

# Registro de ejecución (V4 – V7)

Fecha: 2026-10-26. Verificado con `npm run build` (compila, TypeScript limpio), `eslint` y
lectura del CSS compilado. **Sin revisión visual**: ver "No verificado".

Estas cuatro fases no se planificaron por escrito antes de ejecutarlas. El orden lo pidió el
usuario: primero la tarjeta y el catálogo, después el modal +18 por ser la primera pantalla
que ve cualquier visitante, y al final footer y FAQ.

## Archivos creados

| Archivo | Rol |
|---|---|
| `frontend/src/components/ui/card-field.tsx` | Campo de tarjetas reactivas: mide el contenedor y publica las variables que usan `.vp-card` y el brillo que sigue al puntero |

## Archivos modificados

`globals.css` (bloque `.vp-field`/`.vp-card` y token `--container-vp`), `product-card.tsx`,
`product-catalog.tsx`, `age-verification-modal.tsx`, `faq.tsx`, `footer.tsx`,
`trust-band.tsx`, `hero.tsx`, `navbar.tsx`.

## V4 — Tarjeta de producto y efecto de tarjeta

Traducción al sistema VP de un efecto de referencia que el usuario aportó: tarjetas que
pintan una misma imagen de fondo continua, brillo que sigue al cursor y atenuado del
entorno al hacer hover.

- **El anclaje del campo es el contenedor, no el viewport.** El efecto original usa
  `background-attachment: fixed`. Aquí no sirve por tres razones acumuladas: `.vp-glitch`
  aplica un `filter` a toda la página y un filtro rasteriza su subárbol, de modo que dentro
  de él un fondo anclado al viewport deja de estarlo; iOS Safari ignora `fixed` y Android lo
  degrada; y N fondos fijos se repintan en cada frame de scroll. El coste de anclar al
  contenedor es una medición por cambio de tamaño.
- **El atenuado del entorno no toca el texto.** El original baja la opacidad de la capa de
  fondo. Bajar la opacidad de la tarjeta completa llevaría `--color-muted` a 2.9:1 y
  rompería AA, así que el atenuado recae solo en el campo de las tarjetas no apuntadas.
- **El seguimiento del puntero está tras `(hover: hover) and (pointer: fine) and
  (prefers-reduced-motion: no-preference)`.** En táctil el `:hover` se queda pegado tras el
  toque; con movimiento reducido no se monta el listener y el brillo queda centrado.
  `:focus-within` espeja siempre el estado de hover para el teclado.
- **El CTA de la tarjeta es `secondary`, no `primary`.** La regla §11 es un CTA primario por
  vista y el hero ya lo gasta. Nueve rellenos lima anularían el lima como señal de acción y
  competirían con el brillo lima del hover. **Es la decisión más discutible de la fase**: si
  se prefiere el botón de compra en lima, hay que bajar el del hero a secundario.
- El nombre del producto **no** cambia de color al hover: la tarjeta no es un enlace todavía
  (`/producto/[slug]` es V8) y encenderlo prometería un destino inexistente. La imagen
  pierde el `scale` (§8.1); esa función la hace ahora `.vp-card`.
- La ficha técnica pasa de pills a una línea de especificaciones con separador lima: dos
  bordes de 2px alrededor de fragmentos de tres caracteres no se sostienen.

## V5 — Catálogo y filtros

- Encabezado con etiqueta pixel `[ CATALOGO ]`, título en la escala de sección y contador
  con el número en lima. Búsqueda y desplegables pasan a `TextField` y `SelectField`.
- **El filtro de categorías no reutiliza `ui/button.tsx`.** Un conmutador no es un botón de
  acción: su estado activo es relleno lima permanente, reservado en `Button` a `primary` y a
  un solo uso por vista. Lleva constantes propias (`CHIP_BASE` / `CHIP_ACTIVE` / `CHIP_IDLE`).
- **Se eliminó el scroll horizontal de categorías.** Llevaba `scrollbar-none`, que no es una
  utilidad de Tailwind y por tanto no hacía nada, y el desplazamiento lateral escondía las
  últimas tres categorías sin ninguna señal. Ahora envuelve con `flex-wrap`.
- Estado vacío con voz VP (`[ 0 RESULTADOS ]`, "Nada en esta frecuencia") en lugar de la
  caja de borde discontinuo con icono (§8.4).

## V6 — FAQ y footer

- **El panel del acordeón ya no se desmonta al cerrar** (§9.3): antes desaparecía del DOM,
  así que no se podía animar ni encontrar con Ctrl+F. Colapsa con
  `grid-template-rows: 0fr → 1fr`, la única forma de animar hasta altura automática sin
  medir con JS. Donde el motor no interpola `fr` (Safari < 17.4) abre y cierra de golpe.
- **Marcado del acordeón: patrón de ARIA APG, no `<dl>`.** Cada pregunta es un `<h3>` que
  envuelve el botón y cada respuesta una `region` con `aria-controls` / `aria-labelledby`.
  Se eligió sobre el `<dl>` que sugería el inventario porque los lectores de pantalla lo
  anuncian de forma más consistente y mete las preguntas en el índice de encabezados.
- **La FAQ pasa a composición asimétrica** (`0.8fr / 1.2fr`) en vez de ensanchar su
  `max-w-4xl` centrado, que quedaba descolgado del resto: llena el ancho sin alargar la
  línea de lectura, que era la razón legítima de aquel límite.
- **La advertencia legal del footer conserva su texto palabra por palabra** (§9.4) y cambia
  de envase: borde violeta de 2px con etiqueta `[ +18 ]`, el mismo marcador que la puerta de
  edad. **Su texto sube de 12px a 16px**: era el único sitio donde el tamaño tenía
  consecuencias legales y no solo estéticas.
- El bloque de marca del footer pasa a usar `logo-detalle.png`, el archivo que ya cargaba el
  navbar, en lugar del icono `Flame` en caja con gradiente. Con eso §4.1 queda resuelto en
  navbar y footer sin esperar al SVG.

## V7 — Modal +18

- **Fondo opaco** en lugar de `bg-black/90 backdrop-blur-md`: el sistema no usa la
  transparencia como jerarquía ni el desenfoque de fondo (§2.7, §3.5), y esto no es un modal
  sobre contenido sino una puerta — mostrar el catálogo difuminado por detrás es justo lo
  que un control de edad no debe hacer.
- Panel con borde blanco de 2px y desplazamiento duro violeta de 8px. **No** usa la prop
  `offset` de `Surface` porque su sombra es negra y el fondo también: sería invisible.
- Fuera los cuatro iconos (`ShieldAlert`, `CheckCircle`, `Ban`, `AlertTriangle`) y sus
  círculos translúcidos (§4.6). Los sustituyen `[ +18 ]` y `[ DENEGADO ]`.
- **Excepción documentada a la regla global de foco**: el botón de confirmación lleva un
  `:focus` explícito además del `:focus-visible` global, porque el diálogo mueve el foco ahí
  por programa al abrirse y Chrome no considera "visible" un foco programático sobre un
  botón sin interacción de teclado previa. Sin esa excepción, quien llegue con teclado y
  pulse Enter no vería dónde está el foco.
- Composición alineada a la izquierda en vez de centrada. Es un cambio de criterio, no una
  corrección: la puerta centrada lee institucional y neutra; alineada a la izquierda con la
  etiqueta pixel arriba lee como VP.
- Se cambiaron los dos `catch (_e)` por `catch` sin binding (mismo comportamiento, sin
  variable sin usar): **el lint baja de 4 problemas a 2**.

## Cambio transversal: ancho del armazón de página

A petición del usuario, que veía los márgenes de escritorio demasiado anchos. `max-w-7xl`
(1280px) se sustituye por el token `--container-vp` (96rem = 1536px), que genera `max-w-vp`,
más un escalón de gutter `xl:px-10`. Lo consumen las siete secciones de página.

| Ancho de pantalla | Margen antes | Margen ahora |
|---|---|---|
| 1920 | 344px | 232px |
| 1600 | 184px | 72px |
| 1440 | 104px | 40px |
| 1280 | 24px | 40px |
| < 1280 | 24px | 24px |

Entre 1280 y ~1310px de ancho el margen **sube** 16px: ahí el contenedor ya llenaba el
viewport y lo único que queda es el gutter. Es el precio de que el texto no toque el borde a
1366px. Para seguir ajustando, el único valor a tocar es `--container-vp`.

## Verificado

- `npm run build`: compila, TypeScript sin errores, 5 rutas generadas.
- `eslint`: **2 problemas, los dos preexistentes** (el `set-state-in-effect` del modal, que
  es lógica conservada, y un `_e` sin usar en `page.tsx`). Antes de estas fases eran 4.
- **Cero clases fuera de sistema** en los diez componentes y en `page.tsx` / `layout.tsx`:
  ni `zinc-*`, ni `emerald-*`, ni `amber-*`, ni `red-*`, ni `rounded-xl|2xl|lg|md|full`, ni
  `backdrop-blur`, ni sombras difusas, ni `font-black` / `font-extrabold` / `font-medium`,
  ni `hover:scale-*`.
- CSS compilado: se emiten `--container-vp: 96rem`, `.max-w-vp`, las reglas `.vp-card` /
  `.vp-field` completas (incluidos `:has()`, `color-mix()` y las variables del campo) y las
  tres utilidades del acordeón (`grid-rows-[0fr]`, `grid-rows-[1fr]`,
  `transition-[grid-template-rows]`). Esto último se comprobó expresamente porque un
  acordeón sin `grid-template-rows` se queda abierto para siempre.
- Lucide baja de los 22 iconos del inventario (§4.5) a **6, todos funcionales**: `Search`,
  `ChevronDown`, `Menu`, `X`, `ShoppingBag`, `MessageCircle`. Footer y modal +18 ya no
  importan ninguno.

## No verificado

- **Revisión visual en los tres breakpoints y recorrido con `Tab`.** Sigue sin ser posible:
  la extensión de Chrome no está conectada. Es el mismo pendiente que quedó abierto en V3,
  y ahora acumula cuatro fases sin mirar. En concreto no se ha visto renderizado: la
  alineación del campo compartido entre celdas del grid, el colapso del acordeón en
  movimiento, el modal +18 completo, y cómo cae el footer a 375px.

## Pendientes abiertos (estado actual)

| # | Pendiente | Bloqueado por |
|---|---|---|
| 1 | **Revisión visual** a 375 / 768 / 1440 px y recorrido con `Tab`, ahora también de la consola `/admin` (A5.1: alertas, filas de stock, formulario de movimiento y kardex) | Extensión de Chrome |
| 2 | ~~`logo-detalle.png` pesa **355 KB**~~ | ✅ **Resuelto** (2026-10-26): `logo-detalle.svg`, 3,2 KB |
| 3 | Fotografía real y renders 3D de producto | Assets del negocio |
| 4 | ~~Imagen de OpenGraph propia~~ | ✅ **Resuelto** (2026-10-26): `app/opengraph-image.png`, compuesta con el logo vectorial |
| 5 | Set de iconografía definitivo (§4.5): quedan 6 iconos de Lucide, todos funcionales | Decisión de diseño |
| 6 | Escala de espaciado en tokens (§3.7): los `py-16`, `p-5`, `gap-6` siguen siendo ad-hoc | Decisión de diseño |
| 7 | Teléfono, WhatsApp y horarios reales | Confirmación del negocio |
| 8 | Rutas `/producto/[slug]`, `/coleccion/[categoria]`, `/nosotros` | Fase V8 |
| 9 | ~~Error de lint `set-state-in-effect`~~ | ✅ **Resuelto** (2026-10-26): `useSyncExternalStore`; ESLint queda en 0 problemas |

**Resuelto desde V3**: el logo (#1 de la tabla anterior). Navbar y footer consumen
`frontend/public/logo-detalle.svg`, así que el lockup tipográfico `VP®` solo queda como
placeholder en el hero. El `favicon.ico` del directorio `app/` ya no es el del template
(3,7 KB frente a los ~26 KB del archivo por defecto de `create-next-app`), pero no se ha
verificado que sea el icono VP definitivo ni existe aún el icon set completo
(`apple-icon`, versión maskable) que pedía §4.3. ~~**Ese icon set ya no está bloqueado**~~
→ ✅ **Resuelto** (2026-10-26), ver el registro del icon set más abajo.

---

# Registro de ejecución — pendientes #2, #4 y #9 (2026-10-26)

Tres pendientes de la tabla anterior que no dependían de la revisión visual.

## #2 — El logo pasa a vectorial

`assets/logo/` ya contenía cinco SVG de marca, pero cuatro pesan ~845 KB porque
Inkscape conservó dentro una **capa de calco oculta** (`display:none`) con el PNG
original en base64: el trazado vectorial real ocupa 3 KB de esos archivos.

De `logodetalleblanco.svg` se obtuvo `frontend/public/logo-detalle.svg`
(**847.963 → 3.238 bytes**) quitando esa capa, los restos del editor
(`sodipodi:namedview`, atributos `inkscape:*`) y las dimensiones en milímetros,
para que escale solo por `viewBox`.

Dos correcciones sobre el asset, ambas verificadas contra el PNG aprobado:

- **La estrella venía a `fill-opacity:0.501961`**, resto de cuando se calcó sobre
  la referencia. En el PNG es lima pleno; se normalizó a opaca.
- **El asset traía dos limas fuera de la paleta**, `#ccff00` en los destellos y
  `#aad400` en la estrella. Los dos pasan a `#d7ff00`, que es `--color-vp-lime`
  (§2). Si el doble tono fuese deliberado, esto es lo que habría que revertir.

El `viewBox` del vector (2,008:1) es más ajustado que el recorte del PNG
(2,435:1), que traía aire a los lados. Con `h-10 w-auto` el monograma se ve del
mismo tamaño; solo desaparece ese margen vacío. `width`/`height` en navbar y
footer pasan a `1860 × 926`, la proporción exacta del `viewBox`.

`frontend/public/logo-detalle.png` se elimina: el SVG lo sustituye en los dos
únicos sitios que lo cargaban.

## #4 — Imagen de OpenGraph propia

`frontend/src/app/opengraph-image.png` (1200 × 630, 30 KB) se compuso a partir
del mismo vector: fondo `--color-vp-black`, marco blanco de 4 px, el logo
centrado y una franja lima inferior. Sin texto a propósito: la tipografía del
lockup sigue sin decidirse (#5 y §4.3), y una tarjeta con Oxanium a medias sería
peor que una sin texto. Se rasterizó a 4x y se redujo, para que el vector no
quede dentado.

Va por **convención de archivo**, no por `metadata`: Next emite `og:image`, su
tamaño, su tipo, el `og:image:alt` que toma de `opengraph-image.alt.txt` y
además `twitter:image` con su propio alt. Por eso `layout.tsx` ya no declara
`images` ni en `openGraph` ni en `twitter`.

En el mismo paso se añadió **`metadataBase`**, que faltaba: sin él Next resuelve
las URL de OpenGraph contra `localhost` y ningún cliente de WhatsApp o de X
puede recuperar la imagen. Verificado en el HTML compilado:
`og:image` sale como `https://vapeupar.com/opengraph-image.png`.

Las fotos de producto siguen siendo de Unsplash (pendiente #3), así que
`images.unsplash.com` se queda en `remotePatterns` hasta A8.

## #9 — El modal +18 sin `set-state-in-effect`

El efecto de montaje que leía `localStorage` y llamaba a `setIsOpen` se
reemplaza por **`useSyncExternalStore`**, que es la forma de leer un sistema
externo sin encadenar un render de más.

**Lo que no cambia**: el TTL de 30 días, los atributos ARIA, el foco inicial en
el botón de confirmación, el bloqueo de scroll, la pantalla de rechazo y el
texto legal palabra por palabra.

**Lo que sí cambia, y a mejor**: el primer fotograma. Antes el componente
devolvía `null` hasta que corría el efecto, así que un visitante sin verificar
alcanzaba a ver el catálogo detrás. Ahora el servidor pinta la puerta cerrada
(`getServerSnapshot` devuelve `true`). El contrapeso es que un visitante ya
verificado ve la puerta un instante mientras hidrata, y que sin JavaScript la
puerta no se puede cerrar. En una puerta legal, ese es el lado correcto del
fallo.

El cierre tras confirmar lo lleva un estado local (`confirmedNow`), porque el
evento `storage` no se emite en la pestaña que escribe; a las demás pestañas sí
llega, y por eso el componente se suscribe.

## Verificado

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ Sin errores |
| `npx eslint` | ✅ **0 problemas** (antes 1 error y 1 aviso; el aviso era un `_e` sin usar en `page.tsx`, corregido con `catch {}` sin ligadura) |
| `npm run build:frontend` | ✅ Compila; `/opengraph-image.png` aparece como ruta estática |
| Metadatos en el HTML compilado | ✅ `og:image`, `og:image:alt`, `twitter:image` y `twitter:image:alt` absolutos contra `https://vapeupar.com`; ninguna URL de Unsplash en las etiquetas OG |
| Render del SVG limpio frente al PNG aprobado | ✅ Mismo trazo, estrella y franjas |

## No verificado

Lo mismo que seguía abierto: **nada de esto se ha visto renderizado en un
navegador** (pendiente #1). En concreto, del trabajo de hoy falta mirar el logo
vectorial a 375 / 768 / 1440 px en navbar y footer, y el primer fotograma del
modal +18 con y sin verificación previa.

---

# Registro de ejecución — icon set VP (2026-10-26)

§4.3 pedía «favicon + icon set VP (incluye `apple-icon` y versión maskable)».
Estaba anotado como bloqueado por el diseño del lockup; dejó de estarlo al
aparecer el vector limpio (pendiente #2).

## De qué vector sale

No del mismo que el logo del navbar. `logosimpleblanco.svg` y
`logodetalleblanco.svg` dibujan el monograma **en contorno**, y un contorno de
trazo fino desaparece por debajo de los 32 px. `logomini.svg` (el único de los
cinco que ya venía sin capa de calco, 3 KB) tiene la letra **maciza** en tres
trazos negros: eso es lo que sobrevive a 16 px.

## La teja

**Lima `--color-vp-lime` con el monograma en `--color-vp-black`**, y no al revés.
El negro de marca sobre la barra de pestañas de un navegador en tema oscuro es
casi invisible; el lima resalta en claro y en oscuro, y es el color de acción del
sistema. El monograma ocupa el 86 % del ancho de la teja.

| Archivo | Tamaño | Nota |
|---|---|---|
| `app/icon.svg` | vectorial, 1,3 KB | Lo que usan los navegadores modernos |
| `app/favicon.ico` | 1,8 KB | 16, 32 y 48 px, con carga útil PNG |
| `app/apple-icon.png` | 180 px, 2,6 KB | Opaco y con más aire: iOS redondea las esquinas |
| `public/icon-192.png` · `public/icon-512.png` | 3,2 y 9,9 KB | `purpose: "any"` del manifiesto |
| `public/icon-maskable-512.png` | 8,1 KB | `purpose: "maskable"` |
| `app/manifest.ts` | — | Existe sobre todo para poder declarar el maskable |

## Dos ajustes ópticos

- **A 16 px el monograma se empastaba**: la ranura interior de la P y el corte
  diagonal caen por debajo del píxel. Ese tamaño, y solo ese, se genera con el
  94 % de caja en lugar del 86 %. A 32 y 48 px se distinguen V y P sin ayuda.
- **El maskable va al 66 % del ancho** (340 px de 512). Android recorta a la
  forma del lanzador y solo garantiza el 80 % central: con una caja de 1,75:1, el
  ancho máximo que cabe en ese círculo es 355 px.

Todo se rasteriza a 4x y se reduce, para que las diagonales no queden dentadas.

## Verificado

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` y `npx eslint` | ✅ Sin errores ni avisos |
| `npm run build:frontend` | ✅ `/icon.svg`, `/apple-icon.png` y `/manifest.webmanifest` salen como rutas estáticas |
| Etiquetas en el HTML compilado | ✅ `rel="icon"` (ico y svg), `rel="apple-touch-icon"` 180x180 y `rel="manifest"` |
| `manifest.webmanifest` servido | ✅ Los tres iconos con su `purpose`; colores de marca en `background_color` y `theme_color` |
| Lectura del propio `.ico` | ✅ Las tres entradas (16, 32, 48) se extraen y se ven; a 16 px, legible tras el ajuste |
| Recorte circular simulado sobre el maskable | ✅ El monograma queda dentro con margen |

## No verificado

- **Ningún icono se ha visto en un navegador, una pestaña real o una pantalla de
  inicio** (pendiente #1). Las comprobaciones son sobre los archivos generados.
- Queda fuera, y sigue siendo decisión de diseño, el set de **iconografía de
  interfaz** (§4.5, pendiente #5): son los 6 iconos de Lucide que quedan dentro
  de los componentes, un asunto distinto del icono de la aplicación.
