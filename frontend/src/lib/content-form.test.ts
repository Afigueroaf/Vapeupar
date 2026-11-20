import { describe, expect, it } from "vitest";
import {
  apiFieldErrors,
  editableValue,
  itemsRangeAt,
  legalFaqSlot,
  maxLengthAt,
  moveItem,
  publishedMessage,
  removeItem,
  sameContent,
  truncateForPreview,
  validateContent,
} from "@/lib/content-form";
import {
  CONTENT_SCHEMAS,
  FAQ_DEFAULT,
  HERO_DEFAULT,
  LEGAL_FAQ_INDEX,
  LEGAL_FAQ_ITEM,
  PARTNER_BRANDS_TOKEN,
  withLegalFaqItem,
} from "@/lib/content/schemas";

describe("validateContent", () => {
  it("acepta los valores por defecto de todas las claves", () => {
    for (const key of Object.keys(CONTENT_SCHEMAS) as (keyof typeof CONTENT_SCHEMAS)[]) {
      expect(validateContent(key, CONTENT_SCHEMAS[key].defaults).errors, key).toEqual({});
    }
  });

  it("señala cada campo por su ruta, con el mensaje en español", () => {
    const { value, errors } = validateContent("hero", { label: "  ", tagline: "x".repeat(33) });
    expect(value).toBeNull();
    expect(errors).toEqual({ label: "No puede quedar vacío", tagline: "Máximo 32 caracteres" });
  });

  it("devuelve el valor recortado cuando es publicable", () => {
    expect(validateContent("hero", { label: " ONLINE ", tagline: "Hola " }).value).toEqual({
      label: "ONLINE",
      tagline: "Hola",
    });
  });

  it("señala dentro de las listas con el índice", () => {
    const items = [{ question: "", answer: "Sí." }];
    expect(validateContent("faq", { ...FAQ_DEFAULT, items }).errors).toEqual({
      "items.0.question": "No puede quedar vacío",
    });
    expect(validateContent("faq", { ...FAQ_DEFAULT, items: [] }).errors).toEqual({
      items: "Hace falta al menos uno",
    });
  });

  it("solo admite el marcador de marcas aliadas en la FAQ", () => {
    expect(validateContent("hero", { ...HERO_DEFAULT, tagline: `Con ${PARTNER_BRANDS_TOKEN}` }).errors).toEqual({
      tagline: `El marcador ${PARTNER_BRANDS_TOKEN} solo vale en la FAQ`,
    });
    const faq = { ...FAQ_DEFAULT, intro: `Somos aliados de ${PARTNER_BRANDS_TOKEN}.` };
    expect(validateContent("faq", faq).errors).toEqual({});
  });

  it("no cuenta la pregunta legal: se quita antes de validar", () => {
    const items = Array.from({ length: 11 }, (_, i) => ({ question: `¿P${i}?`, answer: "Sí." }));
    const conLegal = { ...FAQ_DEFAULT, items: [...items, LEGAL_FAQ_ITEM] };
    const resultado = validateContent("faq", conLegal);
    expect(resultado.errors).toEqual({});
    expect(resultado.value?.items).toHaveLength(11);
  });
});

describe("apiFieldErrors", () => {
  it("proyecta los campos del backend sobre las rutas del formulario", () => {
    expect(
      apiFieldErrors([
        { field: "value.items.2.answer", message: "demasiado largo" },
        { field: "value", message: "marcador" },
        { field: "otro", message: "ignorado" },
      ]),
    ).toEqual({ "items.2.answer": "demasiado largo", "": "marcador" });
    expect(apiFieldErrors(undefined)).toEqual({});
  });
});

