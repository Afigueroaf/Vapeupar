import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { Product } from "@/types/product";
import { Button } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { formatNumberCO, formatPriceCOP } from "@/lib/utils";
import { waLink } from "@/lib/contact";

interface ProductCardProps {
  product: Product;
}

/**
 * Tarjeta de producto del sistema VP (fase V4).
 *
 * Decisiones que conviene no deshacer sin releer el inventario:
 *
 * - **El CTA es `secondary`, no `primary`.** La regla del sistema es un solo
 *   CTA primario por vista (`docs/design-reset-inventory.md` §11, regla 2) y el
 *   hero ya lo gasta. Nueve rellenos lima en el grid anularían el lima como
 *   señal de acción y competirían con el brillo lima del hover.
 * - **El nombre no cambia de color al hover.** La tarjeta todavía no es un
 *   enlace: `/producto/[slug]` llega en V8 (§5.6). Encender el título
 *   prometería un destino que no existe.
 * - **La imagen no hace `scale` al hover** (§8.1). La micro-interacción del
 *   conjunto la lleva `.vp-card`: borde lima, desplazamiento duro y el brillo
 *   que sigue al puntero.
 * - Los iconos `Check` / `XCircle` desaparecen: el estado se dice con color
 *   (lima disponible) y con etiqueta pixel (`AGOTADO`), no con decoración
 *   (§4.6). `MessageCircle` se conserva de forma provisional (§4.5).
 */
export function ProductCard({ product }: ProductCardProps) {
  const isAvailable = product.inStock && product.stock > 0;
  const isOnSale = Boolean(product.compareAtPrice && product.compareAtPrice > product.price);

  const buyHref = waLink(
    `Hola Vapeupar! Quiero pedir el producto: *${product.name}* (Precio: ${formatPriceCOP(product.price)}). ¿Tienen disponibilidad inmediata en Valledupar?`
  );

  const inquireHref = waLink(
    `Hola Vapeupar! Me interesa el producto agotado: *${product.name}*. ¿Cuándo les llega nuevo stock?`
  );

  const actionHref = isAvailable ? buyHref : inquireHref;

  // Ficha técnica como una línea de especificaciones, no como pills: el
  // separador lima hace de marca HUD y evita bordes de 2px alrededor de
  // fragmentos de 3 caracteres.
  const specs: { label: string; value: string }[] = [];
  if (product.specs.nicotineStrength && product.specs.nicotineStrength !== "N/A") {
    specs.push({ label: "Nicotina", value: product.specs.nicotineStrength });
  }
  if (product.specs.flavorProfile) {
    specs.push({ label: "Sabor", value: product.specs.flavorProfile });
  }

  return (
    <Surface
      as="article"
      aria-label={`${product.brand} ${product.name}`}
      className="vp-card flex flex-col overflow-hidden p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PixelLabel variant="outline">{product.brand}</PixelLabel>

        <div className="flex flex-wrap items-center gap-2">
          {product.specs.puffCount && (
            <PixelLabel variant="violet">
              {formatNumberCO(product.specs.puffCount)} Puffs
            </PixelLabel>
          )}

          {product.isBestSeller && <PixelLabel variant="lime">Top Ventas</PixelLabel>}
        </div>
      </div>

      <div className="relative mt-5 aspect-square w-full overflow-hidden border-2 border-muted bg-background rounded-vp">
        <Image
          src={product.imageUrl}
          alt={`${product.name} - ${product.brand} (${product.specs.flavorProfile || product.category})`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover object-center"
          loading="lazy"
        />

        {isOnSale && (
          <PixelLabel variant="lime" className="absolute left-3 top-3">
            Oferta
          </PixelLabel>
        )}
      </div>

      <h3 className="mt-5 text-xl font-bold uppercase leading-tight line-clamp-2 sm:text-[1.375rem]">
        {product.name}
      </h3>

      <p className="mt-2 text-base leading-relaxed text-muted line-clamp-2">
        {product.shortDescription}
      </p>

      {specs.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          {specs.map((spec, index) => (
            <span key={spec.label}>
              {index > 0 && (
                <span className="text-action" aria-hidden="true">
                  {" · "}
                </span>
              )}
              {spec.label} <span className="font-semibold text-foreground">{spec.value}</span>
            </span>
          ))}
        </p>
      )}

      {/* `mt-auto` fija el bloque de precio y acción al pie, de modo que las
          tarjetas de una misma fila alinean sus botones aunque el nombre o la
          descripción ocupen distinto número de líneas. */}
      <div className="mt-auto border-t-2 border-muted pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-2xl font-bold sm:text-[1.75rem]">
            {formatPriceCOP(product.price)}
            {product.compareAtPrice && (
              <span className="ml-2 text-base font-normal text-muted line-through">
                {formatPriceCOP(product.compareAtPrice)}
              </span>
            )}
          </p>

          {isAvailable ? (
            <span className="text-sm font-semibold text-action">
              {formatNumberCO(product.stock)} disponibles
            </span>
          ) : (
            <PixelLabel variant="outline">Agotado</PixelLabel>
          )}
        </div>

        {actionHref && (
          <Button
            variant="secondary"
            href={actionHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={
              isAvailable
                ? `Pedir por WhatsApp ${product.name}`
                : `Consultar reposición de ${product.name}`
            }
            className={isAvailable ? "mt-4 w-full" : "mt-4 w-full border-muted text-muted"}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            {isAvailable ? "Pedir por WhatsApp" : "Consultar reposición"}
          </Button>
        )}
      </div>
    </Surface>
  );
}
