import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Pruebas del frontend: solo lógica pura de `src/lib`, sin React ni red.
 *
 * Entorno `node` para todo. No hay jsdom (npm se quedaba resolviendo sus
 * dependencias): lo que toca `localStorage` usa `src/test/memory-storage.ts`
 * con `vi.stubGlobal`. Sin plugins de React: aquí no se renderizan componentes.
 */
export default defineConfig({
  resolve: {
    // El mismo alias que `paths` en tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
