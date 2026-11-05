# Plan de optimización de rendimiento — sitio público

Fecha de la auditoría: 2026-11-04 · Rama: `skills/calidad-frontend-backend`

Objetivo: que la portada se recorra con fluidez (60 fps sostenidos en escritorio,
sin tirones visibles en un teléfono de gama media) sin perder la identidad visual.

La auditoría es estática (lectura del código y del build en `.next/`). La fase 0
existe para confirmar con mediciones lo que aquí se deduce, antes de tocar nada.

---

## 1. Resumen ejecutivo

La portada mantiene **varias fuentes de trabajo continuo apiladas sobre el mismo
área de pantalla**, y la más cara de todas es la que menos se ve:

| # | Punto crítico | Coste | Cuándo se nota |
|---|---------------|-------|----------------|
| 1 | Filtro SVG `url(#vp-rgb-glitch)` aplicado **de forma permanente** a casi todos los bloques, a cada tarjeta y a los dos lienzos WebGL | Muy alto | Siempre; los picos coinciden con la intro (2,8 s) y con cada *burst* (cada 5–9 s) |
| 2 | Dos contextos WebGL animando a la vez y superpuestos (nube de 55 000 puntos + prisma con `antialias: true`) | Alto | Mientras el hero o la banda están en pantalla |
| 3 | Tarjetas de producto con 3D + `blur(18px)` + `mix-blend-mode` + 5 `drop-shadow` + filtro SVG, todo dependiente de variables que cambian con el puntero | Alto | Al mover el ratón por el catálogo y al hacer scroll sobre él |
| 4 | Trabajo de CPU en el hilo principal durante la carga (muestreo de 55 000 puntos, siluetas por `getImageData`) | Medio | Primer segundo tras cargar: el scroll inicial no responde |
| 5 | Selectores `:has()` y variables `@property` heredables sobre el campo de tarjetas | Medio-bajo | Hover en el catálogo |

El bundle **no** es el problema principal: three.js (~730 kB sin comprimir) ya se
carga en diferido con `next/dynamic({ ssr: false })` y los assets públicos pesan
256 kB en total (el GLB, 184 kB).

---

## 2. Hallazgos en detalle

### 2.1 Filtro RGB de glitch — el punto más caro

Archivos: `components/page-glitch.tsx`, `app/globals.css` §GLITCH RGB DE PÁGINA.

- `html.glitch-ready .vp-glitch { filter: url(#vp-rgb-glitch) }` está activo **todo
  el tiempo**, no solo durante el *burst*. Lo llevan: navbar (sticky), hero, banda de
  confianza, cabecera/filtros/barra del catálogo, FAQ, footer, el contenedor del
  lienzo de la nube de puntos y **cada** `ProductCard` (`.vp-glitch-card`).
- Un filtro SVG de referencia (feOffset ×2 + feColorMatrix ×3 + feBlend ×2) obliga a
  rasterizar cada bloque en una superficie propia y a aplicar el grafo de filtro en
  cada repintado. En Safari y Firefox los filtros SVG sobre HTML se calculan en CPU.
- **El lienzo WebGL de la nube está dentro de un bloque filtrado** (`page.tsx`:
  `className="vp-glitch absolute inset-0"`) y el prisma vive dentro de la banda, que
  también lo está. Cada fotograma de WebGL invalida la superficie filtrada, así que
  el filtro se recalcula **60 veces por segundo** sobre un área de hasta dos
  pantallas, aunque `dx = 0` y el resultado visual sea idéntico al original.
- Durante la intro y los *bursts* el bucle de `PageGlitch` cambia el atributo `dx`
  de los `feOffset`. Cambiar un atributo de un filtro invalida **todos** los
  elementos que lo usan a la vez → repintado de toda la página visible en el mismo
  fotograma. Es el candidato número uno a explicar tirones periódicos.
- El bucle `requestAnimationFrame` de `PageGlitch` corre siempre (aunque sale pronto
  cuando `shift` no cambia): coste bajo, pero mantiene despierto el hilo principal.

