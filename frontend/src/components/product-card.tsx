import Image from "next/image";
import { MessageCircle, Zap, Shield, Check } from "lucide-react";
import { Product } from "@/types/product";
import { formatPriceCOP } from "@/lib/utils";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "573001234567";
  const message = encodeURIComponent(
    `Hola Vapeupar! Quiero pedir el producto: *${product.name}* (Precio: ${formatPriceCOP(product.price)}). ¿Tienen disponibilidad?`
  );

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-900/90 hover:shadow-xl hover:shadow-emerald-950/20">
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">
            {product.brand}
          </span>

          <div className="flex items-center gap-1.5">
            {product.specs.puffCount && (
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
                {product.specs.puffCount.toLocaleString()} Puffs
              </span>
            )}

            {product.isBestSeller && (
              <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-bold text-amber-400">
                Top Ventas
              </span>
            )}
          </div>
        </div>

        {/* Product Image */}
        <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-xl bg-zinc-950/80">
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />

          {product.compareAtPrice && product.compareAtPrice > product.price && (
            <span className="absolute top-2 left-2 rounded-md bg-red-500/90 px-1.5 py-0.5 text-[10px] font-black uppercase text-white shadow-sm">
              Oferta
            </span>
          )}
        </div>

        {/* Product Info */}
        <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
          {product.name}
        </h3>

        <p className="mt-1 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
          {product.shortDescription}
        </p>

        {/* Specific Specs */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300">
            Nicotina: <strong className="text-zinc-100">{product.specs.nicotineStrength}</strong>
          </span>

          {product.specs.flavorProfile && (
            <span className="rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300">
              Sabor: <strong className="text-zinc-100">{product.specs.flavorProfile}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Pricing and Action */}
      <div className="mt-5 border-t border-zinc-800/60 pt-4">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <span className="text-lg font-black text-white">
              {formatPriceCOP(product.price)}
            </span>
            {product.compareAtPrice && (
              <span className="ml-2 text-xs text-zinc-500 line-through">
                {formatPriceCOP(product.compareAtPrice)}
              </span>
            )}
          </div>

          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
            <Check className="size-3" />
            Disponible
          </span>
        </div>

        <a
          href={`https://wa.me/${whatsappNumber}?text=${message}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-[0.98]"
        >
          <MessageCircle className="size-4" />
          Pedir por WhatsApp
        </a>
      </div>
    </div>
  );
}
