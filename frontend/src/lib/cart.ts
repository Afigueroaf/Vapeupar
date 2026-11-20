"use client";

import { useSyncExternalStore } from "react";
import type { Product, ProductVariant, VariantKind } from "@/types/product";

/**
 * Carrito local del sitio público.
 *
 * QUÉ ES Y QUÉ NO. Es una lista de intención de compra que vive en el
 * navegador; el pedido se cierra por WhatsApp (ADR-001 §3: las pasarelas de
 * pago rechazan los productos con nicotina en Colombia). No reserva stock ni
 * crea nada en el backend: la tienda confirma disponibilidad y domicilio al
 * recibir el mensaje. Por eso no hay tabla de pedidos.
 *
 * POR QUÉ UN ALMACÉN EXTERNO Y NO UN CONTEXTO. El estado lo comparten piezas
 * que no tienen un padre común cómodo —la barra de navegación, la ficha de
 * producto y el cajón, que va en un portal—, y además tiene que sobrevivir a
 * recargar y sincronizarse entre pestañas. `localStorage` ya es una fuente
 * externa a React, y `useSyncExternalStore` es la forma en que React lee una:
 * en el servidor y durante la hidratación ve el carrito vacío
 * (`getServerSnapshot`), y justo después el real, sin desajuste de
 * hidratación.
 *
 * LO QUE SE GUARDA DE CADA LÍNEA: los identificadores, que son lo que cuenta,
 * y una copia de lo necesario para pintarla sin volver a la API (nombre,
 * sabor, precio, foto). El precio guardado es el que se vio al añadir; el que
 * vale es el que confirma la tienda, y así lo dice el cajón.
 */

const STORAGE_KEY = "vp-cart";

/**
 * Versión del formato guardado. Si cambia la forma de `CartLine`, se sube y el
 * carrito viejo se descarta en vez de leerse mal.
 */
const STORAGE_VERSION = 1;

/**
 * Tope por línea. Sin él, el límite sería el stock entero, y un pedido de 40
 * unidades de un desechable no es un pedido de mostrador: si hace falta, se
 * habla por WhatsApp.
 */
export const MAX_PER_LINE = 10;

/** Días que se conserva un carrito sin tocar. Un precio de hace un mes ya no dice nada. */
const MAX_AGE_DAYS = 30;

export interface CartLine {
  /** `productId:variantId` (o `productId:` si la línea no tiene variantes). */
  key: string;
  productId: string;
  variantId: string | null;
  slug: string;
  variantSlug: string | null;
  name: string;
  brand: string;
  variantName: string | null;
  variantKind: VariantKind | null;
  /** Precio unitario en COP al añadir. */
  price: number;
  imageUrl: string;
  quantity: number;
  /** Máximo pedible para esta línea: el menor entre el stock y `MAX_PER_LINE`. */
  maxQuantity: number;
}

interface CartState {
  lines: CartLine[];
  updatedAt: number;
}

const EMPTY: CartState = { lines: [], updatedAt: 0 };

let state: CartState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Lectura defensiva: lo que hay en `localStorage` lo puede haber escrito cualquiera. */
function read(): CartState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as { v?: number; lines?: unknown; updatedAt?: unknown };
    if (parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.lines)) return EMPTY;
    const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0;
    if (Date.now() - updatedAt > MAX_AGE_DAYS * 86_400_000) return EMPTY;
    const lines = parsed.lines.filter(
      (line): line is CartLine =>
        typeof line === "object" &&
        line !== null &&
        typeof (line as CartLine).key === "string" &&
        typeof (line as CartLine).name === "string" &&
        Number.isInteger((line as CartLine).quantity) &&
        (line as CartLine).quantity > 0 &&
        Number.isFinite((line as CartLine).price),
    );
    return { lines, updatedAt };
  } catch {
    // Almacenamiento denegado (modo privado estricto) o JSON roto.
    return EMPTY;
  }
}

function write(next: CartState) {
  state = next;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: STORAGE_VERSION, lines: next.lines, updatedAt: next.updatedAt }),
    );
  } catch {
    // Sin almacenamiento el carrito sigue vivo en memoria durante la visita.
  }
  emit();
}