### 2.2 Dos escenas WebGL simultáneas

Archivos: `components/vaporizer-point-cloud.tsx`, `vaporizer/canvas.tsx`,
`vaporizer/scene.tsx`, `vaporizer/scatter-field.ts`, `prism/scene.ts`,
`product-prism.tsx`.

- Nube de puntos: 55 000 partículas (×0,6 en táctil, suelo 3 000) + 1 400 ambientales,
  `AdditiveBlending` (sobredibujado alto), y **dos pasadas GPGPU por fotograma**
  (`modelField.update` y `ambientField.update`, *ping-pong* de texturas Float).
  El lienzo cubre hero + banda (casi dos pantallas en móvil) con un tope de
  2,6 M píxeles de dibujo.
- Prisma: `WebGLRenderer` propio con `antialias: true` y `powerPreference:
  "high-performance"`, bucle `rAF` continuo mientras es visible, *raycast*
  (`pickPanel`) en cada fotograma si el puntero está dentro.
- Las dos se solapan en la banda de confianza: dos lienzos transparentes
  compuestos uno encima del otro y, encima, el filtro SVG del punto 2.1.
- Lo bueno ya existente: las dos se pausan fuera de pantalla
  (`IntersectionObserver` + `visibilitychange`) y respetan `prefers-reduced-motion`.
- Falta: tope de FPS / degradación dinámica en equipos lentos, y
  `frameloop="demand"` cuando la escena está quieta (sin puntero y sin giro).

### 2.3 Tarjetas de producto

Archivos: `components/product-card.tsx`, `components/ui/card-field.tsx`,
`app/globals.css` (`.vp-card`, `.vp-holo`, `.vp-silhouette`, `.vp-plano-*`).

Cada tarjeta acumula: `transform-style: preserve-3d` + `rotateX/Y` con
`perspective()`, capa `.vp-holo` con `mix-blend-mode: screen` + `mask-image` +
`::before` con `filter: blur(18px)` sobre un degradado que depende de `--vp-rx/ry`,
la imagen con **cinco** `drop-shadow` encadenados (el último depende de `--vp-rx/ry`),
`box-shadow`/`text-shadow` calculados con las mismas variables y, encima de todo, el
filtro SVG de glitch.

- `--vp-rx/--vp-ry` se escriben en cada `pointermove` (agrupado en rAF, bien) y
  están registradas con `inherits: true`: todo el subárbol de la tarjeta recalcula
  estilo y el `blur`, los `drop-shadow` y el filtro SVG se repintan en cada
  movimiento del ratón.
- Con ~20 tarjetas en el DOM, cada una es una o varias capas de composición:
  memoria de GPU alta y scroll pesado en móvil.
- `.vp-field:has(.vp-card:hover) .vp-card:not(:hover)::before` obliga a reevaluar
  todo el campo en cada entrada/salida de hover.

### 2.4 Trabajo de arranque en el hilo principal

- `vaporizer/sampling.ts` + `geometry.ts`: muestreo de decenas de miles de puntos
  sobre la malla en JS, al montar, en el hilo principal.
- `prism/silhouette.ts`: por cada foto, `getImageData` + varias pasadas de
  dilatación/erosión píxel a píxel + trazado de contorno, también en el hilo
  principal y justo cuando el usuario empieza a hacer scroll.
- Ambos lienzos y three.js se piden en cuanto monta la portada, compitiendo con la
  hidratación.

### 2.5 Menores

- `TouchCursor`: solo corre con el gesto activo; `elementFromPoint` + eventos
  sintéticos por fotograma es aceptable. Sin acción.
- `trust-stage.tsx`: rAF acotado en el tiempo. Sin acción.
- Imágenes: `next/image` con `sizes` correctos y `lazy` salvo las primeras. Bien.
- Datos: `fetch` con `revalidate: 60` en servidor. Bien.

---

