"use client";

import Image from "next/image";
import { BagIcon, ChatIcon, ChevronDownIcon } from "@/components/ui/icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { addToCart, lineKey, maxOrderable, setCartOpen, useCart } from "@/lib/cart";
import { waLink } from "@/lib/contact";
import { cn, formatNumberCO, formatPriceCOP } from "@/lib/utils";
import type { Product, ProductVariant } from "@/types/product";

interface ProductDetailProps {
  product: Product;
  /** `?sabor=` de la URL, si llegó uno. */
  initialVariantSlug?: string;
}

/**
 * Sabor con el que abre la ficha.
 *
 * El de la URL si existe —es el enlace que alguien compartió—; si no, el
 * primero con stock, para que el botón de compra funcione sin tocar nada; y
 * si la línea está agotada entera, el primero, que al menos enseña uno.
 */
function initialVariant(product: Product, slug?: string): ProductVariant | null {
  return (
    product.variants.find((v) => v.slug === slug) ??
    product.variants.find((v) => v.inStock) ??
    product.variants[0] ??
    null
  );
}

/** Ficha técnica en prosa de tienda, con las unidades que ya traen los datos. */
function specRows(product: Product): { label: string; value: string }[] {
  const { specs } = product;
  const rows: { label: string; value: string }[] = [];
  if (specs.puffCount) rows.push({ label: "Caladas", value: `${formatNumberCO(specs.puffCount)} puffs` });
  if (specs.nicotineStrength && specs.nicotineStrength !== "N/A") {
    rows.push({ label: "Nicotina", value: specs.nicotineStrength });
  }
  if (specs.liquidCapacity) rows.push({ label: "Líquido", value: specs.liquidCapacity });
  if (specs.batteryCapacity) rows.push({ label: "Batería", value: specs.batteryCapacity });
  if (specs.resistance) rows.push({ label: "Resistencia", value: specs.resistance });
  if (specs.rechargeable !== undefined) {
    rows.push({ label: "Recargable", value: specs.rechargeable ? "Sí, USB-C" : "No" });
  }
  return rows;
}

/**
 * Cuerpo interactivo de la ficha de producto.
 *
 * Foto, datos de la línea y el selector de sabor con cantidad y botón de
 * compra. Es de cliente entero, y no solo el selector, porque la foto cambia
 * con el sabor elegido cuando la variante tiene la suya.
 *
 * LOS AGOTADOS SE VEN Y SE PUEDEN ELEGIR. Esconderlos haría creer que el
 * sabor no existe; mostrarlos deshabilitados impediría preguntar por él. Al
 * elegir uno agotado, el botón de compra se cambia por «Consultar por
 * WhatsApp», que es lo que se puede hacer con él.
 */
