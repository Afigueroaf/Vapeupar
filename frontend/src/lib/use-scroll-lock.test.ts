import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lockScroll } from "@/lib/use-scroll-lock";

type Style = Record<string, string>;

let style: Style;
let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  style = { position: "", top: "", left: "", right: "", width: "", overflow: "" };
  scrollTo = vi.fn();
  vi.stubGlobal("window", { scrollY: 120, scrollTo });
  vi.stubGlobal("document", { body: { style } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lockScroll", () => {
  it("fija el body compensando el desplazamiento actual", () => {
    const release = lockScroll();
    expect(style.position).toBe("fixed");
    expect(style.overflow).toBe("hidden");
    expect(style.top).toBe("-120px");
    release();
  });

  it("dos bloqueos solapados: solo el último restaura", () => {
    const first = lockScroll();
    const second = lockScroll();

    first();
    expect(style.position).toBe("fixed");
    expect(scrollTo).not.toHaveBeenCalled();

    second();
    expect(style.position).toBe("");
    expect(style.top).toBe("");
    expect(style.overflow).toBe("");
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 120);
  });

  it("liberar dos veces el mismo bloqueo no descuenta dos veces", () => {
    const first = lockScroll();
    const second = lockScroll();

    first();
    first();
    expect(style.position).toBe("fixed");

    second();
    expect(style.position).toBe("");
  });
});
