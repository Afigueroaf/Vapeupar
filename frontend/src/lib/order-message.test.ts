import { describe, expect, it } from "vitest";
import type { CartLine } from "@/lib/cart";
import { orderMessage, orderReference } from "@/lib/order-message";

function line(overrides: Partial<CartLine>): CartLine {
  return {
    key: "p1:",
    productId: "p1",
    variantId: null,
    slug: "linea",
    variantSlug: null,
    name: "Línea",
    brand: "Marca",
    variantName: null,
    variantKind: null,
    price: 10_000,
    imageUrl: "",
    quantity: 1,
    maxQuantity: 10,
    ...overrides,
  };
}

describe("orderReference", () => {
  it("es VP- y 6 caracteres sin 0, O, 1, I ni L", () => {
    for (let i = 0; i < 200; i++) {
      const ref = orderReference();
      expect(ref).toMatch(/^VP-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
      expect(ref.slice(3)).not.toMatch(/[01OIL]/);
    }
  });
});

describe("orderMessage", () => {
  it("lista las líneas con y sin variante, el subtotal y la referencia en negrita", () => {
    const lines = [
      line({ key: "p1:", name: "ONE", quantity: 1, price: 45_000 }),
      line({
        key: "p2:v1",
        name: "ECO PRO",
        variantName: "Mango",
        variantKind: "flavor",
        quantity: 2,
        price: 30_000,
      }),
      line({
        key: "p3:v2",
        name: "ONE",
        variantName: "Negro",
        variantKind: "color",
        quantity: 3,
        price: 12_500,
      }),
    ];
    const message = orderMessage(lines, 142_500, "VP-ABC234");

    expect(message).toContain("(*VP-ABC234*)");
    expect(message).toContain("— Sabor: Mango");
    expect(message).toContain("— Color: Negro");
    expect(message).toMatchInlineSnapshot(`
      "Hola Vapeupar! Quiero hacer este pedido (*VP-ABC234*):

      • 1 × *ONE* — $ 45.000
      • 2 × *ECO PRO* — Sabor: Mango — $ 60.000
      • 3 × *ONE* — Color: Negro — $ 37.500

      *Subtotal: $ 142.500*
      Pago contra entrega.
      ¿Me confirman disponibilidad y el valor del domicilio en Valledupar?"
    `);
  });

  it("no pone variante si falta el nombre o el tipo", () => {
    const message = orderMessage(
      [line({ variantName: "Mango", variantKind: null })],
      10_000,
      "VP-XYZ789",
    );
    expect(message).not.toContain("Mango");
  });
});