describe("editableValue", () => {
  it("sin publicar, carga el texto por defecto", () => {
    expect(editableValue("hero", undefined)).toEqual({ value: HERO_DEFAULT, source: "default" });
  });

  it("una fila que ya no cumple el esquema cae al defecto y lo dice", () => {
    expect(editableValue("hero", { title: "viejo" })).toEqual({ value: HERO_DEFAULT, source: "invalid" });
  });

  it("una FAQ antigua con la pregunta legal la pierde al cargar", () => {
    const antigua = { ...FAQ_DEFAULT, items: withLegalFaqItem(FAQ_DEFAULT.items) };
    expect(editableValue("faq", antigua)).toEqual({ value: FAQ_DEFAULT, source: "published" });
  });
});

describe("sameContent", () => {
  it("compara lo que se publicaría, no los espacios", () => {
    expect(sameContent("hero", HERO_DEFAULT, { ...HERO_DEFAULT, tagline: ` ${HERO_DEFAULT.tagline} ` })).toBe(true);
    expect(sameContent("hero", HERO_DEFAULT, { ...HERO_DEFAULT, tagline: "Otro" })).toBe(false);
  });
});

describe("límites sacados del esquema", () => {
  it("máximos de texto, también dentro de listas y objetos", () => {
    expect(maxLengthAt("hero", ["tagline"])).toBe(32);
    expect(maxLengthAt("faq", ["items", 0, "answer"])).toBe(800);
    expect(maxLengthAt("seo", ["openGraph", "description"])).toBe(200);
    expect(maxLengthAt("seo", ["keywords", 3])).toBe(40);
  });

  it("listas: la FAQ deja 1–11 editables y la banda exactamente 3", () => {
    expect(itemsRangeAt("faq", ["items"])).toEqual({ min: 1, max: 11 });
    expect(itemsRangeAt("trust-band", ["items"])).toEqual({ min: 3, max: 3 });
    expect(itemsRangeAt("seo", ["keywords"])).toEqual({ min: 1, max: 20 });
    expect(itemsRangeAt("contact", ["hours"])).toEqual({ min: 1, max: 4 });
    expect(itemsRangeAt("contact", ["service"])).toEqual({ min: 1, max: 6 });
  });

  it("lanza si la ruta no tiene ese límite: un error de programación, no de datos", () => {
    expect(() => maxLengthAt("hero", ["inventado"])).toThrow();
  });
});

describe("listas", () => {
  it("mueve sin salirse y quita por índice", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(removeItem(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });
});

describe("pregunta legal en el editor", () => {
  it("la consola la pinta en el mismo hueco que el sitio", () => {
    const items = FAQ_DEFAULT.items;
    const slot = legalFaqSlot(items.length);
    expect(withLegalFaqItem(items)[slot]).toEqual(LEGAL_FAQ_ITEM);
    expect(slot).toBe(LEGAL_FAQ_INDEX);
    // Con menos preguntas que su posición, va al final.
    expect(legalFaqSlot(1)).toBe(1);
    expect(withLegalFaqItem(items.slice(0, 1))).toEqual([items[0], LEGAL_FAQ_ITEM]);
  });

  it("la portada por defecto sigue mostrando las mismas 5 preguntas en el mismo orden", () => {
    const portada = withLegalFaqItem(FAQ_DEFAULT.items).map((item) => item.question);
    expect(portada).toHaveLength(5);
    expect(portada[3]).toBe(LEGAL_FAQ_ITEM.question);
  });
});

describe("avisos", () => {
  it("recorta como un buscador", () => {
    expect(truncateForPreview("corto", 10)).toBe("corto");
    expect(truncateForPreview("una frase bastante larga", 10)).toBe("una frase…");
  });

  it("dice si ya se ve en el sitio o en ≤60 s", () => {
    expect(publishedMessage(true, 4)).toBe("Versión 4 publicada y visible en el sitio.");
    expect(publishedMessage(false, 4)).toBe("Versión 4 publicada. Se verá en el sitio en ≤60 s.");
    expect(publishedMessage(true, 5, 2)).toBe("Versión 2 restaurada como versión 5 y visible en el sitio.");
  });
});
