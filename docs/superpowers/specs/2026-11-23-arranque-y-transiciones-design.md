# Pantalla de arranque y transiciones entre páginas — diseño

Fecha: 2026-11-23 · Estado: aprobado (2026-11-23)

## Intención

Que la web pública se sienta más fluida y de marca: cada carga arranca con el
logo VU dibujándose, y navegar entre páginas deja de ser un corte seco.

## Qué se hace

1. **Pantalla de arranque** (`components/boot-screen.tsx`).
   - Aparece en **cada carga o recarga** de la web pública (no en `/admin`).
   - Se pinta desde el servidor (HTML inicial), así cubre la página desde el
     primer fotograma, incluida la hidratación.
   - Logo: los trazos vectoriales de `assets/logo/logovupar_w.svg` (sin la
     imagen PNG oculta que trae incrustada), inline en el componente.
   - Animación (mecanismo del prompt, paleta Vapeupar):
     - Fondo `#080808` (token `--color-vp-black`) constante.
     - Dibujo: cada contorno anima `stroke-dashoffset` de su longitud
       (`getTotalLength()`) a 0 en 2200 ms, escalonado entre 0 y 400 ms;
       trazo `#f5f5f5`, extremos y uniones redondeadas. Todo termina a 2600 ms.
     - De 2700 a 3300 ms, fundido de contornos → relleno blanco.
     - Sostén 3300–3500 ms; de 3500 a 4000 ms la pantalla entera se
       desvanece y se desmonta. **Una sola pasada, sin bucle ni botones.
       Total: 4 s** (aprobado por el dueño).
     - Curva: `ease(v) = 0.5 − 0.5·cos(π·clamp(v,0,1))`, un solo bucle rAF.
   - Bloquea el scroll (Lenis y body) mientras está visible.
   - `prefers-reduced-motion`: logo relleno estático ~600 ms y fundido.
   - Sin JS: un `<noscript>` la oculta para no dejar la web tapada.
   - Accesible: `role="status"`/`aria-label="Cargando Vapeupar"`, el resto
     del contenido no recibe foco mientras está.
2. **Fuera el glitch de entrada de 2,8 s** (`page-glitch.tsx`): se elimina la
   fase `INTRO_DECAY_MS`; las ráfagas periódicas siguen igual.
3. **Puerta +18 sin parpadeo.** Se mantiene el TTL de 30 días y todo lo
   legal. El parpadeo (el servidor la pinta cerrada y se ve un instante al
   hidratar) queda tapado por la pantalla de arranque, que solo se retira tras
   la hidratación; la puerta aparece, si toca, cuando el arranque se va.
4. **Transiciones entre páginas: fundido suave (opción A).**
   - View Transitions de React 19.3 (`<ViewTransition>`) + `experimental.viewTransition`
     de Next 16: el `<main>` de las páginas públicas sale y entra con fundido
     y un desplazamiento vertical pequeño (~300 ms, `--ease-vp`).
   - Navbar, footer, botón de WhatsApp y puerta +18 quedan fijos, sin animar.
   - Navegadores sin View Transitions: cambio instantáneo, como hoy.
   - `prefers-reduced-motion`: sin animación.

## Enfoques considerados (transición)

- **A. Fundido suave** — elegido: fluido, no retrasa la navegación, nativo.
- B. Cortina de marca — más visible, pero añade 600–800 ms a cada clic.
- C. Golpe de glitch — muy de marca, pero brusco.

## No-objetivos

- Ninguna pantalla de carga en las navegaciones.
- No cambiar el texto legal, la clave ni el TTL de la puerta +18.
- No tocar el panel `/admin`.

## Criterio del implementador

Escalonado exacto de los contornos, valores finos del fundido y cómo excluir
`/admin` (mismo patrón que `PageGlitch`).
