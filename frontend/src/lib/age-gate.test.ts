import { describe, expect, it } from "vitest";
import { VERIFICATION_KEY, VERIFICATION_TTL_MS, needsVerification } from "@/lib/age-gate";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

describe("needsVerification", () => {
  it("pregunta si no hay nada guardado", () => {
    expect(needsVerification(null, NOW)).toBe(true);
    expect(needsVerification("", NOW)).toBe(true);
  });

  it("pregunta si lo guardado no es un número", () => {
    expect(needsVerification("ayer", NOW)).toBe(true);
  });

  it("no pregunta a los 29 días", () => {
    expect(needsVerification(String(NOW - 29 * DAY), NOW)).toBe(false);
  });

  it("caduca a los 30 días exactos", () => {
    expect(needsVerification(String(NOW - 30 * DAY), NOW)).toBe(true);
    expect(needsVerification(String(NOW - 30 * DAY + 1), NOW)).toBe(false);
  });

  it("acepta una fecha futura (reloj adelantado al confirmar)", () => {
    expect(needsVerification(String(NOW + DAY), NOW)).toBe(false);
  });

  it("mantiene la clave y el TTL de 30 días", () => {
    expect(VERIFICATION_KEY).toBe("vapeupar_age_verified_at");
    expect(VERIFICATION_TTL_MS).toBe(30 * DAY);
  });
});
