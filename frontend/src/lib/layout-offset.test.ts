import { describe, expect, it } from "vitest";
import { layoutOffset, type OffsetNode } from "@/lib/layout-offset";

const node = (
  offsetLeft: number,
  offsetTop: number,
  offsetParent: OffsetNode | null,
  clientLeft = 0,
  clientTop = 0,
): OffsetNode => ({ offsetLeft, offsetTop, offsetParent, clientLeft, clientTop });

describe("layoutOffset", () => {
  it("con el ancestro posicionado, es el offset del hijo más el borde del ancestro", () => {
    const body = node(0, 0, null);
    const root = node(40, 900, body, 2, 2);
    const card = node(300, 520, root);
    expect(layoutOffset(card, root)).toEqual({ x: 302, y: 522 });
  });

  it("con un ancestro NO posicionado, resta las posiciones de los dos en la página", () => {
    const body = node(0, 0, null);
    const section = node(0, 1200, body, 0, 0);
    // El campo no es offsetParent: tarjeta y campo cuelgan de `section`.
    const root = node(40, 300, section);
    const card = node(340, 820, section);
    expect(layoutOffset(card, root)).toEqual({ x: 300, y: 520 });
  });

  it("suma los bordes de los offsetParent intermedios", () => {
    const body = node(0, 0, null);
    const root = node(0, 0, body);
    const inner = node(10, 10, root, 3, 4);
    const card = node(5, 6, inner);
    expect(layoutOffset(card, root)).toEqual({ x: 18, y: 20 });
  });
});
