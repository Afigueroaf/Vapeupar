/**
 * Posición de `element` dentro de `ancestor` (borde a borde) según el LAYOUT,
 * sin `transform`.
 *
 * `getBoundingClientRect` incluye los `transform` de la caja y de sus
 * ancestros. Con el scroll reveal (`.scroll-reveal` en `globals.css`) las
 * tarjetas del catálogo están encogidas y desplazadas mientras entran, así que
 * medirlas así descuadraba el fondo continuo de `<CardField />`. Los
 * `offsetLeft/offsetTop` ignoran los transforms: sumándolos por la cadena de
 * `offsetParent` (con los bordes de cada uno) se obtiene la posición de
 * reposo.
 */
export interface OffsetNode {
  offsetLeft: number;
  offsetTop: number;
  clientLeft: number;
  clientTop: number;
  offsetParent: OffsetNode | null;
}

function pagePosition(element: OffsetNode) {
  let x = element.offsetLeft;
  let y = element.offsetTop;

  for (let parent = element.offsetParent; parent; parent = parent.offsetParent) {
    x += parent.offsetLeft + parent.clientLeft;
    y += parent.offsetTop + parent.clientTop;
  }

  return { x, y };
}

export function layoutOffset(element: OffsetNode, ancestor: OffsetNode): { x: number; y: number } {
  const inner = pagePosition(element);
  const outer = pagePosition(ancestor);
  return { x: inner.x - outer.x, y: inner.y - outer.y };
}
