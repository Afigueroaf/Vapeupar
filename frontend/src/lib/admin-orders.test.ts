import { describe, expect, it } from "vitest";
import {
  buildConfirmInput,
  customerWhatsApp,
  dayBoundary,
  describeIssues,
  draftTotal,
  initialConfirmDraft,
  orderActions,
  parsePesos,
  transitionMessage,
} from "@/lib/admin-orders";
import type { Order } from "@/types/admin";

const MANGO = "019299a4-0000-7000-8000-0000000000a1";
const GRAY = "019299a4-0000-7000-8000-0000000000a3";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "019299a4-0000-7000-8000-00000000f001",
    reference: "VP-ABC234",
    status: "received",
    customer: { name: "Ana Pérez", phone: "+573001234567", neighborhood: "Novalito" },
    subtotal: 210_000,
    deliveryFee: null,
    total: null,
    cancelReason: null,
    confirmedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    anonymizedAt: null,
    createdAt: "2026-11-20T15:00:00.000Z",
    updatedAt: "2026-11-20T15:00:00.000Z",
    lines: [
      { id: "l1", variantId: MANGO, productName: "LifePod ECO 3", variantName: "Mango Ice", quantity: 2, listPrice: 45_000, unitPrice: null },
      { id: "l2", variantId: GRAY, productName: "LifePod ONE", variantName: "Space Gray", quantity: 1, listPrice: 120_000, unitPrice: null },
    ],
    consent: { policyVersion: "borrador-2026-11-20", purpose: "pedido", acceptedAt: "2026-11-20T15:00:00.000Z" },
    ...overrides,
  };
}

describe("dayBoundary", () => {
  // Instantes exactos: no dependen de la zona horaria del equipo que corre la prueba.
  it("principio y fin del día en hora de Colombia (UTC-5)", () => {
    expect(dayBoundary("2026-11-20", "start")).toBe("2026-11-20T05:00:00.000Z");
    expect(dayBoundary("2026-11-20", "end")).toBe("2026-11-21T04:59:59.999Z");
    expect(dayBoundary("2026-12-31", "end")).toBe("2027-01-01T04:59:59.999Z");
  });

  it("vacío, mal formado o un día que no existe no filtra", () => {
    expect(dayBoundary("", "start")).toBeUndefined();
    expect(dayBoundary("20/11/2026", "end")).toBeUndefined();
    expect(dayBoundary("2026-02-31", "start")).toBeUndefined();
  });
});

describe("parsePesos", () => {
  it("admite puntos y espacios de miles", () => {
    expect(parsePesos("45000")).toBe(45_000);
    expect(parsePesos(" 45.000 ")).toBe(45_000);
    expect(parsePesos("1 200 000")).toBe(1_200_000);
    expect(parsePesos("0")).toBe(0);
  });

  it("rechaza decimales, negativos, letras y lo que pase del tope", () => {
    for (const text of ["", "45,5", "-1", "abc", "10000001"]) expect(parsePesos(text)).toBeNull();
    expect(parsePesos("6000", 5000)).toBeNull();
  });
});

describe("buildConfirmInput", () => {
  it("a precio de lista solo viaja el domicilio", () => {
    const o = order();
    const draft = { ...initialConfirmDraft(o), deliveryFee: "5.000" };
    expect(buildConfirmInput(o, draft, "owner")).toEqual({ ok: true, input: { deliveryFee: 5000 } });
  });

  it("el owner manda solo las líneas con otro precio", () => {
    const o = order();
    const draft = { deliveryFee: "0", prices: { ...initialConfirmDraft(o).prices, [MANGO]: "40000" } };
    expect(buildConfirmInput(o, draft, "owner")).toEqual({
      ok: true,
      input: { deliveryFee: 0, lines: [{ variantId: MANGO, unitPrice: 40_000 }] },
    });
  });

  it("al operator se le ignoran los precios: confirma a precio de lista", () => {
    const o = order();
    const draft = { deliveryFee: "3000", prices: { [MANGO]: "1" } };
    expect(buildConfirmInput(o, draft, "operator")).toEqual({ ok: true, input: { deliveryFee: 3000 } });
  });

  it("exige el domicilio y precios válidos, con el error en su campo", () => {
    const o = order();
    const result = buildConfirmInput(o, { deliveryFee: "", prices: { [GRAY]: "12,5" } }, "owner");
    expect(result).toEqual({
      ok: false,
      errors: { deliveryFee: expect.stringMatching(/domicilio/), prices: { [GRAY]: expect.any(String) } },
    });
    expect(buildConfirmInput(o, { deliveryFee: "2000000", prices: {} }, "owner").ok).toBe(false);
  });
});

