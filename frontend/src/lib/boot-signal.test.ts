import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { endBoot, inertSiblings, isBooting, startBoot, whenBootDone } from "@/lib/boot-signal";

type FakeEl = { inert: boolean; tagName: string };

let dataset: Record<string, string | undefined>;
let listeners: Map<string, Set<() => void>>;

beforeEach(() => {
  dataset = {};
  listeners = new Map();
  vi.stubGlobal("document", { documentElement: { dataset } });
  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
    dispatchEvent: (event: { type: string }) => {
      for (const fn of listeners.get(event.type) ?? []) fn();
      return true;
    },
  });
  vi.stubGlobal("Event", class {
    constructor(public type: string) {}
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("señal de arranque", () => {
  it("sin arranque en curso, whenBootDone avisa enseguida", () => {
    const done = vi.fn();
    whenBootDone(done);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("con arranque en curso, avisa al terminar y solo una vez", () => {
    startBoot();
    expect(isBooting()).toBe(true);

    const done = vi.fn();
    whenBootDone(done);
    expect(done).not.toHaveBeenCalled();

    endBoot();
    expect(isBooting()).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);

    endBoot();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("cancelar la espera evita el aviso", () => {
    startBoot();
    const done = vi.fn();
    const cancel = whenBootDone(done);
    cancel();
    endBoot();
    expect(done).not.toHaveBeenCalled();
  });
});

describe("inertSiblings", () => {
  it("vuelve inertes a los hermanos del overlay y restaura su valor previo", () => {
    const overlay: FakeEl = { inert: false, tagName: "DIV" };
    const page: FakeEl = { inert: false, tagName: "DIV" };
    const alreadyInert: FakeEl = { inert: true, tagName: "DIV" };
    const script: FakeEl = { inert: false, tagName: "SCRIPT" };
    const parent = { children: [overlay, page, alreadyInert, script] };

    const restore = inertSiblings(overlay as unknown as HTMLElement, parent as unknown as HTMLElement);
    expect(overlay.inert).toBe(false);
    expect(page.inert).toBe(true);
    expect(script.inert).toBe(false);

    restore();
    expect(page.inert).toBe(false);
    expect(alreadyInert.inert).toBe(true);
  });
});
