# Scroll reveal «scale up» — diseño

Fecha: 2026-11-23 · Estado: aprobado e implementado (2026-11-23)

## Intención

Mejorar la sensación al usar la web: el contenido aparece a medida que se
avanza con el scroll, con el patrón «simple scale up» de scrollreveal.it
(`<div class="scroll-reveal reveal-scale">`).

## Enfoque elegido (A): ligado al scroll

Solo CSS, con animaciones ligadas al scroll del navegador
(`animation-timeline: view()`), como la librería de referencia
(`@toms15/scroll-reveal-animations`), sin instalarla: se reescribe la parte
que se usa en `globals.css`. El elemento crece y aparece mientras entra en
pantalla y, al subir, vuelve a encogerse.

Descartado: B, disparar la animación una vez al entrar. Funciona en todos los
navegadores, pero no sigue al scroll y el dueño prefiere A.

## Qué hace

- Clases `scroll-reveal` + `reveal-scale` (los nombres de la referencia).
- Estado inicial: `opacity: 0`, `scale(0.7)`, `translateY(100px)`. Estado final:
  normal. Curva `cubic-bezier(0, 0.69, 0.57, 0.56)` (la de la referencia).
- **Tramo corregido para que nada quede a medias:** la referencia anima de
  `entry 10%` a `cover 30%`, y con eso lo que ya está en pantalla al cargar o
  al final de una página corta (la última fila, la sección final) puede no
  completarse nunca porque no queda scroll. Aquí el tramo es
  `entry 0%` → `entry 100%`: el elemento está completo en cuanto entra entero
  en pantalla, y lo que ya está entero a la vista al cargar se ve completo.
  Por eso **solo se aplica a piezas más bajas que la pantalla** (tarjetas,
  títulos, bloques), nunca a contenedores altos.
- **Sin saltos de altura:** el desplazamiento de 100 px de lo que aún no ha
  entrado no debe alargar la página (evitar con `overflow-y: clip` en el
  contenedor o reduciendo el desplazamiento; el implementador verifica que la
  altura del documento no cambia al hacer scroll).
- **Escalonado** en las rejillas de productos: cada columna empieza un poco
  más tarde (desplazando el inicio del tramo), según las columnas de cada
  punto de corte.
- Movimiento reducido o navegador sin soporte (Firefox hoy): todo visible y
  quieto, sin animación.

## Dónde se aplica

- Portada: cabecera y filtros del catálogo, tarjetas de producto (con
  escalonado), cabecera y preguntas del FAQ.
- Colección: cabecera, pestañas y tarjetas de producto.
- Ficha de producto: secciones «ficha técnica» y «descripción».
- Nosotros: pilares y sección de mayores de edad.

- Vitrina 3D de productos destacados (añadida después a petición del dueño).

- Banda de confianza entera (petición del dueño): cabeceras de «Vitrina» e
  «Información», tirador INFO lateral y tarjetas de información en cascada.
- Pie de página (petición del dueño): advertencia +18, las cuatro columnas de
  contacto y la línea final; en la vista previa de la consola, quietas.

**No se aplica:** hero (el vaporizador 3D se ancla midiendo su posición y ya
está a la vista al cargar), barra de navegación, puerta +18, carrito, botón de
WhatsApp.

## No-objetivos

- No instalar la librería ni añadir dependencias.
- No reproducir otras variantes (rotación, desenfoque, laterales).

## Criterio del implementador

Valores exactos del escalonado, cómo evitar el alargamiento de la página, y
el reparto fino de clases dentro de cada componente.

## Notas de la implementación

- Las tarjetas del catálogo se miden sin transforms (`<CardField measure="layout">`,
  `lib/layout-offset.ts`): medidas a media animación descuadraban el fondo
  continuo de la rejilla. La banda de confianza sigue midiendo con
  `getBoundingClientRect` porque su cajón mueve las tarjetas con `transform`.
- La altura del documento no cambia con el scroll (medido: constante en
  portada y colección) porque el pie, que no se anima, va siempre al final.
- Al terminar queda una matriz identidad aplicada: no poner `scroll-reveal` en
  nada que contenga un overlay `position: fixed`.
- Suavizado (petición del dueño, tras la primera versión): `scale(0.88)` y 40px
  en vez de 0.7 y 100px, curva `ease` en vez de la de la referencia, y el
  tramo sigue 15vh después de que la pieza entre entera. Debajo de la última
  pieza animada siempre quedan ≥705px (el pie), así que nada queda a medias.
- La vitrina 3D no se descuadra al escalar: el lienzo se dimensiona con un
  `ResizeObserver` (layout, sin transforms; medido 1280px de lienzo para
  1280px de layout) y el puntero se calcula sobre la caja visible.
- Opacidad un 30% más transparente (petición del dueño): va en su propia
  animación, `vp-scroll-reveal-fade`, con la curva `ease` elevada a 1,86
  (`linear()`): transparencia media del tramo 0,33 → 0,43; a mitad, opacidad
  0,66 en vez de 0,80. El movimiento no cambia y sigue terminando en 1.
- Relleno `backwards`, no `both`: con `both` el estado final se quedaba
  aplicado y pisaba el `transform` propio de `.vp-card`, así que las tarjetas
  del catálogo (#47) perdieron la inclinación 3D al pasar el puntero. Ahora la
  animación deja de aplicarse al acabar su tramo.
- El pie no tiene los 15vh de cola (es lo último del documento): su tramo
  acaba en `entry 100%`, justo cuando entra entero, y solo escala, sin
  desplazamiento, para no alargar la página. Medido: altura constante y nada a
  medias al final de portada, Nosotros, colección y ficha (1280 y 360).
