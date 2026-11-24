import { describe, expect, it } from "vitest";
import { holdForScroll, SCROLL_QUIET_MS } from "@/lib/glitch-scroll";

const LEAD = 120;
const next = () => 6000;

describe("holdForScroll", () => {
  it("sin scroll reciente no toca nada", () => {
    const state = { burstAt: 10_000, burstStart: -1 };
    expect(holdForScroll(state, 9_950, 9_000, LEAD, next)).toBe(state);
  });

  it("aplaza la ráfaga que toca mientras se desplaza hasta el silencio", () => {
    const out = holdForScroll({ burstAt: 10_000, burstStart: -1 }, 9_900, 9_800, LEAD, next);
    expect(out).toEqual({ burstStart: -1, burstAt: 9_800 + SCROLL_QUIET_MS + LEAD });
  });

  it("no aplaza una ráfaga que aún queda lejos", () => {
    const state = { burstAt: 15_000, burstStart: -1 };
    expect(holdForScroll(state, 9_900, 9_800, LEAD, next)).toBe(state);
  });

  it("corta la ráfaga en curso si empieza el scroll y programa la siguiente", () => {
    const out = holdForScroll({ burstAt: 10_000, burstStart: 10_000 }, 10_200, 10_150, LEAD, next);
    expect(out).toEqual({ burstStart: -1, burstAt: 10_200 + 6000 });
  });

  it("al dejar de desplazarse, la ráfaga aplazada sale", () => {
    const state = { burstAt: 10_620, burstStart: -1 };
    expect(holdForScroll(state, 9_800 + SCROLL_QUIET_MS, 9_800, LEAD, next)).toBe(state);
  });
});
