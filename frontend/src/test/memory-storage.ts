/**
 * `localStorage` en memoria para las pruebas que corren en entorno `node`.
 *
 * Sustituye a jsdom, que no se instala en este workspace (npm se quedaba
 * resolviendo sus dependencias). Implementa solo la parte de `Storage` que usa
 * el código: `getItem`, `setItem`, `removeItem` y `clear`.
 */
export class MemoryStorage {
  private items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
  }
}
