import { describe, expect, it } from "vitest";
import { isRevalidateAuthorized } from "@/lib/revalidate-auth";

/**
 * Pruebas propias de la función. El backend conserva las suyas, que comprueban
 * el contrato entre los dos lados (cabecera que envía frente a la que se acepta).
 */
describe("isRevalidateAuthorized", () => {
  const secret = "s3cr3to-de-prueba";

  it("acepta el secreto exacto con el esquema Bearer", () => {
    expect(isRevalidateAuthorized(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("rechaza un secreto distinto, más corto o más largo", () => {
    expect(isRevalidateAuthorized("Bearer otro", secret)).toBe(false);
    expect(isRevalidateAuthorized(`Bearer ${secret.slice(0, -1)}`, secret)).toBe(false);
    expect(isRevalidateAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
  });

  it("rechaza sin cabecera o con otro esquema", () => {
    expect(isRevalidateAuthorized(null, secret)).toBe(false);
    expect(isRevalidateAuthorized(undefined, secret)).toBe(false);
    expect(isRevalidateAuthorized("", secret)).toBe(false);
    expect(isRevalidateAuthorized(secret, secret)).toBe(false);
    expect(isRevalidateAuthorized(`Basic ${secret}`, secret)).toBe(false);
    expect(isRevalidateAuthorized(`bearer ${secret}`, secret)).toBe(false);
    expect(isRevalidateAuthorized("Bearer ", secret)).toBe(false);
  });

  it("con el secreto vacío no autoriza nada", () => {
    expect(isRevalidateAuthorized("Bearer ", "")).toBe(false);
    expect(isRevalidateAuthorized("Bearer x", "")).toBe(false);
  });
});
