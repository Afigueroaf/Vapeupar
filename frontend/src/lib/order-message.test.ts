import { describe, expect, it } from "vitest";
import type { CartLine } from "@/lib/cart";
import { orderMessage, orderReference, registeredOrderMessage } from "@/lib/order-message";
import { formatPriceCOP } from "@/lib/utils";

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

describe("registeredOrderMessage", () => {
  const lines = [
    line({ key: "p1:v1", name: "ECO PRO", variantName: "Mango", variantKind: "flavor", quantity: 2, price: 30_000 }),
    line({ key: "p2:v2", name: "ONE", variantName: "Negro", variantKind: "color", quantity: 1, price: 45_000 }),
  ];

  it("usa la referencia y el subtotal del servidor", () => {
    expect(registeredOrderMessage(lines, { reference: "VP-SRV234", subtotal: 105_000 })).toMatchInlineSnapshot(`
      "Hola Vapeupar! Acabo de hacer el pedido *VP-SRV234* en la web:

      • 2 × *ECO PRO* — Sabor: Mango — $ 60.000
      • 1 × *ONE* — Color: Negro — $ 45.000

      *Subtotal: $ 105.000*
      Pago contra entrega.
      ¿Me confirman disponibilidad y el valor del domicilio en Valledupar?"
    `);
  });

  it("omite los importes por línea si el precio del servidor es otro", () => {
    const message = registeredOrderMessage(lines, { reference: "VP-SRV234", subtotal: 110_000 });
    expect(message).toContain("• 2 × *ECO PRO* — Sabor: Mango\n");
    expect(message).not.toContain(formatPriceCOP(60_000));
    expect(message).toContain(`*Subtotal: ${formatPriceCOP(110_000)}*`);
  });
});
