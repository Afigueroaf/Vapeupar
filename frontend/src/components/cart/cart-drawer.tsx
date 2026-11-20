"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CloseIcon, TrashIcon } from "@/components/ui/icons";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Button, buttonStyles } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import {
  clearCart,
  limitLine,
  removeLine,
  setCartOpen,
  setLineQuantity,
  useCart,
  useCartOpen,
  type CartLine,
} from "@/lib/cart";
import { waLink, whatsappNumber } from "@/lib/contact";
import { orderMessage, orderReference, registeredOrderMessage } from "@/lib/order-message";
import {
  EMPTY_CUSTOMER,
  firstInvalidField,
  validateCustomer,
  type CustomerDraft,
  type CustomerErrors,
  type CustomerField,
} from "@/lib/order-form";
import {
  adjustmentsFor,
  bodyFingerprint,
  buildOrderBody,
  canRegister,
  isUncertain,
  nextSubmissionKey,
  offersWhatsAppOnly,
  registersOrders,
  submitWithRetry,
  type OrderOutcome,
  type SubmissionKeyState,
} from "@/lib/order-submit";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { cn, formatPriceCOP } from "@/lib/utils";

/** Lo que tarda el cajón en entrar o salir. */
const SLIDE_MS = 420;

const TITLE_ID = "vp-carrito-titulo";

/**
 * Pedidos registrados en el backend (ADR-003). Se lee al compilar: con la
 * variable apagada, el cajón se comporta exactamente como antes.
 */
const REGISTER_ORDERS = registersOrders();

/**
 * El formulario de datos solo se descarga si se va a usar: con los pedidos
 * apagados no entra en el JavaScript de ninguna página (el cajón va en todas).
 */
const CheckoutForm = dynamic(
  () => import("@/components/cart/checkout-form").then((module) => module.CheckoutForm),
  { ssr: false, loading: () => <p className="text-sm text-muted">Cargando…</p> },
);

/** Qué muestra el cuerpo del cajón. */
type View = "cart" | "details" | "sent";

/** El último pedido enviado a WhatsApp. */
interface SentOrder {
  reference: string;
  /** Enlace de WhatsApp, por si el navegador bloqueó la ventana. */
  href: string;
  /** Del servidor si se registró; el del carrito si no. */
  subtotal: number;
}

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
 *
 * DOS MODOS DE ENVÍO (`lib/order-submit.ts`). Con `NEXT_PUBLIC_ORDERS_ENABLED`
 * apagado —el valor por defecto— «Pedir por WhatsApp» hace lo de siempre:
 * referencia del navegador y WhatsApp, sin pedir datos. Encendido, abre la
 * vista de datos (nombre, celular, barrio y autorización), registra el pedido
 * con `POST /api/orders` y abre WhatsApp con la referencia del servidor (solo
 * con una política de datos ya revisada: `registersOrders`). Si la ruta no
 * existe (404) vuelve al modo de siempre; si el envío falla sin saber si se
 * guardó, reintenta con la misma clave y luego deja elegir entre reintentar y
 * mandarlo solo por WhatsApp.
 */
