import { describe, expect, it } from "vitest";
import {
  DATA_POLICY_VERSION,
  EMPTY_CUSTOMER,
  firstInvalidField,
  isDraftPolicy,
  normalizeColombianMobile,
  validateCustomer,
  type CustomerDraft,
} from "@/lib/order-form";

const valid: CustomerDraft = {
  name: "  Ana   Pérez ",
  phone: "300 123 4567",
  neighborhood: "Novalito",
  consent: true,
};

describe("normalizeColombianMobile", () => {
  it("acepta 10 cifras que empiezan por 3, con o sin +57 y separadores", () => {
    for (const input of ["3001234567", "300 123 4567", "+57 300-123-4567", "57 (300) 123.4567", "+573001234567"]) {
      expect(normalizeColombianMobile(input)).toBe("+573001234567");
    }
  });

  it("rechaza fijos, longitudes erróneas y basura", () => {
    for (const input of ["6055551234", "300123456", "30012345678", "+1 300 123 4567", "tres", "", "3".repeat(31)]) {
      expect(normalizeColombianMobile(input)).toBeUndefined();
    }
  });
});

describe("validateCustomer", () => {
  it("devuelve el valor limpio: espacios colapsados y celular normalizado", () => {
    expect(validateCustomer(valid)).toEqual({
      ok: true,
      value: { name: "Ana Pérez", phone: "+573001234567", neighborhood: "Novalito" },
    });
  });

  it("el formulario vacío marca los cuatro campos, incluida la autorización", () => {
    const result = validateCustomer(EMPTY_CUSTOMER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["consent", "name", "neighborhood", "phone"]);
    expect(result.errors.name).toBe("Escribe tu nombre");
    expect(result.errors.phone).toBe("Escribe tu celular");
    expect(firstInvalidField(result.errors)).toBe("name");
  });

  it("sin la casilla no hay pedido, aunque el resto esté bien", () => {
    const result = validateCustomer({ ...valid, consent: false });
    expect(result).toEqual({ ok: false, errors: { consent: expect.any(String) } });
  });

  it("señala cada campo con su motivo", () => {
    const result = validateCustomer({
      name: "A",
      phone: "605 555 1234",
      neighborhood: "<script>",
      consent: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBe("Mínimo 2 caracteres");
    expect(result.errors.phone).toMatch(/celular colombiano/);
    expect(result.errors.neighborhood).toMatch(/solo admite/);
    expect(firstInvalidField(result.errors)).toBe("name");
  });

  it("admite tildes, apóstrofos y números de barrio", () => {
    const result = validateCustomer({
      ...valid,
      name: "María José O’Neill-Díaz",
      neighborhood: "Barrio 12 de Octubre, Mz. 4 #3",
    });
    expect(result.ok).toBe(true);
  });

  it("rechaza más de 80 caracteres", () => {
    const result = validateCustomer({ ...valid, name: "a".repeat(81) });
    expect(result.ok).toBe(false);
  });
});

describe("política de datos", () => {
  it("la versión vigente es un borrador mientras empiece por «borrador»", () => {
    expect(isDraftPolicy()).toBe(DATA_POLICY_VERSION.startsWith("borrador"));
    expect(isDraftPolicy("borrador-2026-11-20")).toBe(true);
    expect(isDraftPolicy("2027-01-15")).toBe(false);
  });
});
