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

Fases posteriores (fuera del alcance de este plan): V4 tarjeta de producto y grid, V5 catálogo y filtros, V6 FAQ + footer, V7 modal +18, V8 rutas nuevas y 3D.

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
