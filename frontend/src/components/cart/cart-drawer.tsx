"use client";

import Image from "next/image";
import Link from "next/link";
import { CloseIcon, TrashIcon } from "@/components/ui/icons";
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Button, buttonStyles } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import {
  clearCart,
  removeLine,
  setCartOpen,
  setLineQuantity,
  useCart,
  useCartOpen,
  type CartLine,
} from "@/lib/cart";
import { waLink, whatsappNumber } from "@/lib/contact";
import { orderMessage, orderReference } from "@/lib/order-message";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { cn, formatPriceCOP } from "@/lib/utils";

/** Lo que tarda el cajón en entrar o salir. */
const SLIDE_MS = 420;

const TITLE_ID = "vp-carrito-titulo";

/** `true` solo en el cliente: el portal necesita `document`. */
function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Cajón del carrito.
 *
 * Panel lateral que entra desde la derecha, el patrón del «mini carrito» de
 * cualquier tienda: se abre desde el botón de la barra y, tras añadir algo,
 * desde la propia ficha, para que el cliente vea que el artículo entró sin
 * salir de donde estaba.
 *
 * VA EN UN PORTAL AL `body` porque la barra de navegación lleva `vp-glitch`, y
 * un `filter` en un ancestro se convierte en el bloque contenedor de sus
 * descendientes fijos: montado dentro de la barra, el cajón quedaría anclado a
 * ella y no a la pantalla. Es el mismo motivo por el que el botón de WhatsApp
 * va fuera de los bloques filtrados.
 *
 * Diálogo modal en lo que importa para el teclado: foco al abrir, foco
 * atrapado dentro, Escape cierra y al cerrar el foco vuelve a donde estaba.
 * La página de detrás no se desplaza (`useScrollLock`).
 */