export function ProductDetail({ product, initialVariantSlug }: ProductDetailProps) {
  const [variant, setVariant] = useState<ProductVariant | null>(() =>
    initialVariant(product, initialVariantSlug),
  );
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const { lines } = useCart();

  const hasVariants = product.variants.length > 0;
  const kindLabel = variant?.kind === "color" ? "Color" : "Sabor";
  const available = hasVariants ? Boolean(variant?.inStock) : product.inStock && product.stock > 0;

  // Lo que ya está en el carrito cuenta contra el máximo: con 8 de 10 dentro,
  // aquí solo se pueden pedir 2 más.
  const inCart = lines.find((l) => l.key === lineKey(product.id, variant?.id ?? null))?.quantity ?? 0;
  const remaining = Math.max(0, maxOrderable(product, variant) - inCart);
  const clampedQuantity = Math.max(1, Math.min(quantity, Math.max(remaining, 1)));

  const inStockVariants = product.variants.filter((v) => v.inStock);
  const soldOutVariants = product.variants.filter((v) => !v.inStock);
  const [showSoldOut, setShowSoldOut] = useState(() => variant !== null && !variant.inStock);

  const renderOption = (option: ProductVariant) => {
    const selected = option.id === variant?.id;
    return (
      <label
        key={option.id}
        className={cn(
          "relative inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-vp border-2 px-4",
          "font-display text-[0.9375rem] font-semibold transition-colors duration-150 ease-vp",
          "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-action",
          selected
            ? "border-action bg-action text-action-ink"
            : option.inStock
              ? "border-muted text-foreground hover:border-line"
              : "border-muted/50 text-muted hover:border-muted",
        )}
      >
        <input
          type="radio"
          name={`variante-${product.id}`}
          value={option.slug}
          checked={selected}
          onChange={() => choose(option)}
          className="sr-only"
        />
        <span className={cn(!option.inStock && !selected && "line-through decoration-2")}>
          {option.name}
        </span>
        {!option.inStock ? <span className="sr-only">(agotado)</span> : null}
      </label>
    );
  };

  const isOnSale = Boolean(product.compareAtPrice && product.compareAtPrice > product.price);
  const image = variant?.imageUrl || product.imageUrl;
  const specs = specRows(product);

  const choose = (next: ProductVariant) => {
    setVariant(next);
    setQuantity(1);
    setNotice(null);
    // La URL sigue al sabor elegido, para que el enlace que se copie abra la
    // ficha con ese sabor. `replaceState` y no `pushState`: cambiar de sabor
    // no es navegar, y «atrás» tiene que volver al catálogo, no al sabor de
    // antes. Next integra el historial nativo con su enrutador.
    const url = new URL(window.location.href);
    url.searchParams.set("sabor", next.slug);
    window.history.replaceState(null, "", url);
  };

  const add = () => {
    const added = addToCart(product, variant, clampedQuantity);
    if (added === 0) {
      setNotice("Ya tienes en el carrito el máximo disponible de este producto.");
      return;
    }
    setNotice(null);
    setQuantity(1);
    // El cajón abierto es la confirmación: se ve la línea que acaba de entrar.
    setCartOpen(true);
  };

  const inquireHref = waLink(
    `Hola Vapeupar! Me interesa *${product.name}*${
      variant ? ` (${kindLabel.toLowerCase()} ${variant.name})` : ""
    }, que aparece agotado. ¿Cuándo les llega?`,
  );

  return (
    <div className="mt-4 grid gap-10 lg:grid-cols-2 lg:gap-16">
      {/* FOTO. `object-contain` como en la tarjeta: el producto viene
          recortado y un recorte le comería los bordes. */}
      <div className="relative aspect-square w-full border-2 border-muted bg-surface lg:sticky lg:top-28 lg:self-start">
        {image ? (
          <Image
            key={image}
            src={image}
            alt={`${product.name}${variant ? ` - ${variant.name}` : ""}`}
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain p-6 sm:p-10"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="vp-label text-muted">SIN IMAGEN</span>
          </div>
        )}
        {(isOnSale || product.isNewArrival) && (
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {isOnSale && <PixelLabel variant="lime">Oferta</PixelLabel>}
            {product.isNewArrival && <PixelLabel variant="violet" className="bg-background">New drop</PixelLabel>}
          </div>
        )}
      </div>

      {/* DATOS Y COMPRA */}
      <div>
        <PixelLabel variant="outline">{product.brand}</PixelLabel>
        <h1 className="mt-4 text-[2rem] font-bold uppercase leading-[0.95] tracking-[-0.01em] sm:text-[2.75rem]">
          {product.name}
        </h1>

        <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-3xl font-bold sm:text-[2.25rem]">{formatPriceCOP(product.price)}</span>
          {isOnSale && product.compareAtPrice ? (
            <span className="text-lg text-muted line-through">{formatPriceCOP(product.compareAtPrice)}</span>
          ) : null}
        </div>

        {product.shortDescription ? (
          <p className="mt-4 text-base text-muted sm:text-[1.0625rem]">{product.shortDescription}</p>
        ) : null}

        {/* SELECTOR DE SABOR. Radios nativos con el aspecto de los chips del
            catálogo: el teclado los recorre con las flechas sin código, y el
            lector de pantalla anuncia «Sabor, grupo, Mango, 2 de 6». */}
        {hasVariants ? (
          <fieldset className="mt-8">
            <legend className="flex w-full items-baseline justify-between gap-4">
              <span className="text-sm font-semibold uppercase tracking-[0.04em] text-muted">
                {kindLabel}
                {variant ? (
                  <>
                    : <span className="text-foreground">{variant.name}</span>
                  </>
                ) : null}
              </span>
              <span className="text-xs text-muted">
                {product.variants.filter((v) => v.inStock).length} de {product.variants.length} disponibles
              </span>
            </legend>

            {/*
              DISPONIBLES PRIMERO, AGOTADOS AGRUPADOS. Con el catálogo real
              una línea puede traer 23 sabores y solo 2 con stock: mezclados en
              el orden de la consola, los dos que se pueden comprar se perdían
              entre 21 tachados. Dentro de cada grupo se respeta ese orden.

              Los agotados van en un `<details>` plegado: siguen ahí para quien
              busca uno concreto y quiere preguntar por él, sin ocupar la
              ficha. Se abre solo si el sabor elegido es uno de ellos —un
              enlace compartido con `?sabor=` de un agotado—, porque un radio
              marcado dentro de un grupo cerrado no se vería.

              Si no hay NINGUNO disponible, no se pliega nada: la lista entera
              es de agotados y esconderla dejaría la ficha sin sabores.

              Todos los radios comparten `name`, estén en el grupo que estén,
              así que siguen siendo un solo grupo para el teclado y el lector
              de pantalla.
            */}
            {inStockVariants.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">{inStockVariants.map(renderOption)}</div>
            ) : null}

            {soldOutVariants.length > 0 && inStockVariants.length > 0 ? (
              <details
                open={showSoldOut}
                onToggle={(event) => setShowSoldOut(event.currentTarget.open)}
                className="group mt-4"
              >
                <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] text-muted transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronDownIcon
                    className="size-4 transition-transform duration-200 ease-vp group-open:rotate-180"
                    aria-hidden="true"
                  />
                  Agotados ({soldOutVariants.length})
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">{soldOutVariants.map(renderOption)}</div>
              </details>
            ) : null}

            {inStockVariants.length === 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">{soldOutVariants.map(renderOption)}</div>
            ) : null}
          </fieldset>
        ) : null}

        {/* COMPRA */}
        <div className="mt-8 border-t-2 border-muted pt-6">
          {available ? (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <QuantityStepper
                  value={clampedQuantity}
                  max={Math.max(remaining, 1)}
                  onChange={(next) => {
                    setQuantity(next);
                    setNotice(null);
                  }}
                  label={`${product.name}${variant ? ` ${variant.name}` : ""}`}
                />
                <span className="text-sm font-semibold text-action">
                  {formatNumberCO(variant ? variant.stock : product.stock)} disponibles
                </span>
              </div>

              <Button
                variant="primary"
                onClick={add}
                disabled={remaining === 0}
                className="mt-5 w-full sm:w-auto sm:min-w-72"
              >
                <BagIcon className="size-4" aria-hidden="true" />
                Agregar al carrito
              </Button>

              <p className="mt-3 min-h-5 text-sm text-muted" aria-live="polite">
                {remaining === 0
                  ? "Ya tienes en el carrito el máximo disponible de este producto."
                  : notice ?? (inCart > 0 ? `Tienes ${inCart} en el carrito.` : "")}
              </p>
            </>
          ) : (
            <>
              <PixelLabel variant="outline">Agotado</PixelLabel>
              <p className="mt-3 text-sm text-muted">
                {hasVariants
                  ? `Este ${kindLabel.toLowerCase()} no está disponible ahora mismo.`
                  : "Esta línea no está disponible ahora mismo."}{" "}
                Pregúntanos cuándo vuelve.
              </p>
              {inquireHref ? (
                <Button
                  variant="secondary"
                  href={inquireHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 w-full sm:w-auto"
                >
                  <ChatIcon className="size-4" aria-hidden="true" />
                  Consultar por WhatsApp
                </Button>
              ) : null}
            </>
          )}

          <ul className="mt-6 grid gap-2 text-sm text-muted">
            <li>
              <span className="text-action" aria-hidden="true">▸ </span>
              Pago contra entrega: efectivo, Nequi o Daviplata.
            </li>
            <li>
              <span className="text-action" aria-hidden="true">▸ </span>
              Domicilio en Valledupar; el valor se confirma por WhatsApp.
            </li>
            <li>
              <span className="text-action" aria-hidden="true">▸ </span>
              Productos 100% originales, verificables con código QR.
            </li>
          </ul>
        </div>

        {specs.length > 0 ? (
          <section aria-labelledby="ficha-tecnica" className="mt-block scroll-reveal reveal-scale">
            <h2 id="ficha-tecnica" className="text-sm font-semibold uppercase tracking-[0.04em] text-muted">
              Ficha técnica
            </h2>
            <dl className="mt-3 divide-y-2 divide-muted/40 border-y-2 border-muted/40">
              {specs.map((row) => (
                <div key={row.label} className="flex justify-between gap-4 py-3">
                  <dt className="text-muted">{row.label}</dt>
                  <dd className="text-right font-semibold">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {product.description ? (
          <section aria-labelledby="descripcion" className="mt-block scroll-reveal reveal-scale">
            <h2 id="descripcion" className="text-sm font-semibold uppercase tracking-[0.04em] text-muted">
              Descripción
            </h2>
            <p className="mt-3 whitespace-pre-line text-base leading-relaxed">{product.description}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