function update(lines: CartLine[]) {
  write({ lines, updatedAt: Date.now() });
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  state = read();
  // Otra pestaña cambió el carrito: se adopta su versión.
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = read();
    emit();
  });
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): CartState {
  ensureLoaded();
  return state;
}

function getServerSnapshot(): CartState {
  return EMPTY;
}

export function lineKey(productId: string, variantId: string | null): string {
  return `${productId}:${variantId ?? ""}`;
}

/** Cuánto se puede pedir de una línea o variante. */
export function maxOrderable(product: Product, variant: ProductVariant | null): number {
  const stock = variant ? variant.stock : product.stock;
  return Math.max(0, Math.min(stock, MAX_PER_LINE));
}

/**
 * Añade unidades. Si la combinación ya está en el carrito, suma a la línea
 * existente en vez de duplicarla, sin pasar del máximo. Devuelve las unidades
 * que de verdad entraron, que pueden ser menos de las pedidas.
 */
export function addToCart(product: Product, variant: ProductVariant | null, quantity: number): number {
  ensureLoaded();
  const key = lineKey(product.id, variant?.id ?? null);
  const max = maxOrderable(product, variant);
  const existing = state.lines.find((line) => line.key === key);
  const current = existing?.quantity ?? 0;
  const next = Math.min(current + quantity, max);
  const added = next - current;
  if (added <= 0) return 0;

  const line: CartLine = {
    key,
    productId: product.id,
    variantId: variant?.id ?? null,
    slug: product.slug,
    variantSlug: variant?.slug ?? null,
    name: product.name,
    brand: product.brand,
    variantName: variant?.name ?? null,
    variantKind: variant?.kind ?? null,
    // Se refresca con cada adición: lo último que se vio es lo más fiable.
    price: product.price,
    imageUrl: variant?.imageUrl || product.imageUrl,
    quantity: next,
    maxQuantity: max,
  };

  update(
    existing
      ? state.lines.map((l) => (l.key === key ? line : l))
      : [...state.lines, line],
  );
  return added;
}

export function setLineQuantity(key: string, quantity: number) {
  ensureLoaded();
  if (quantity <= 0) return removeLine(key);
  update(
    state.lines.map((line) =>
      line.key === key ? { ...line, quantity: Math.min(quantity, line.maxQuantity) } : line,
    ),
  );
}

/**
 * Baja el máximo de una línea al disponible que dio el servidor al registrar
 * el pedido (`409 UNAVAILABLE`), y la cantidad con él. Con 0, la quita.
 */
export function limitLine(key: string, max: number) {
  ensureLoaded();
  const limit = Math.min(Math.max(0, Math.floor(max)), MAX_PER_LINE);
  if (limit === 0) return removeLine(key);
  update(
    state.lines.map((line) =>
      line.key === key
        ? { ...line, maxQuantity: limit, quantity: Math.min(line.quantity, limit) }
        : line,
    ),
  );
}

export function removeLine(key: string) {
  ensureLoaded();
  update(state.lines.filter((line) => line.key !== key));
}

export function clearCart() {
  ensureLoaded();
  update([]);
}

export interface CartView {
  lines: CartLine[];
  /** Unidades, no líneas: es lo que dice el contador de la barra. */
  count: number;
  subtotal: number;
}

/** Lectura memoizada por instantánea: misma instantánea, mismo objeto. */
let lastState: CartState | null = null;
let lastView: CartView = { lines: [], count: 0, subtotal: 0 };

function toView(current: CartState): CartView {
  if (current === lastState) return lastView;
  lastState = current;
  lastView = {
    lines: current.lines,
    count: current.lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: current.lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
  };
  return lastView;
}

export function useCart(): CartView {
  return toView(useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot));
}

/* ---------------------------------------------------------------------------
   Apertura del cajón

   Estado aparte del carrito, en memoria y sin persistir: lo abren el botón de
   la barra y la ficha de producto tras añadir, y lo cierra el propio cajón.
   ------------------------------------------------------------------------- */

let drawerOpen = false;
const drawerListeners = new Set<() => void>();

export function setCartOpen(open: boolean) {
  if (drawerOpen === open) return;
  drawerOpen = open;
  for (const listener of drawerListeners) listener();
}

export function useCartOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      drawerListeners.add(listener);
      return () => drawerListeners.delete(listener);
    },
    () => drawerOpen,
    () => false,
  );
}
