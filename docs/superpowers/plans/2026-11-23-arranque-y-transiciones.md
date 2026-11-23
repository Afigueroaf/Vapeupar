# Pantalla de arranque y transiciones — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla de arranque con el logo VU dibujándose en cada carga de la web pública, sin el glitch de entrada ni el parpadeo de la puerta +18, y fundido suave entre páginas.

**Architecture:** La línea de tiempo del arranque es lógica pura en `src/lib/boot-timeline.ts` (probada con vitest); `BootScreen` es un componente cliente montado en el layout raíz que se pinta desde el servidor, anima con un solo rAF y se desmonta. Las transiciones usan `<ViewTransition>` de React 19.3 con `experimental.viewTransition` de Next 16, solo sobre el `<main>` de las páginas públicas.

**Tech Stack:** Next 16.4.6, React 19.3.1, TypeScript, Tailwind v4, Lenis, vitest (entorno `node`, sin jsdom).

**Spec:** `docs/superpowers/specs/2026-11-23-arranque-y-transiciones-design.md`

## Global Constraints

- Línea de tiempo del arranque (ms): dibujo 2200 por contorno, escalonado 0–400, todo dibujado a 2600; fundido contornos→relleno 2700–3300; sostén 3300–3500; desvanecido de la pantalla 3500–4000. Total 4000.
- Curva: `ease(v) = 0.5 - 0.5 * Math.cos(Math.PI * clamp(v, 0, 1))`.
- Fondo `var(--color-vp-black)` (#080808) constante; trazo y relleno `#f5f5f5` (`--color-vp-white`); trazo con `stroke-linecap/linejoin: round`.
- Movimiento reducido: logo relleno estático 600 ms + desvanecido 400 ms.
- Nada en `/admin` (mismo criterio que `SmoothScroll`: `usePathname().startsWith("/admin")`).
- Puerta +18: clave `vapeupar_age_verified_at`, TTL 30 días, textos y atributos ARIA intactos.
- Sin dependencias nuevas. `npm install` solo desde la raíz del monorepo.
- Comentarios y textos en español, siguiendo el estilo del proyecto.

## Review Focus

1. Visitante NO verificado: al irse el arranque debe quedar la puerta +18 visible, con el scroll aún bloqueado (dos bloqueos de scroll solapados no deben liberarse el uno al otro) → prueba en Task 2.
2. Pestaña oculta durante el arranque: al volver el arranque no debe saltar al final de golpe ni quedarse colgado; se pausa y reanuda sin acumular el tiempo oculto → `elapsed` activo en Task 3.
3. Navegación cliente tras el arranque (portada → ficha): ni vuelve a salir el arranque ni parpadea la puerta → verificación manual en Task 3.
4. Ancho de teléfono (360 px) y horizontal bajo: el logo completo cabe sin recortes ni scroll horizontal → verificación manual en Task 3.
5. Navegador sin View Transitions (Firefox antiguo): navegación instantánea sin errores → verificación manual en Task 4.

---

### Task 1: Línea de tiempo y trazados del logo

**Files:**
- Create: `frontend/src/lib/boot-timeline.ts`
- Create: `frontend/src/lib/boot-timeline.test.ts`
- Create: `frontend/src/components/boot/logo-paths.ts`

**Interfaces:**
- Produces:
  - `ease(v: number): number`
  - `BOOT_TOTAL_MS = 4000`, `BOOT_REDUCED_TOTAL_MS = 1000`
  - `drawDelay(index: number, count: number): number` — reparte 0..400 ms linealmente (`count === 1` → 0).
  - `bootFrame(elapsed: number, count: number): { draw: number[]; fill: number; screen: number; done: boolean }` — `draw[i]` progreso 0..1 ya con `ease` del contorno i; `fill` opacidad del relleno (la de contornos es `1 - fill`); `screen` opacidad de toda la pantalla; `done` cuando `elapsed >= 4000`.
  - `reducedFrame(elapsed: number): { screen: number; done: boolean }` — `screen` 1 hasta 600, `ease` descendente 600–1000.
  - `LOGO_VIEWBOX: string`, `LOGO_PATHS: readonly string[]` — cada subtrazado del logo como trazado ABSOLUTO independiente.

- [ ] **Step 1: Pruebas que fallan** en `boot-timeline.test.ts`:
  - `ease(0) === 0`, `ease(1) === 1`, `ease(0.5) ≈ 0.5`, `ease(-1) === 0`, `ease(2) === 1`.
  - `drawDelay(0, 5) === 0`, `drawDelay(4, 5) === 400`, `drawDelay(0, 1) === 0`.
  - `bootFrame(0, 5)`: todos `draw` 0, `fill` 0, `screen` 1, `done` false.
  - `bootFrame(2600, 5).draw` todos `=== 1`; `bootFrame(2600, 5).fill === 0`.
  - `bootFrame(3000, 5).fill ≈ 0.5`; `bootFrame(3300, 5).fill === 1`.
  - `bootFrame(3400, 5).screen === 1`; `bootFrame(3750, 5).screen ≈ 0.5`; `bootFrame(4000, 5)` → `screen 0`, `done true`.
  - `reducedFrame(300).screen === 1`; `reducedFrame(800).screen ≈ 0.5`; `reducedFrame(1000).done === true`.
  - `LOGO_PATHS.length > 6` y todos empiezan por `"M"`.

- [ ] **Step 2:** `npm test -w frontend -- boot-timeline` → FALLA (módulo inexistente).

- [ ] **Step 3: Implementar `boot-timeline.ts`** con los valores de Global Constraints.

- [ ] **Step 4: Generar `logo-paths.ts`.** Los 6 `<path>` de la capa `layer2` de `assets/logo/logovupar_w.svg` (idénticos a `frontend/public/logo-completo-blanco.svg`; la `<image>` PNG oculta se descarta). El primero es un trazado compuesto con muchos subtrazados en comandos relativos: con un script de un solo uso en el scratchpad (no se commitea), convertir a absolutos, aplicar el `translate(-2.9104168,-183.61929)` del grupo y partir en un subtrazado por cada `m/M`. `LOGO_VIEWBOX = "0 0 282.15747 54.979042"`. Redondear a 3 decimales. Comentario de cabecera: de dónde salen y cómo se regeneran.

- [ ] **Step 5:** `npm test -w frontend` → PASA todo.

- [ ] **Step 6: Commit** `feat(arranque): línea de tiempo y trazados del logo para la pantalla de arranque`

### Task 2: Bloqueo de scroll compartido

**Files:**
- Modify: `frontend/src/lib/use-scroll-lock.ts`
- Modify: `frontend/src/components/age-verification-modal.tsx` (bloque del efecto de bloqueo, ~líneas 70–120)
- Create: `frontend/src/lib/use-scroll-lock.test.ts`

**Interfaces:**
- Produces: `lockScroll(): () => void` (exportada, pura de React; devuelve la función de liberación, idempotente) y `useScrollLock(active: boolean)` que la usa.

Hoy la puerta y el carrito copian cada uno el bloqueo y guardan los estilos "previos": si el arranque bloquea y la puerta bloquea encima, el primero en liberar devuelve el `body` a su estado original y deja la puerta sin bloqueo. Se pasa a un contador de módulo: el primer bloqueo guarda estilos y `scrollY`, el último los restaura.

- [ ] **Step 1: Pruebas que fallan** con `vi.stubGlobal` de `window` (`scrollY`, `scrollTo` espía) y `document.body.style` como objeto plano:
  - `lockScroll()` pone `position: "fixed"`, `overflow: "hidden"`, `top: "-120px"` con `scrollY = 120`.
  - dos bloqueos, se libera el primero → `position` sigue `"fixed"`; se libera el segundo → estilos originales y `scrollTo(0, 120)` llamado una vez.
  - llamar dos veces a la misma liberación no descuenta dos veces.
- [ ] **Step 2:** `npm test -w frontend -- use-scroll-lock` → FALLA.
- [ ] **Step 3:** Implementar `lockScroll` y reescribir `useScrollLock` sobre ella. Sustituir el bloqueo copiado de `age-verification-modal.tsx` por `useScrollLock(needsVerification)` (mismo comportamiento; conservar el comentario de iOS en `use-scroll-lock.ts`).
- [ ] **Step 4:** `npm test -w frontend` → PASA.
- [ ] **Step 5: Commit** `refactor(scroll): bloqueo de scroll con contador para que dos capas no se liberen entre sí`

### Task 3: Pantalla de arranque, sin glitch de entrada

**Files:**
- Create: `frontend/src/components/boot/boot-screen.tsx`
- Modify: `frontend/src/app/layout.tsx` (montar `<BootScreen />` primero en `<body>`)
- Modify: `frontend/src/components/page-glitch.tsx` (quitar `INTRO_DECAY_MS` y sus ramas en `tick`, `idle` y `resume`; la primera ráfaga se programa con `now + nextBurstDelay()`)
- Modify: `frontend/src/app/globals.css` (estilos `.vp-boot` si no caben en clases Tailwind)

**Interfaces:**
- Consumes: `bootFrame`, `reducedFrame`, `drawDelay`, `BOOT_TOTAL_MS` (Task 1); `LOGO_PATHS`, `LOGO_VIEWBOX` (Task 1); `lockScroll` (Task 2).
- Produces: `export function BootScreen(): JSX.Element | null`.

Comportamiento:
- Devuelve `null` en `/admin`. En el resto lo pinta el servidor: `div` fijo `inset-0`, `z-[60]` (por encima de la puerta, `z-50`), fondo `bg-background`, `role="status"`, `aria-label="Cargando Vapeupar"`, `aria-live="polite"`. Sin texto visible.
- SVG centrado, ancho `clamp(260px, 58vw, 620px)` con tope `84vw` (≤500 px: `84vw`), alto intrínseco. Dos grupos: contornos (`fill="none"`, `stroke="#f5f5f5"`, `stroke-width` ~0.6 unidades, `vector-effect` no) y relleno (`fill="#f5f5f5"`, opacidad inicial 0). Antes de la hidratación los contornos se pintan ocultos (`stroke-dasharray` grande vía CSS) para no ver el logo completo un instante.
- Al montar: `lockScroll()`; mide `getTotalLength()` de cada contorno y fija `stroke-dasharray`; un solo rAF con reloj de tiempo ACTIVO (pausa en `visibilitychange` oculto, reanuda sin sumar el hueco); cada fotograma escribe `stroke-dashoffset = len * (1 - draw[i])`, opacidades de grupos y de la pantalla directamente en el DOM (sin `setState` por fotograma). Con `done` → libera el bloqueo y `setState` para desmontar.
- `matchMedia("(prefers-reduced-motion: reduce)")`: relleno visible desde el principio y `reducedFrame`.
- `<noscript><style>{".vp-boot{display:none}"}</style></noscript>` dentro del componente.
- Limpieza al desmontar: cancelar rAF, quitar listeners, liberar bloqueo.

- [ ] **Step 1:** Implementar `boot-screen.tsx`, montarlo en `layout.tsx` y quitar la entrada de `page-glitch.tsx`.
- [ ] **Step 2:** `npm run lint -w frontend` y `npx tsc --noEmit -p frontend` → sin errores.
- [ ] **Step 3: Verificar en el navegador** (`npm run dev` desde la raíz, skill `run`/Chrome):
  - recarga en `/`: dibujo escalonado → todos los contornos terminan antes del relleno → relleno → desvanecido a los ~4 s; sin glitch de entrada.
  - con verificación +18 guardada: la puerta no aparece en ningún fotograma. Borrando `vapeupar_age_verified_at`: al irse el arranque queda la puerta y el scroll sigue bloqueado; al confirmar, el scroll vuelve.
  - recarga en `/producto/<slug>`: también sale el arranque. En `/admin`: no sale.
  - navegación cliente portada → ficha: no vuelve a salir el arranque.
  - 360×740 y 740×360: logo completo, sin scroll horizontal.
  - movimiento reducido emulado: logo relleno quieto y fundido en ~1 s.
  - ocultar la pestaña a mitad de dibujo y volver: continúa desde donde iba.
- [ ] **Step 4: Commit** `feat(arranque): pantalla de arranque con el logo VU y fuera el glitch de entrada`

### Task 4: Fundido suave entre páginas

**Files:**
- Modify: `frontend/next.config.ts` (`experimental: { viewTransition: true }` con comentario)
- Modify: `frontend/src/components/public-shell.tsx` (envolver el contenido de `<main>`)
- Modify: `frontend/src/app/page.tsx:84-184` (envolver el contenido de `<main>`)
- Modify: `frontend/src/app/globals.css` (bloque `TRANSICIONES DE PÁGINA`)

**Interfaces:**
- Consumes: nada de tareas anteriores.

- [ ] **Step 1:** `import { ViewTransition } from "react"` (si los tipos de `@types/react` no lo exportan aún, `unstable_ViewTransition`; comprobar en `node_modules/@types/react`). En ambos `<main>`: `<ViewTransition enter="vp-page-in" exit="vp-page-out" default="none">…</ViewTransition>`.
- [ ] **Step 2:** CSS: `::view-transition-old(root), ::view-transition-new(root) { animation: none; }` para que navbar, footer y fijos no se muevan; `::view-transition-old(.vp-page-out)` fundido a 0 + `translateY(-8px)` en 150 ms; `::view-transition-new(.vp-page-in)` desde 0 + `translateY(12px)` en 300 ms con 80 ms de retraso; curva `var(--ease-vp)`. Bajo `@media (prefers-reduced-motion: reduce)`: `animation: none` en los cuatro.
- [ ] **Step 3:** `npm run lint -w frontend`, `npx tsc --noEmit -p frontend`, `npm run build` desde la raíz → sin errores.
- [ ] **Step 4: Verificar en el navegador:** navbar → colección → ficha → portada: el contenido sale y entra con fundido, la barra no se mueve, el scroll empieza arriba y Lenis sigue funcionando; movimiento reducido: cambio instantáneo; la puerta +18 y el carrito siguen funcionando.
- [ ] **Step 5: Commit** `feat(navegación): fundido suave entre páginas con View Transitions`

### Task 5: Cierre

- [ ] **Step 1:** `npm test -w frontend` y `npm run build` desde la raíz → PASAN.
- [ ] **Step 2:** Reflejar en el roadmap con la skill `deathnote` (sincronizar).
- [ ] **Step 3: Commit** de spec, plan y deathnote: `docs: diseño y plan de arranque y transiciones`