export function CartDrawer() {
  const isClient = useIsClient();
  const open = useCartOpen();
  const { lines, count, subtotal } = useCart();

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  /** Referencia del último pedido enviado, para el aviso de confirmación. */
  const [sentRef, setSentRef] = useState<string | null>(null);

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    // Tras el primer fotograma: el panel pasa de `invisible` a visible en
    // este mismo cambio y un nodo invisible no acepta el foco.
    const frame = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      returnFocus.current?.focus({ preventScroll: true });
    };
  }, [open]);

  const close = () => {
    setCartOpen(false);
    setSentRef(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    // Foco atrapado: de la última pieza enfocable se vuelve a la primera.
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const canOrder = whatsappNumber !== null;

  const sendOrder = () => {
    const reference = orderReference();
    const href = waLink(orderMessage(lines, subtotal, reference));
    if (!href) return;
    window.open(href, "_blank", "noopener,noreferrer");
    setSentRef(reference);
  };

  if (!isClient) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[44] transition-[visibility] motion-reduce:transition-none",
        open ? "visible" : "invisible",
      )}
      style={{ transitionDuration: `${SLIDE_MS}ms` }}
      aria-hidden={!open}
    >
      {/* Velo. Pulsarlo cierra, como en cualquier cajón; no es un botón para
          el teclado porque ya están Escape y el botón de cerrar. */}
      <div
        onClick={close}
        style={{ transitionDuration: `${SLIDE_MS}ms` }}
        className={cn(
          "absolute inset-0 bg-background/75 transition-opacity ease-vp motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        inert={!open}
        onKeyDown={onKeyDown}
        style={{ transitionDuration: `${SLIDE_MS}ms` }}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l-2 border-line bg-background",
          "pb-[env(safe-area-inset-bottom)] transition-[translate] ease-vp-slide motion-reduce:transition-none",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-muted px-5 py-5">
          <div>
            <PixelLabel variant="outline">[ CARRITO ]</PixelLabel>
            <h2 id={TITLE_ID} className="mt-3 text-2xl font-bold uppercase leading-none">
              Tu pedido
            </h2>
            <p className="mt-2 text-sm text-muted" aria-live="polite">
              {count === 0
                ? "Sin productos"
                : `${count} ${count === 1 ? "unidad" : "unidades"}`}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Cerrar carrito"
            className="flex size-11 shrink-0 items-center justify-center rounded-vp border-2 border-muted transition-colors hover:border-line"
          >
            <CloseIcon className="size-5" aria-hidden="true" />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            {/* Sin tilde a propósito: Press Start 2P no garantiza el glifo. */}
            <PixelLabel variant="violet">[ VACIO ]</PixelLabel>
            <p className="mt-5 text-lg font-bold uppercase">Aún no hay nada aquí</p>
            <p className="mt-2 max-w-xs text-sm text-muted">
              Elige una línea del catálogo y el sabor que quieras.
            </p>
            <Link
              href="/#catalogo"
              onClick={close}
              className={buttonStyles("secondary", "mt-8")}
            >
              Ver catálogo
            </Link>
          </div>
        ) : (
          <>
            {/* `data-lenis-prevent`: sin él, Lenis se queda la rueda del ratón
                y la lista no se desplaza (ver `use-scroll-lock.ts`). */}
            <ul
              data-lenis-prevent=""
              className="flex-1 divide-y-2 divide-muted/40 overflow-y-auto overscroll-contain px-5"
            >
              {lines.map((line) => (
                <CartLineItem key={line.key} line={line} onNavigate={close} />
              ))}
            </ul>

            {/* Pie: total y acción */}
            <div className="border-t-2 border-line px-5 py-5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-semibold uppercase tracking-[0.04em] text-muted">
                  Subtotal
                </span>
                <span className="text-2xl font-bold">{formatPriceCOP(subtotal)}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted sm:text-sm">
                Pago contra entrega. La disponibilidad, el precio final y el valor del
                domicilio en Valledupar se confirman por WhatsApp antes de despachar.
              </p>

              {sentRef ? (
                <div className="mt-4 border-2 border-action p-3" role="status">
                  <p className="text-sm font-semibold">
                    Pedido <span className="text-action">{sentRef}</span> enviado a WhatsApp.
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Si no se abrió la conversación, vuelve a pulsar el botón.
                  </p>
                </div>
              ) : null}

              <Button
                variant="primary"
                onClick={sendOrder}
                disabled={!canOrder}
                className="mt-4 w-full"
              >
                Pedir por WhatsApp
              </Button>
              {!canOrder ? (
                <p className="mt-2 text-xs text-muted">
                  Los pedidos por WhatsApp no están disponibles en este momento.
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  clearCart();
                  setSentRef(null);
                }}
                className="mt-2 min-h-[44px] w-full text-sm font-semibold uppercase tracking-[0.04em] text-muted transition-colors hover:text-foreground"
              >
                Vaciar carrito
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function CartLineItem({ line, onNavigate }: { line: CartLine; onNavigate: () => void }) {
  const href = `/producto/${line.slug}${line.variantSlug ? `?sabor=${line.variantSlug}` : ""}`;
  const kind = line.variantKind === "color" ? "Color" : "Sabor";
  const atMax = line.quantity >= line.maxQuantity;

  return (
    <li className="flex gap-4 py-4">
      <div className="relative size-20 shrink-0 border-2 border-muted bg-surface">
        {line.imageUrl ? (
          <Image src={line.imageUrl} alt="" fill sizes="80px" className="object-contain p-1" />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={href}
              onClick={onNavigate}
              className="block truncate font-bold uppercase leading-tight hover:text-action"
            >
              {line.name}
            </Link>
            {line.variantName ? (
              <p className="mt-0.5 truncate text-sm text-muted">
                {kind}: <span className="text-foreground">{line.variantName}</span>
              </p>
            ) : null}
            <p className="mt-0.5 text-xs text-muted">{formatPriceCOP(line.price)} c/u</p>
          </div>
          <button
            type="button"
            onClick={() => removeLine(line.key)}
            aria-label={`Quitar ${line.name}${line.variantName ? `, ${line.variantName}` : ""}`}
            className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center text-muted transition-colors hover:text-foreground"
          >
            <TrashIcon className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <QuantityStepper
            value={line.quantity}
            max={line.maxQuantity}
            onChange={(next) => setLineQuantity(line.key, next)}
            label={`${line.name}${line.variantName ? ` ${line.variantName}` : ""}`}
            compact
          />
          <span className="font-bold">{formatPriceCOP(line.price * line.quantity)}</span>
        </div>
        {atMax ? (
          <p className="mt-1 text-xs text-muted">Máximo disponible para este pedido.</p>
        ) : null}
      </div>
    </li>
  );
}
