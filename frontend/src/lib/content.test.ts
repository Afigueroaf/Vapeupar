import { describe, expect, it } from "vitest";
import { formatBrandList, withPartnerBrands } from "@/lib/content";
import { PARTNER_BRANDS_TOKEN } from "@/lib/content/schemas";

describe("formatBrandList", () => {
  it("enumera 0, 1, 2 y 3 marcas en español", () => {
    expect(formatBrandList([])).toBe("");
    expect(formatBrandList(["Elf"])).toBe("Elf");
    expect(formatBrandList(["Elf", "Vuse"])).toBe("Elf y Vuse");
    expect(formatBrandList(["Elf", "Vuse", "Waka"])).toBe("Elf, Vuse y Waka");
  });
});

describe("withPartnerBrands", () => {
  const text = `Trabajamos con ${PARTNER_BRANDS_TOKEN}.`;

  it("sin marcador devuelve el texto tal cual", () => {
    expect(withPartnerBrands("Sin marcas.", ["Elf"])).toBe("Sin marcas.");
  });

  it("sustituye el marcador por la lista", () => {
    expect(withPartnerBrands(text, ["Elf", "Vuse"])).toBe("Trabajamos con Elf y Vuse.");
  });

  it("sustituye todas las apariciones", () => {
    expect(withPartnerBrands(`${PARTNER_BRANDS_TOKEN} / ${PARTNER_BRANDS_TOKEN}`, ["Elf"])).toBe(
      "Elf / Elf",
    );
  });

  it("sin lista o con lista vacía usa la fórmula genérica", () => {
    expect(withPartnerBrands(text, null)).toBe("Trabajamos con nuestras marcas aliadas.");
    expect(withPartnerBrands(text, [])).toBe("Trabajamos con nuestras marcas aliadas.");
  });
});