describe("draftTotal", () => {
  it("suma precios cobrados y domicilio", () => {
    const o = order();
    expect(draftTotal(o, { deliveryFee: "5000", prices: { [MANGO]: "40000", [GRAY]: "120000" } }, "owner")).toBe(205_000);
    expect(draftTotal(o, { deliveryFee: "5000", prices: { [MANGO]: "1" } }, "operator")).toBe(215_000);
    expect(draftTotal(o, { deliveryFee: "x", prices: {} }, "owner")).toBeNull();
  });
});

describe("orderActions", () => {
  it("cada estado con sus salidas", () => {
    expect(orderActions(order(), "operator")).toEqual({ confirm: true, deliver: false, cancel: true, anonymize: false });
    expect(orderActions(order({ status: "confirmed" }), "operator")).toEqual({
      confirm: false,
      deliver: true,
      cancel: true,
      anonymize: false,
    });
    expect(orderActions(order({ status: "delivered" }), "operator").anonymize).toBe(false);
    expect(orderActions(order({ status: "delivered" }), "owner")).toEqual({
      confirm: false,
      deliver: false,
      cancel: false,
      anonymize: true,
    });
    expect(orderActions(order({ status: "cancelled", anonymizedAt: "2026-11-21T00:00:00Z", customer: null }), "owner").anonymize).toBe(false);
    // Abierto: primero se cancela.
    expect(orderActions(order({ status: "confirmed" }), "owner").anonymize).toBe(false);
  });
});

describe("transitionMessage", () => {
  const result = (o: Order, revalidated: boolean, replayed = false) => ({ order: o, revalidated, replayed });

  it("avisa de los 60 s solo si se movió stock y el aviso al sitio falló", () => {
    const confirmed = order({ status: "confirmed" });
    expect(transitionMessage("confirm", "received", result(confirmed, false))).toBe(
      "Pedido VP-ABC234 confirmado: se descontó el stock. Se verá en el sitio en ≤60 s.",
    );
    expect(transitionMessage("confirm", "received", result(confirmed, true))).toMatch(/El sitio ya lo refleja\.$/);
    const cancelled = order({ status: "cancelled" });
    expect(transitionMessage("cancel", "confirmed", result(cancelled, false))).toBe(
      "Pedido VP-ABC234 cancelado: se devolvió el stock. Se verá en el sitio en ≤60 s.",
    );
    expect(transitionMessage("cancel", "received", result(cancelled, false))).toBe("Pedido VP-ABC234 cancelado.");
    expect(transitionMessage("deliver", "confirmed", result(order({ status: "delivered" }), false))).toBe(
      "Pedido VP-ABC234 entregado.",
    );
  });

  it("una repetición lo dice y no promete nada", () => {
    expect(transitionMessage("confirm", "confirmed", result(order({ status: "confirmed" }), true, true))).toBe(
      "El pedido VP-ABC234 ya estaba confirmado: no se repitió nada.",
    );
  });
});

describe("describeIssues", () => {
  it("nombra la línea, lo pedido y lo disponible", () => {
    expect(
      describeIssues(order(), [
        { variantId: MANGO, reason: "insufficient_stock", available: 1 },
        { variantId: GRAY, reason: "insufficient_stock", available: 0 },
        { variantId: "otra", reason: "unavailable" },
      ]),
    ).toEqual([
      "LifePod ECO 3 · Mango Ice: pide 2, hay 1 disponible",
      "LifePod ONE · Space Gray: pide 1, hay 0 disponibles",
      "Variante desconocida: ya no se puede vender",
    ]);
  });
});

describe("customerWhatsApp", () => {
  it("enlaza al celular del cliente, o nada si está anonimizado", () => {
    expect(customerWhatsApp(order())).toBe("https://wa.me/573001234567");
    expect(customerWhatsApp(order({ customer: null }))).toBeNull();
  });
});
