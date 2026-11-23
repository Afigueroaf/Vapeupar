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
- ~~Contacto: sus bloques.~~ Vive dentro del pie de página, que no se anima.

**No se aplica:** hero (el vaporizador 3D se ancla midiendo su posición y ya
está a la vista al cargar), banda de confianza (escena 3D), barra de
navegación, pie de página, puerta +18, carrito, botón de WhatsApp.

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
