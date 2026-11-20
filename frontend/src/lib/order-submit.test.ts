import { describe, expect, it, vi } from "vitest";
import type { CartLine } from "@/lib/cart";
import { DATA_POLICY_VERSION } from "@/lib/order-form";
import {
  adjustmentsFor,
  bodyFingerprint,
  buildOrderBody,
  canRegister,
  interpretOrderResponse,
  nextSubmissionKey,
  ordersEnabled,
  ordersUrl,
  submitOrder,
} from "@/lib/order-submit";

const MANGO = "019299a4-0000-7000-8000-0000000000a1";
const GRAY = "019299a4-0000-7000-8000-0000000000a3";

function line(overrides: Partial<CartLine>): CartLine {
  return {
    key: `p1:${MANGO}`,
    productId: "p1",
    variantId: MANGO,
    slug: "eco",
    variantSlug: "mango",
    name: "ECO 3",
    brand: "LifePod",
    variantName: "Mango",
    variantKind: "flavor",
    price: 45_000,
    imageUrl: "",
    quantity: 2,
    maxQuantity: 10,
    ...overrides,
  };
}

const customer = { name: "Ana Pérez", phone: "+573001234567", neighborhood: "Novalito" };
const lines = [line({}), line({ key: `p2:${GRAY}`, productId: "p2", variantId: GRAY, quantity: 1, price: 120_000 })];

describe("ordersEnabled", () => {
  it("solo con «true»: apagado por defecto", () => {
    expect(ordersEnabled(undefined)).toBe(false);
    expect(ordersEnabled("")).toBe(false);
    expect(ordersEnabled("1")).toBe(false);
    expect(ordersEnabled("false")).toBe(false);
    expect(ordersEnabled("true")).toBe(true);
    expect(ordersEnabled(" true ")).toBe(true);
  });
});

describe("canRegister", () => {
  it("exige una variante con UUID por línea, sin repetir y como mucho 20 líneas", () => {
    expect(canRegister(lines)).toBe(true);
    expect(canRegister([])).toBe(false);
    expect(canRegister([line({ variantId: null })])).toBe(false);
    expect(canRegister([line({ variantId: "v1" })])).toBe(false);
    expect(canRegister([line({}), line({ key: "otra" })])).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) =>
      line({ key: `k${i}`, variantId: `019299a4-0000-7000-8000-${String(i).padStart(12, "0")}` }),
    );
    expect(canRegister(many)).toBe(false);
    expect(canRegister(many.slice(0, 20))).toBe(true);
  });
});

describe("buildOrderBody", () => {
  it("lleva clave, cliente, autorización con la versión vigente y líneas sin precio", () => {
    const body = buildOrderBody(lines, customer, "k-1");
    expect(body).toEqual({
      submissionKey: "k-1",
      customer,
      consent: { accepted: true, policyVersion: DATA_POLICY_VERSION },
      lines: [
        { variantId: MANGO, quantity: 2 },
        { variantId: GRAY, quantity: 1 },
      ],
    });
    expect(JSON.stringify(body)).not.toMatch(/price|subtotal/i);
  });
});

