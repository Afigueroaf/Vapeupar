import { describe, expect, it } from "vitest";
import { LOGO_PATHS } from "@/components/boot/logo-paths";
import { bootFrame, drawDelay, ease, reducedFrame } from "@/lib/boot-timeline";

describe("ease", () => {
  it("va de 0 a 1 con forma de coseno y se recorta fuera de rango", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
  });
});

describe("drawDelay", () => {
  it("reparte el escalonado entre 0 y 400 ms", () => {
    expect(drawDelay(0, 5)).toBe(0);
    expect(drawDelay(4, 5)).toBe(400);
    expect(drawDelay(2, 5)).toBe(200);
    expect(drawDelay(0, 1)).toBe(0);
  });
});

describe("bootFrame", () => {
  it("empieza sin nada dibujado y con la pantalla opaca", () => {
    const frame = bootFrame(0, 5);
    expect(frame.draw).toEqual([0, 0, 0, 0, 0]);
    expect(frame.fill).toBe(0);
    expect(frame.screen).toBe(1);
    expect(frame.done).toBe(false);
  });

  it("termina todos los contornos antes de empezar el relleno", () => {
    const frame = bootFrame(2600, 5);
    expect(frame.draw.every((value) => value === 1)).toBe(true);
    expect(frame.fill).toBe(0);
  });

  it("funde contornos en relleno entre 2700 y 3300 ms", () => {
    expect(bootFrame(3000, 5).fill).toBeCloseTo(0.5);
    expect(bootFrame(3300, 5).fill).toBe(1);
  });

  it("sostiene y luego desvanece la pantalla hasta 4000 ms", () => {
    expect(bootFrame(3400, 5).screen).toBe(1);
    expect(bootFrame(3750, 5).screen).toBeCloseTo(0.5);
    const end = bootFrame(4000, 5);
    expect(end.screen).toBe(0);
    expect(end.done).toBe(true);
  });
});

describe("reducedFrame", () => {
  it("muestra el logo quieto 600 ms y se funde en 400", () => {
    expect(reducedFrame(300).screen).toBe(1);
    expect(reducedFrame(800).screen).toBeCloseTo(0.5);
    expect(reducedFrame(800).done).toBe(false);
    expect(reducedFrame(1000).done).toBe(true);
  });
});

describe("LOGO_PATHS", () => {
  it("parte el logo en subtrazados absolutos", () => {
    expect(LOGO_PATHS.length).toBeGreaterThan(6);
    for (const path of LOGO_PATHS) expect(path.startsWith("M")).toBe(true);
  });
});