## 3. Plan por fases

Cada fase se mide antes y después con el mismo protocolo (fase 0). No se pasa a la
siguiente sin ver la mejora en números.

### Fase 0 — Línea base (½ día)

1. `npm run build && npm run start` (nunca medir sobre `next dev`).
2. Chrome DevTools → Performance, CPU ×4 de ralentización, en tres escenarios:
   carga + scroll hasta el footer; ratón sobre el catálogo 10 s; quieto en el hero
   20 s (para capturar un *burst*).
3. Anotar: FPS medio, fotogramas largos (>50 ms), tiempo de *Paint*/*Composite*,
   memoria de GPU (pestaña *Layers*) y nº de capas.
4. Lighthouse móvil: TBT, INP, LCP.
5. Repetir en un teléfono Android real vía `chrome://inspect`.

### Fase 1 — Glitch barato (impacto mayor, riesgo bajo) · 1 día

1. **Aplicar el filtro solo durante el *burst***: colgar `filter` de
   `html.glitch-active` en lugar de `glitch-ready`. El problema que documenta el
   comentario (un `url(#id)` inexistente oculta el elemento) se resuelve igual,
   porque `glitch-active` solo se pone cuando el SVG está montado.
2. **Sacar los lienzos WebGL del filtro**: quitar `vp-glitch` del contenedor de
   `VaporizerPointCloud` (la nube ya hace su propio glitch en el shader con
   `uGlitch`) y excluir el escenario del prisma de la franja filtrada de la banda
   (aplicar el filtro a las piezas de texto de la banda, no al bloque entero, o
   llevar el *tear* al shader del prisma como en la nube).
3. **Quitar el filtro de cada tarjeta** del catálogo (`vp-glitch-card`), o
   limitarlo a las tarjetas visibles con un `IntersectionObserver` que ponga la
   clase solo durante el *burst*.
4. Parar el bucle de `PageGlitch` entre *bursts*: un `setTimeout` hasta el siguiente
   *burst* y rAF solo mientras dura (420 ms) o en la intro.
5. Alternativa de más calidad para el futuro: sustituir el filtro SVG por dos
   pseudo-elementos/capas con `transform: translateX` y `mix-blend-mode`, que se
   componen en GPU sin re-rasterizar.

Criterio de éxito: sin picos de *Paint* durante los *bursts*; *Composite* estable
con el hero en pantalla.

### Fase 2 — WebGL con presupuesto · 1–2 días

1. **Un solo bucle activo a la vez**: cuando la banda esté en el centro del
   viewport, bajar la nube a `frameloop="demand"` (o pausarla) y viceversa; hoy las
   dos animan a la vez mientras ambas intersectan.
2. Prisma: `antialias: false` en `pointer: coarse` o con DPR ≥ 2 (el DPR alto ya
   suaviza), y `powerPreference: "default"` en táctil para no forzar la GPU
   dedicada en portátiles.
3. Nube: bajar el valor por defecto a ~30 000 partículas en escritorio y ~15 000 en
   táctil; con puntos de halo la diferencia visual es mínima y el sobredibujado
   aditivo baja a la mitad.
4. Saltar las pasadas GPGPU de `scatter-field` cuando no hay cursor dentro y el
   campo ya está en reposo (estado decaído a 0): hoy se ejecutan siempre.
5. Prisma: hacer el `pickPanel` solo cuando hubo `pointermove` desde el fotograma
   anterior, no en cada fotograma.
6. **Degradación adaptativa sencilla**: medir el tiempo medio de fotograma los
   primeros 2 s; si supera ~22 ms, bajar el DPR un escalón una sola vez (sin
   oscilar, que es lo que el comentario de `device.ts` quiere evitar).
7. Revisar el tope `MAX_DRAW_PIXELS` (2,6 M): en móvil, 1,2–1,5 M es suficiente.

### Fase 3 — Tarjetas ligeras · 1 día

1. `--vp-rx/--vp-ry`: registrar con `inherits: false` donde sea posible y escribirlas
   solo en los elementos que las consumen (`.vp-holo::before`, imagen), no en la
   tarjeta raíz, para acotar el recálculo de estilo.
2. Sacar el `drop-shadow` dinámico de la imagen: dejar el contorno (4 sombras fijas,
   que se cachean) y mover la sombra móvil a un elemento hermano con `transform`.
3. Holograma: sustituir `filter: blur(18px)` por un degradado ya suave (paradas más
   abiertas) o por una imagen/`conic-gradient` precalculado; mover el desplazamiento
   de la lámina a `transform: translate` en lugar de `background-position` con
   variables.
4. Solo la tarjeta bajo el puntero lleva `will-change: transform`; el resto, nada.
5. `content-visibility: auto` + `contain-intrinsic-size` en las filas del catálogo
   y en FAQ/footer para que el navegador no pinte lo que está fuera de pantalla.
6. Sustituir el `:has(.vp-card:hover)` por una clase en `.vp-field` que pone
   `CardField` al entrar/salir (ya escucha `pointermove`).

### Fase 4 — Arranque sin bloqueos · 1–2 días

1. Mover el muestreo de la nube (`sampling.ts`) y el cálculo de siluetas
   (`silhouette.ts`) a un **Web Worker** (con `OffscreenCanvas` para el
   `getImageData`), o como mínimo trocearlos con `scheduler.yield()` /
   `requestIdleCallback`.
2. Cachear el resultado del muestreo (es determinista para un GLB y un nº de
   puntos): precalcular en build a un `.bin` o guardar en `IndexedDB`.
3. Diferir el montaje del prisma hasta que la banda esté a ~1 pantalla
   (`rootMargin` del observer) en lugar de cargarlo junto a la nube.
4. Arrancar los lienzos después de `requestIdleCallback` tras la hidratación para
   no competir con el primer input (mejora INP).

### Fase 5 — Guardas para no volver atrás · ½ día

1. Documentar en `docs/frontend.md` un presupuesto: máximo un filtro SVG activo
   fuera de *bursts* (cero), un bucle WebGL a la vez, nº de capas objetivo.
2. Añadir `@next/bundle-analyzer` o revisar `next build` para vigilar que three.js
   siga fuera del chunk inicial.
3. Repetir el protocolo de la fase 0 y registrar los números aquí.

---

## 3 bis. Resultados de la fase 0 (2026-11-04)

Dispositivo: **Moto G15** (Android, Chrome 156, 432×815 CSS, DPR 2,5, 8 núcleos),
conectado por `adb` + CDP. Build de producción (`next start` en `:3001`), catálogo
real (backend + RDS). Scripts y trazas en el *scratchpad* de la sesión
(`perf/measure.mjs`, `perf/cursor.mjs`); las trazas `.json` se abren en DevTools →
Performance → *Load profile*.

Cada variante desactiva una pieza por CSS inyectado, sin tocar el código:
`no-svg-filter` quita el filtro del glitch; `no-card-fx` además quita la lámina
holográfica y los `drop-shadow` de las tarjetas; `no-filter-no-webgl` quita el filtro
y oculta los lienzos.

### Scroll táctil de arriba abajo

| Variante | FPS | p95 (ms) | Peor fotograma (ms) | Fotogramas >33 ms | Fotogramas perdidos |
|---|---|---|---|---|---|
| Actual | 49,0 | 33,3 | **532** | 20 | 157 |
| Sin filtro SVG | 57,6 | 16,7 | 133 | 6 | 43 |
| Sin filtro ni efectos de tarjeta | **59,5** | 16,7 | 50 | 1 | 8 |
| Sin filtro ni WebGL | 57,4 | 16,8 | 100 | 4 | 49 |

### Quieto en el hero 12 s (incluye un *burst*)

| Variante | FPS | p95 (ms) | Peor fotograma (ms) | Fotogramas perdidos |
|---|---|---|---|---|
| Actual | 56,0 | 33,2 | 116 | 50 |
| Sin filtro SVG | 59,5 | 16,7 | 50 | 7 |

### Carga (primeros 6 s)

| Variante | FPS | Tareas largas (ms) | Peor fotograma (ms) | LCP (ms) |
|---|---|---|---|---|
| Actual | 37,6 | 1 692 | 332 | 556 |
| Sin filtro SVG | 45,8 | 1 177 | 316 | 408 |

### Cursor táctil (mantener pulsado → autoscroll hasta el pie → barrido)

Funciona bien: se activa a los 350 ms, hace autoscroll hasta el pie (4 668 px), se
apaga al soltar y no hubo excepciones en la consola.

| Variante | FPS | p95 (ms) | Fotogramas >33 ms | Fotogramas perdidos | Recálculo de estilo (ms) |
|---|---|---|---|---|---|
| Actual | **43,7** | 50 | 53 | 242 | 1 002 |
| Sin filtro SVG | 51,5 | 33,3 | 31 | 127 | — |
| Sin filtro ni efectos de tarjeta | 54,5 | 33,3 | 15 | 85 | 1 087 |

### Conclusiones

1. **Confirmado: el filtro SVG es el mayor coste.** Quitarlo lleva el hero a 60 fps
   estables y el peor fotograma del scroll baja de 532 ms a 133 ms. → Fase 1.
2. **Los efectos de tarjeta son el segundo coste**, y la suma de los dos explica casi
   todos los tirones del scroll. Sin ambos, el scroll queda a 59,5 fps con un solo
   fotograma lento. → Fase 3.
3. **WebGL pesa menos de lo que suponía la auditoría estática** en este teléfono: con
   el filtro ya fuera, ocultar los lienzos no mejora el scroll. La fase 2 baja de
   prioridad, aunque sigue mereciendo la pena por batería y temperatura.
4. **La carga tiene ~1,1 s de tareas largas pase lo que pase** (en todas las
   variantes). Confirma la fase 4: muestreo de la nube y siluetas fuera del hilo
   principal.
5. **Nuevo: el cursor táctil es el modo más exigente** (43,7 fps). Incluso sin filtro
   ni efectos se queda en 54,5 fps, con ~1 s de recálculo de estilo en 14,5 s que
   **no depende de las tarjetas**. Viene del propio cursor: en cada fotograma hace
   `elementFromPoint` y emite `pointermove`/`mousemove` sintéticos (el listener de
   la nube responde con `getBoundingClientRect`, lo que fuerza un layout), y cambia
   la clase `vp-hot` en toda la cadena de ancestros, que con
   `.vp-field:has(.vp-card.vp-hot)` invalida el estilo de todo el campo. Se añade
   como **fase 3 bis**:
   - emitir eventos sintéticos solo cuando cambia el elemento bajo la punta o el
     punto se mueve más de 1–2 px;
   - no marcar con `vp-hot` los contenedores de página (cortar la cadena en el
     primer elemento interactivo o en la `.vp-card`);
   - cachear el rectángulo del contenedor de la nube (con `ResizeObserver` y scroll)
     en lugar de pedir `getBoundingClientRect` en cada `pointermove`.

---

## 3 ter. Fase 1 — núcleo implementado y medido (2026-11-04)

Decisión de partida: **la ráfaga se conserva entera**, también en la vitrina 3D y en
las tarjetas. Lo que se quita no es el efecto, sino el coste de tenerlo encendido
cuando no hace nada.

### Qué se cambió

1. **El filtro solo mientras dura la ráfaga.** Pasa de `html.glitch-ready`
   (todo el tiempo) a `html.glitch-armed`, que `<PageGlitch />` pone durante la
   entrada y cada ráfaga. Ciclo de trabajo: del 100 % a ~8 %.
2. **Solo en los bloques que están a la vista.** `arm()` mide una vez por ráfaga y
   marca con `.vp-glitch-on` lo que cae en pantalla (más una pantalla de holgura, por
   el scroll durante los 420 ms). El documento mide ~7 000 px y la pantalla ~800:
   antes se filtraban ocho pantallas para enseñar una.
3. **Precalentado de 120 ms** (`ARM_LEAD_MS`) con `dx = 0`, más `will-change: filter`
   solo mientras está armado, para que la promoción de capa no caiga en el pico.
4. **El contenedor del lienzo 3D sale del filtro** (`page.tsx`). No pierde el efecto:
   `vaporizer/scene.tsx` ya lee la misma señal y aplica el desgarro en el shader.

Archivos: `components/page-glitch.tsx`, `app/globals.css`, `app/page.tsx`.

### Resultados (Moto G15, build de producción, 3 repeticiones)

| Escenario | Antes | Después | Objetivo teórico (sin filtro) |
|---|---|---|---|
| Hero quieto · FPS | 56,0 | **58,6** | 59,5 |
| Hero quieto · p95 | 33,2 ms | **16,7 ms** | 16,7 ms |
| Hero quieto · peor fotograma | 116 ms | **66 ms** | 50 ms |
| Scroll · FPS | 49,0 | **52,1** | 57,6 |
| Scroll · p95 | 33,3 ms | **16,8 ms** | 16,7 ms |
| Scroll · peor fotograma | 532 ms | **166 ms** | 133 ms |

El hallazgo del camino: el pico de 532 ms era un `FinishPaintRenderPass` de 450 ms en
la GPU, provocado por filtrar el bloque de dos pantallas que contiene el lienzo. El
punto 4 lo elimina.

**Pendiente de explicar:** el scroll se queda en 52,1 fps frente a los 57,6 teóricos.
La diferencia es el coste de la ráfaga en sí sobre los bloques y las tarjetas
visibles. Como solo vive el 8 % del tiempo, el promedio penaliza más de lo esperado:
apunta a que un *burst* concreto sigue siendo caro. Candidatos, por orden:

- cuantizar `dx` en saltos de 3 px (hoy cambia casi cada fotograma: ~25
  invalidaciones por ráfaga, frente a ~6);
- recortar los márgenes de región de los filtros, sobre todo el 40 % de
  `.vp-glitch-chip`;
- llevar el desgarro al shader del prisma y sacar también su lienzo del filtro.

### Lo que NO mejoró

El cursor táctil se quedó igual o algo peor (41,9 fps frente a 43,7), con más tiempo
de `Paint` (819 ms frente a 366). Tiene sentido: armar y desarmar repinta, y en ese
modo la página está desplazándose de forma continua mientras ocurre. El coste
dominante sigue siendo el del propio cursor (~1,1 s de recálculo de estilo, igual
antes y después), así que **la fase 3 bis sigue siendo necesaria** y es la que debe
arreglarlo.

---

## 3 quater. Huella de glitch — vitrina 3D (2026-11-04)

**Regla de diseño que fija esta sección, y que manda sobre el resto del plan:** las
animaciones propias de cada componente son lo PRINCIPAL y el glitch es un efecto
SECUNDARIO que se superpone. Ninguna optimización puede pausar, ralentizar ni
entrecortar una animación principal para abaratar el glitch.

Un primer intento congelaba el prisma durante la ráfaga. Era más barato y se
descartó: la pausa se leía como un tirón, justo lo que se quería quitar. Queda
anotado para que nadie lo reintente.

### Qué se hace en su lugar

Al arrancar la ráfaga se guarda **una foto de la escena** en una textura. Durante los
~420 ms siguientes esa foto se dibuja ENCIMA de la escena viva, con los canales
separados y cortada en franjas. Es el rastro de dónde estaban las piezas en el
instante en que saltó el glitch, sobre las piezas moviéndose de verdad. El prisma no
deja de girar ni un fotograma.

El desgarro por bandas es el mismo que la nube de puntos (franjas de ~26 px, se
desplaza una de cada tres, semilla avanzando en el tiempo), pero aplicado en espacio
de pantalla sobre una imagen plana en vez de por vértice.

Archivos: `components/prism/ghost.ts` (nuevo), `components/prism/scene.ts`,
`components/trust-band.tsx`.

### Y el lienzo sale del filtro CSS

`trust-band.tsx` pierde `vp-glitch` en la sección y se lo pasa a sus tres tarjetas
(`vp-glitch-card`). **Ese es el cambio que trae la ganancia**, y la huella es lo que
lo hace posible sin perder el efecto: un `filter` sobre un bloque que contiene un
lienzo animado obliga a rehacer el filtrado en cada fotograma de 3D.

Lo único que deja de glitchear es el borde inferior de la sección: dos píxeles de
línea sobre negro.

### Resultados (Moto G15, 3 repeticiones)

| Escenario | Antes de todo | Tras fase 1 | Prisma congelado (descartado) | **Huella** |
|---|---|---|---|---|
| Scroll · FPS | 49,0 | 52,1 | 54,1 | **55,0** |
| Hero quieto · FPS | 56,0 | 58,6 | 57,8 | 57,3 |
| Banda quieta · FPS | — | — | 57,0 | **57,6** |

La huella **supera al congelado** (55,0 frente a 54,1 en scroll) y además mantiene la
animación fluida. Techo teórico sin filtro: 57,6.

**Verificado en pantalla** (`out-huella/prisma-durante.jpg`): bandas desplazadas,
canales separados y la vitrina girando por debajo.

### Para ajustar a ojo

En `ghost.ts`: `MAX_OPACITY` (0,85) es cuánto tapa el rastro a la pieza viva, `TEAR`
(5) cuánto se desplazan las bandas y `BAND_HEIGHT` (26 px) su grosor. El efecto se ve
**más marcado que antes**, porque el desgarro por bandas es más agresivo que la
separación plana de canales que hacía el filtro CSS. Es más fiel a un glitch real,
pero conviene mirarlo antes de darlo por bueno.

Se probó bajar la huella a 0,5 y atenuar la separación de canales al 85% —componiendo
el original debajo del filtro con `feMerge`— y se descartó: se revirtió a los valores
de arriba. Queda anotado para no reintentarlo sin un motivo nuevo.

### Siguiente: la nube de puntos

Pendiente, y es la mitad grande. El desgarro del shader ya trabaja en espacio de
vista (bandas sobre `viewPosition.y`, desplazamiento en `viewPosition.x`), o sea que
se están pagando 56 400 vértices con mezcla aditiva para producir algo que es, en
esencia, una imagen plana cortada en franjas.

Plan: al arrancar la ráfaga, dibujar la nube una vez en una textura; durante los
420 ms, dibujar **un solo rectángulo** con esa textura y hacer el desgarro en el
fragment shader. Se eliminan el relleno aditivo y las dos pasadas GPGPU. Riesgos a
vigilar: memoria del render target (~10 MB al tope actual; probar a media
resolución), fidelidad de la composición aditiva sobre fondo transparente, y que
420 ms congelados no resulten largos (parametrizar para congelar solo el pico).

---

## 4. Orden recomendado y estimación

| Fase | Esfuerzo | Impacto esperado |
|------|----------|------------------|
| 0 · Línea base | ½ día | — (necesaria para validar) |
| 1 · Glitch | 1 día | **El mayor**: elimina repintados por fotograma y los picos periódicos |
| 2 · WebGL | 1–2 días | Alto en hero/banda, sobre todo en móvil y portátiles |
| 3 · Tarjetas | 1 día | Alto en el catálogo (hover y scroll) |
| 4 · Arranque | 1–2 días | Medio: primer segundo e INP |
| 5 · Guardas | ½ día | Mantenimiento |

Empezar por la fase 1: es la que más rinde por línea cambiada y no altera el
diseño, porque con `dx = 0` el filtro permanente no aporta nada visible.