export function CartDrawer() {
  const isClient = useIsClient();
  const open = useCartOpen();
  const { lines, count, subtotal } = useCart();

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  /** El último pedido enviado, para el aviso o la pantalla de confirmación. */
  const [sent, setSent] = useState<SentOrder | null>(null);
  const [view, setView] = useState<View>("cart");

  // Datos del cliente: solo en memoria, nunca en `localStorage` (ver `lib/order-form.ts`).
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_CUSTOMER);
  const [errors, setErrors] = useState<CustomerErrors>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  /** Tras un 429 o un 400 sin arreglo en el formulario: se ofrece «solo por WhatsApp». */
  const [offerWhatsApp, setOfferWhatsApp] = useState(false);
  /** El envío falló sin saber si se guardó: el botón reintenta con la misma clave. */
  const [uncertain, setUncertain] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ field: CustomerField; seq: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Líneas que el servidor ajustó o quitó (`409 UNAVAILABLE`). */
  const [adjusted, setAdjusted] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const keyRef = useRef<SubmissionKeyState | null>(null);
  const viewHeadingRef = useRef<HTMLHeadingElement>(null);
  const adjustedRef = useRef<HTMLDivElement>(null);

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

  // Al cambiar de vista, el foco va a su título: quien usa lector de pantalla
  // sabe dónde está, y el teclado no se queda en un botón que ya no existe.
  useEffect(() => {
    if (!open || view === "cart") return;
    // Al título y no al primer campo: en el teléfono, enfocar un campo abre
    // el teclado y tapa el formulario antes de que se haya leído.
    const frame = requestAnimationFrame(() => viewHeadingRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, view]);

  const focusField = (field: CustomerField) =>
    setFocusRequest((current) => ({ field, seq: (current?.seq ?? 0) + 1 }));

  /**
   * Tras un envío correcto, la clave se olvida al salir de «enviado»: volver a
   * pedir después es un pedido nuevo, no la repetición del anterior.
   */
  const leaveSent = () => {
    if (view === "sent") keyRef.current = null;
  };

  const close = () => {
    leaveSent();
    setCartOpen(false);
    setSent(null);
    setView("cart");
    setAdjusted([]);
    setFormMessage(null);
    setOfferWhatsApp(false);
    setUncertain(false);
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
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  /**
   * El camino de siempre: referencia del navegador y WhatsApp, sin pedir datos.
   * Es el único con la variable apagada, y el de respaldo si el servidor no
   * registra el pedido.
   */
  const sendWhatsAppOnly = () => {
    const reference = orderReference();
    const href = waLink(orderMessage(lines, subtotal, reference));
    if (!href) return;
    window.open(href, "_blank", "noopener,noreferrer");
    setSent({ reference, href, subtotal });
    setView("cart");
    setFormMessage(null);
    setOfferWhatsApp(false);
    setUncertain(false);
  };

  const registers = REGISTER_ORDERS && canRegister(lines);

  const startOrder = () => {
    setSent(null);
    setAdjusted([]);
    if (!registers) {
      sendWhatsAppOnly();
      return;
    }
    setView("details");
  };

  const editDraft = (next: CustomerDraft) => {
    setDraft(next);
    // Otros datos son otro envío (otra clave): ya no hay nada incierto que reintentar.
    setUncertain(false);
    // El error de un campo se va en cuanto se toca; los demás se quedan.
    setErrors((current) => {
      const changed = (Object.keys(next) as (keyof CustomerDraft)[]).filter((field) => next[field] !== draft[field]);
      if (!changed.some((field) => current[field])) return current;
      const rest = { ...current };
      for (const field of changed) delete rest[field];
      return rest;
    });
  };

  const submitDetails = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setFormMessage(null);
    setOfferWhatsApp(false);
    setUncertain(false);

    // El carrito cambió (otra pestaña) y ya no se puede registrar: el camino de siempre.
    if (!canRegister(lines)) {
      sendWhatsAppOnly();
      return;
    }

    const checked = validateCustomer(draft);
    if (!checked.ok) {
      setErrors(checked.errors);
      const field = firstInvalidField(checked.errors);
      if (field) focusField(field);
      return;
    }
    setErrors({});

    // Misma huella, misma clave: un doble toque o un reintento devuelven el
    // mismo pedido. Otros datos u otro carrito estrenan clave.
    const unsigned = buildOrderBody(lines, checked.value, "");
    keyRef.current = nextSubmissionKey(keyRef.current, bodyFingerprint(unsigned));

    setSubmitting(true);
    // Un fallo incierto se reintenta una vez con la MISMA clave (`submitWithRetry`).
    let outcome: OrderOutcome = await submitWithRetry({ ...unsigned, submissionKey: keyRef.current.key });
    if (outcome.kind === "conflict") {
      // La clave ya se usó con otros datos (otra pestaña, un reintento cruzado): una nueva y otra vez.
      keyRef.current = nextSubmissionKey(null, bodyFingerprint(unsigned));
      outcome = await submitWithRetry({ ...unsigned, submissionKey: keyRef.current.key });
    }
    setSubmitting(false);

    if (isUncertain(outcome)) {
      // Pudo quedar guardado: abrir WhatsApp con otra referencia dejaría dos
      // pedidos distintos. El cliente decide; reintentar usa la misma clave.
      setUncertain(true);
      setOfferWhatsApp(true);
      setFormMessage(
        "No pudimos confirmar el registro de tu pedido. Reintenta (no se duplicará) o envíalo solo por WhatsApp.",
      );
      return;
    }

    switch (outcome.kind) {
      case "created": {
        const href = waLink(registeredOrderMessage(lines, outcome));
        if (!href) return;
        // Puede bloquearlo el navegador (ya no es el toque directo); la
        // pantalla de enviado lleva el mismo enlace.
        window.open(href, "_blank", "noopener,noreferrer");
        setSent({ reference: outcome.reference, href, subtotal: outcome.subtotal });
        setCopied(false);
        setView("sent");
        return;
      }
      case "unavailable": {
        const notes = adjustmentsFor(lines, outcome.lines).map((adjustment) => {
          const line = lines.find((l) => l.key === adjustment.key);
          limitLine(adjustment.key, adjustment.max);
          const label = line ? `${line.name}${line.variantName ? ` · ${line.variantName}` : ""}` : "Un producto";
          return `${label}: ${adjustment.message}`;
        });
        setAdjusted(notes.length > 0 ? notes : ["Algunos productos ya no están disponibles."]);
        setView("cart");
        requestAnimationFrame(() => adjustedRef.current?.focus({ preventScroll: false }));
        return;
      }
      case "rate-limited":
        setFormMessage(outcome.message);
        setOfferWhatsApp(true);
        return;
      case "invalid":
        setErrors(outcome.fields);
        setFormMessage(outcome.message);
        // Líneas repetidas, política cambiada…: nada que el cliente corrija aquí.
        setOfferWhatsApp(offersWhatsAppOnly(outcome));
        {
          const field = firstInvalidField(outcome.fields);
          if (field) focusField(field);
        }
        return;
      case "conflict":
        // Dos claves seguidas en conflicto: algo raro; el cliente decide.
        setFormMessage("No pudimos registrar el pedido. Vuelve a intentarlo o envíalo solo por WhatsApp.");
        setOfferWhatsApp(true);
        return;
      case "fallback":
        // 404: la ruta no existe y nada se guardó. Sale por WhatsApp como siempre.
        sendWhatsAppOnly();
        return;
    }
  };

  const copyReference = async () => {
    if (!sent) return;
    try {
      await navigator.clipboard.writeText(sent.reference);
      setCopied(true);
    } catch {
      setCopied(false);
    }
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

        {view === "sent" && sent ? (
          <OrderSent
            sent={sent}
            copied={copied}
            headingRef={viewHeadingRef}
            onCopy={copyReference}
            onBack={() => {
              leaveSent();
              setView("cart");
            }}
          />
        ) : lines.length === 0 ? (
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
        ) : view === "details" ? (
          <form noValidate onSubmit={submitDetails} className="flex min-h-0 flex-1 flex-col">
            <div
              data-lenis-prevent=""
              className="flex-1 overflow-y-auto overscroll-contain px-5 py-5"
            >
              <h3
                ref={viewHeadingRef}
                tabIndex={-1}
                className="text-lg font-bold uppercase leading-tight outline-none"
              >
                Tus datos para el pedido
              </h3>
              <div className="mt-4">
                <CheckoutForm
                  focusRequest={focusRequest}
                  idPrefix="vp-pedido"
                  draft={draft}
                  errors={errors}
                  disabled={submitting}
                  onChange={editDraft}
                />
              </div>
            </div>

            <div className="border-t-2 border-line px-5 py-5">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-semibold uppercase tracking-[0.04em] text-muted">
                  Subtotal
                </span>
                <span className="text-2xl font-bold">{formatPriceCOP(subtotal)}</span>
              </div>

              {formMessage ? (
                <p role="alert" className="mt-3 border-2 border-action p-3 text-sm">
                  {formMessage}
                </p>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                disabled={submitting || !canOrder}
                aria-busy={submitting}
                className="mt-4 w-full"
              >
                {submitting ? "Registrando…" : uncertain ? "Reintentar" : "Enviar pedido por WhatsApp"}
              </Button>
              {offerWhatsApp ? (
                <button
                  type="button"
                  onClick={sendWhatsAppOnly}
                  className="mt-2 min-h-[44px] w-full text-sm font-semibold uppercase tracking-[0.04em] text-foreground underline underline-offset-4"
                >
                  Enviar solo por WhatsApp
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setView("cart");
                  setFormMessage(null);
                  setOfferWhatsApp(false);
    setUncertain(false);
                }}
                disabled={submitting}
                className="mt-2 min-h-[44px] w-full text-sm font-semibold uppercase tracking-[0.04em] text-muted transition-colors hover:text-foreground disabled:opacity-40"
              >
                Volver al carrito
              </button>
            </div>
          </form>
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

              {adjusted.length > 0 ? (
                <div
                  ref={adjustedRef}
                  tabIndex={-1}
                  role="alert"
                  className="mt-4 border-2 border-action p-3 outline-none"
                >
                  <p className="text-sm font-semibold">Ajustamos tu pedido al disponible:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                    {adjusted.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted">Revísalo y vuelve a enviarlo.</p>
                </div>
              ) : null}

              {sent ? (
                <div className="mt-4 border-2 border-action p-3" role="status">
                  <p className="text-sm font-semibold">
                    Pedido <span className="text-action">{sent.reference}</span> enviado a WhatsApp.
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Si no se abrió la conversación, vuelve a pulsar el botón.
                  </p>
                </div>
              ) : null}

              <Button
                variant="primary"
                onClick={startOrder}
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
                  setSent(null);
                  setAdjusted([]);
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

/**
 * Pedido registrado: la referencia del servidor (con copiar), qué pasa ahora y
 * el enlace a WhatsApp por si el navegador bloqueó la ventana. El carrito se
 * conserva, como en el modo solo WhatsApp: volver a enviarlo con los mismos
 * datos devuelve el mismo pedido, no uno nuevo.
 */
function OrderSent({
  sent,
  copied,
  headingRef,
  onCopy,
  onBack,
}: {
  sent: SentOrder;
  copied: boolean;
  headingRef: React.Ref<HTMLHeadingElement>;
  onCopy: () => void;
  onBack: () => void;
}) {
  return (
    <div data-lenis-prevent="" className="flex-1 overflow-y-auto overscroll-contain px-5 py-6">
      <PixelLabel variant="lime">[ ENVIADO ]</PixelLabel>
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-xl font-bold uppercase leading-tight outline-none"
      >
        Pedido registrado
      </h3>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-2 border-line p-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.04em] text-muted">Tu referencia</p>
          <p className="font-display text-2xl font-bold tracking-[0.06em] text-action">{sent.reference}</p>
        </div>
        <Button variant="secondary" onClick={onCopy} className="px-4">
          {copied ? "Copiada" : "Copiar"}
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted" aria-live="polite">
        {copied ? "Referencia copiada." : `Subtotal: ${formatPriceCOP(sent.subtotal)} (sin domicilio).`}
      </p>

      <h4 className="mt-6 text-sm font-semibold uppercase tracking-[0.04em]">Qué pasa ahora</h4>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
        <li>Envía el mensaje que se abrió en WhatsApp: lleva tu referencia.</li>
        <li>Te confirmamos disponibilidad y el valor del domicilio en Valledupar.</li>
        <li>Pagas contra entrega.</li>
        <li>Al recibir, muestra tu cédula: solo vendemos a mayores de 18 años.</li>
      </ol>

      <Button
        href={sent.href}
        target="_blank"
        rel="noopener noreferrer"
        variant="primary"
        className="mt-6 w-full"
      >
        Abrir WhatsApp
      </Button>
      <p className="mt-2 text-xs text-muted">
        ¿No se abrió la conversación? Pulsa «Abrir WhatsApp», o escríbenos y dinos tu referencia.
      </p>

      <button
        type="button"
        onClick={onBack}
        className="mt-4 min-h-[44px] w-full text-sm font-semibold uppercase tracking-[0.04em] text-muted transition-colors hover:text-foreground"
      >
        Volver al carrito
      </button>
    </div>
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
