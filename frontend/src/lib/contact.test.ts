import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `contact.ts` lee `NEXT_PUBLIC_*` al cargarse: hay que fijar el entorno ANTES
 * del import dinámico y reiniciar módulos entre pruebas.
 */
async function loadContact(env: { whatsapp?: string; phone?: string }) {
  vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", env.whatsapp ?? "");
  vi.stubEnv("NEXT_PUBLIC_STORE_PHONE", env.phone ?? "");
  return import("@/lib/contact");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("waLink", () => {
  it("sin número devuelve null: no se inventan números", async () => {
    const contact = await loadContact({});
    expect(contact.whatsappNumber).toBeNull();
    expect(contact.waLink("Hola")).toBeNull();
  });

  it("un número en blanco cuenta como ausente", async () => {
    const contact = await loadContact({ whatsapp: "   " });
    expect(contact.waLink("Hola")).toBeNull();
  });

  it("con número, la URL lleva el mensaje codificado", async () => {
    const contact = await loadContact({ whatsapp: " 573001234567 " });
    expect(contact.waLink("Hola *VP-ABC234* & ñ\n¿ok?")).toBe(
      `https://wa.me/573001234567?text=${encodeURIComponent("Hola *VP-ABC234* & ñ\n¿ok?")}`,
    );
  });
});

describe("telLink", () => {
  it("sin teléfono devuelve null y con teléfono un enlace tel:", async () => {
    expect((await loadContact({})).telLink()).toBeNull();
    vi.resetModules();
    expect((await loadContact({ phone: "+573001234567" })).telLink()).toBe("tel:+573001234567");
  });
});

describe("formatPhoneCO", () => {
  it("formatea un número colombiano E.164", async () => {
    const { formatPhoneCO } = await loadContact({});
    expect(formatPhoneCO("+573001234567")).toBe("+57 300 123 4567");
    expect(formatPhoneCO("573001234567")).toBe("+57 300 123 4567");
  });

  it("devuelve tal cual un formato no esperado", async () => {
    const { formatPhoneCO } = await loadContact({});
    expect(formatPhoneCO("+34600123456")).toBe("+34600123456");
    expect(formatPhoneCO("300 123 4567")).toBe("300 123 4567");
  });
});