describe("nextSubmissionKey", () => {
  const fingerprint = (c = customer, l = lines) => {
    return bodyFingerprint(buildOrderBody(l, c, "x"));
  };

  it("repite la clave para el mismo envío y estrena una si cambian los datos o el carrito", () => {
    let n = 0;
    const newKey = () => `k-${++n}`;
    const first = nextSubmissionKey(null, fingerprint(), newKey);
    expect(first.key).toBe("k-1");
    expect(nextSubmissionKey(first, fingerprint(), newKey).key).toBe("k-1");
    const edited = nextSubmissionKey(first, fingerprint({ ...customer, neighborhood: "Los Mayales" }), newKey);
    expect(edited.key).toBe("k-2");
    const fewer = nextSubmissionKey(edited, fingerprint(customer, [lines[0]]), newKey);
    expect(fewer.key).toBe("k-3");
  });

  it("por defecto es un UUID", () => {
    expect(nextSubmissionKey(null, "x").key).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("interpretOrderResponse", () => {
  it("201 y 200 (reintento) devuelven referencia y subtotal del servidor", () => {
    const body = { success: true, data: { reference: "VP-ABC234", subtotal: 210_000 } };
    expect(interpretOrderResponse(201, body)).toEqual({ kind: "created", reference: "VP-ABC234", subtotal: 210_000 });
    expect(interpretOrderResponse(200, body)).toEqual({ kind: "created", reference: "VP-ABC234", subtotal: 210_000 });
  });

  it("un 200 sin la forma esperada no se da por registrado", () => {
    expect(interpretOrderResponse(200, { success: true, data: {} })).toEqual({ kind: "fallback", cause: "server" });
    expect(interpretOrderResponse(200, null)).toEqual({ kind: "fallback", cause: "server" });
  });

  it("409 UNAVAILABLE trae las líneas", () => {
    const outcome = interpretOrderResponse(409, {
      success: false,
      code: "UNAVAILABLE",
      lines: [
        { variantId: MANGO, reason: "insufficient_stock", available: 1 },
        { variantId: GRAY, reason: "unavailable" },
        { nada: true },
      ],
    });
    expect(outcome).toEqual({
      kind: "unavailable",
      lines: [
        { variantId: MANGO, reason: "insufficient_stock", available: 1 },
        { variantId: GRAY, reason: "unavailable" },
      ],
    });
  });

  it("409 CONFLICT pide clave nueva", () => {
    expect(interpretOrderResponse(409, { success: false, code: "CONFLICT" })).toEqual({ kind: "conflict" });
  });

  it("429 usa el mensaje del limitador, o uno propio si no vino en JSON", () => {
    expect(interpretOrderResponse(429, { success: false, message: "Espera" })).toEqual({
      kind: "rate-limited",
      message: "Espera",
    });
    expect(interpretOrderResponse(429, null)).toMatchObject({ kind: "rate-limited", message: expect.any(String) });
  });

  it("400 proyecta los errores sobre los campos del formulario", () => {
    const outcome = interpretOrderResponse(400, {
      success: false,
      message: "Pedido inválido",
      errors: [
        { field: "customer.phone", message: "Escribe un celular colombiano" },
        { field: "customer.name", message: "Mínimo 2 caracteres" },
      ],
    });
    expect(outcome).toEqual({
      kind: "invalid",
      fields: { phone: "Escribe un celular colombiano", name: "Mínimo 2 caracteres" },
      message: "Pedido inválido",
      policyChanged: false,
    });
  });

  it("400 por otra versión de la política pide recargar", () => {
    const outcome = interpretOrderResponse(400, {
      errors: [{ field: "consent.policyVersion", message: "La política de datos cambió" }],
    });
    expect(outcome).toMatchObject({ kind: "invalid", policyChanged: true, message: expect.stringMatching(/Recárgala/) });
  });

  it("404 (pedidos apagados en el backend) y 5xx caen al camino de siempre", () => {
    expect(interpretOrderResponse(404, { success: false })).toEqual({ kind: "fallback", cause: "disabled" });
    expect(interpretOrderResponse(500, null)).toEqual({ kind: "fallback", cause: "server" });
    expect(interpretOrderResponse(502, null)).toEqual({ kind: "fallback", cause: "server" });
    // Un 409 sin código conocido tampoco se puede resolver en el cajón.
    expect(interpretOrderResponse(409, { code: "OTRO" })).toEqual({ kind: "fallback", cause: "server" });
  });
});

describe("submitOrder", () => {
  const body = buildOrderBody(lines, customer, "019299a4-0000-7000-8000-000000000001");

  it("hace POST con el cuerpo en JSON y sin cookies", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: { reference: "VP-ABC234", subtotal: 210_000 } }), {
        status: 201,
      }),
    );
    const outcome = await submitOrder(body, { fetchImpl: fetchImpl as typeof fetch, url: "http://api/orders" });
    expect(outcome).toEqual({ kind: "created", reference: "VP-ABC234", subtotal: 210_000 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api/orders");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(JSON.parse(String(init.body))).toEqual(body);
  });

  it("un fallo de red no lanza: es fallback", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await submitOrder(body, { fetchImpl: fetchImpl as typeof fetch })).toEqual({
      kind: "fallback",
      cause: "network",
    });
  });

  it("un servidor que no contesta a tiempo es fallback", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("abortado", "AbortError")));
        }),
    );
    const outcome = await submitOrder(body, { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10 });
    expect(outcome).toEqual({ kind: "fallback", cause: "network" });
  });

  it("una respuesta que no es JSON se interpreta por su código", async () => {
    const fetchImpl = vi.fn(async () => new Response("Too many requests", { status: 429 }));
    expect(await submitOrder(body, { fetchImpl: fetchImpl as typeof fetch })).toMatchObject({ kind: "rate-limited" });
  });
});

describe("ordersUrl", () => {
  it("cuelga /orders de la base, relativa o absoluta", () => {
    expect(ordersUrl("/api")).toBe("/api/orders");
    expect(ordersUrl("http://localhost:4000/api/")).toBe("http://localhost:4000/api/orders");
  });
});

describe("adjustmentsFor", () => {
  it("limita al disponible o quita la línea; las no señaladas no se tocan", () => {
    const adjustments = adjustmentsFor(lines, [
      { variantId: MANGO, reason: "insufficient_stock", available: 1 },
      { variantId: GRAY, reason: "unavailable" },
      { variantId: "019299a4-0000-7000-8000-0000000000ff", reason: "unavailable" },
    ]);
    expect(adjustments).toEqual([
      { key: `p1:${MANGO}`, max: 1, message: "Solo queda 1: ajustamos la cantidad." },
      { key: `p2:${GRAY}`, max: 0, message: "Ya no está disponible: la quitamos del pedido." },
    ]);
  });

  it("sin stock (disponible 0) la quita", () => {
    expect(adjustmentsFor(lines, [{ variantId: MANGO, reason: "insufficient_stock", available: 0 }])).toEqual([
      { key: `p1:${MANGO}`, max: 0, message: "Se agotó: la quitamos del pedido." },
    ]);
  });
});
