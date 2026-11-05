"use client";

import { useState, useMemo, useEffect } from "react";
import { Search } from "lucide-react";
import { Product, ProductCategory } from "@/types/product";
import { ProductCard } from "./product-card";
import { Button } from "./ui/button";
import { CardField } from "./ui/card-field";
import { SelectField, TextField } from "./ui/field";
import { PixelLabel } from "./ui/pixel-label";
import { Surface } from "./ui/surface";
import { cn } from "@/lib/utils";

interface ProductCatalogProps {
  initialProducts: Product[];
}

const CATEGORIES: { id: ProductCategory | "all"; label: string; anchorId?: string }[] = [
  { id: "all", label: "Todos" },
  { id: "disposables", label: "Desechables", anchorId: "desechables" },
  { id: "pod-systems", label: "Pods recargables", anchorId: "pods" },
  { id: "salt-nic", label: "Sales de nicotina", anchorId: "liquidos" },
  { id: "freebase-liquids", label: "Freebase" },
  { id: "mods-tanks", label: "Mods y tanques" },
  { id: "coils-accessories", label: "Resistencias" }
];

/**
 * Filtro de categoría. No usa `ui/button.tsx` porque un conmutador no es un
 * botón de acción: su estado activo es relleno lima permanente, que en
 * `Button` está reservado a la variante `primary` y a un solo uso por vista
 * (`docs/design-reset-inventory.md` §11, regla 2).
 */
const CHIP_BASE =
  "min-h-[44px] rounded-vp border-2 px-4 font-display text-[0.9375rem] font-semibold " +
  "uppercase tracking-[0.02em] whitespace-nowrap transition-colors duration-150 ease-vp";

const CHIP_ACTIVE = "bg-action text-action-ink border-action";

const CHIP_IDLE = "bg-transparent text-muted border-muted hover:border-line hover:text-foreground";

export function ProductCatalog({ initialProducts }: ProductCatalogProps) {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"featured" | "price-asc" | "price-desc" | "puffs">("featured");

  // Listen to hash change from navbar links (e.g. #desechables, #pods, #liquidos)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "desechables") setSelectedCategory("disposables");
      else if (hash === "pods") setSelectedCategory("pod-systems");
      else if (hash === "liquidos") setSelectedCategory("salt-nic");
      else if (hash === "catalogo") setSelectedCategory("all");
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const brands = useMemo(() => {
    const list = Array.from(new Set(initialProducts.map(p => p.brand)));
    return ["all", ...list];
  }, [initialProducts]);

  const filteredProducts = useMemo(() => {
    const result = initialProducts.filter(product => {
      // Category match
      if (selectedCategory !== "all" && product.category !== selectedCategory) {
        return false;
      }
      // Brand match
      if (selectedBrand !== "all" && product.brand !== selectedBrand) {
        return false;
      }
      // Search match
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchesName = product.name.toLowerCase().includes(q);
        const matchesBrand = product.brand.toLowerCase().includes(q);
        const matchesFlavor = product.specs.flavorProfile?.toLowerCase().includes(q);
        const matchesTag = product.tags.some(t => t.toLowerCase().includes(q));
        if (!matchesName && !matchesBrand && !matchesFlavor && !matchesTag) {
          return false;
        }
      }
      return true;
    });

    // Sorting
    if (sortBy === "price-asc") {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-desc") {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === "puffs") {
      result.sort((a, b) => (b.specs.puffCount ?? 0) - (a.specs.puffCount ?? 0));
    }

    return result;
  }, [initialProducts, selectedCategory, selectedBrand, searchQuery, sortBy]);

  return (
    <section
      id="catalogo"
      aria-label="Catálogo de productos"
      className="mx-auto max-w-vp px-4 py-16 sm:px-6 xl:px-10 scroll-mt-20"
    >
      {/* Invisible anchor points for smooth navigation from header links */}
      <div id="desechables" className="scroll-mt-24" />
      <div id="pods" className="scroll-mt-24" />
      <div id="liquidos" className="scroll-mt-24" />

      <div className="vp-glitch flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <PixelLabel variant="outline">[ CATALOGO ]</PixelLabel>

          <h2 className="mt-4 text-[1.75rem] font-bold uppercase leading-[0.95] tracking-[-0.01em] sm:text-[2.5rem]">
            Explora la colección
          </h2>

          <p className="mt-3 text-base text-muted sm:text-[1.0625rem]">
            <span className="font-bold text-action">{filteredProducts.length}</span>{" "}
            producto{filteredProducts.length === 1 ? "" : "s"} con entrega en Valledupar
          </p>
        </div>

        <div className="w-full md:w-80">
          <label htmlFor="catalog-search" className="sr-only">
            Buscar productos por sabor, marca o caladas
          </label>
          <TextField
            id="catalog-search"
            type="search"
            placeholder="Buscar sabor, marca, puffs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className="size-4" aria-hidden="true" />}
          />
        </div>
      </div>

      {/* Conmutador de categoría. Envuelve en vez de desplazarse en
          horizontal: el scroll lateral esconde las últimas categorías sin
          ninguna señal de que están ahí. */}
      <div
        id="colecciones"
        role="group"
        aria-label="Filtro de categorías"
        className="vp-glitch mt-10 flex flex-wrap gap-3 scroll-mt-24"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            aria-pressed={selectedCategory === cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={cn(CHIP_BASE, selectedCategory === cat.id ? CHIP_ACTIVE : CHIP_IDLE)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/*
        Fila de filtros.

        EN MÓVIL SE APILA Y LOS CONTROLES LLENAN EL ANCHO. Antes era una fila
        envolvente con los dos selectores a ancho fijo de escritorio (192px y
        208px): sobre los 328px útiles de un teléfono de 360px no cabían juntos,
        así que caían a dos líneas y, como el grupo de orden lleva `ml-auto`,
        uno quedaba pegado a la izquierda y el otro a la derecha. El buscador de
        arriba ya se había hecho responsive (`w-full md:w-80`) y estos dos se
        quedaron atrás.

        El `ml-auto` pasa a `sm:ml-auto`: en columna no tiene nada que empujar y
        solo servía para desalinear.
      */}
      <div className="vp-glitch mt-6 flex flex-col gap-4 border-t-2 border-muted pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {brands.length > 2 && (
          <div className="flex items-center gap-3">
            {/* `shrink-0`: en la fila de móvil el selector se lleva el espacio
                sobrante y la etiqueta no debe partirse para dárselo. */}
            <label htmlFor="brand-select" className="shrink-0 text-[0.9375rem] text-muted">
              Marca
            </label>
            <div className="flex-1 sm:w-48 sm:flex-none">
              <SelectField
                id="brand-select"
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
              >
                <option value="all">Todas</option>
                {brands.filter(b => b !== "all").map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </SelectField>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 sm:ml-auto">
          <label htmlFor="sort-select" className="shrink-0 text-[0.9375rem] text-muted">
            Ordenar
          </label>
          <div className="flex-1 sm:w-52 sm:flex-none">
            <SelectField
              id="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            >
              <option value="featured">Destacados</option>
              <option value="price-asc">Menor precio</option>
              <option value="price-desc">Mayor precio</option>
              <option value="puffs">Más caladas</option>
            </SelectField>
          </div>
        </div>
      </div>

      {filteredProducts.length > 0 ? (
        <CardField
          // El array entero, no su longitud: ordenar o cambiar a otro filtro
          // con el mismo número de tarjetas también las mueve de sitio.
          watch={filteredProducts}
          // 2 columnas en móvil y 4 en escritorio, con un paso de 3 en tablet
          // para no saltar de 2 tarjetas anchas a 4 estrechas de golpe.
          // El `gap` baja a 12px en móvil: con 2 columnas sobre 328px útiles,
          // cada 12px de hueco son 6px que se le quitan a cada tarjeta.
          // `product-card.tsx` entra en modo compacto por debajo de `sm` para
          // acompañar este ancho.
          className="mt-10 grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-4"
        >
          {filteredProducts.map((product, index) => (
            <ProductCard key={product.id} product={product} eagerImage={index === 0} />
          ))}
        </CardField>
      ) : (
        <Surface className="vp-glitch mt-12 flex flex-col items-center p-12 text-center">
          {/* Sin tilde ni eñe a propósito: Press Start 2P no garantiza esos
              glifos, y una etiqueta mal escrita es peor que una neutra. */}
          <PixelLabel variant="violet">[ 0 RESULTADOS ]</PixelLabel>

          <h3 className="mt-6 text-xl font-bold uppercase leading-tight sm:text-[1.375rem]">
            Nada en esta frecuencia
          </h3>

          <p className="mt-3 max-w-sm text-base text-muted">
            Ajusta la búsqueda o cambia de categoría. Si buscas algo que no está en el
            catálogo, lo conseguimos.
          </p>

          <Button
            variant="secondary"
            className="mt-8"
            onClick={() => {
              setSelectedCategory("all");
              setSelectedBrand("all");
              setSearchQuery("");
              setSortBy("featured");
            }}
          >
            Restablecer filtros
          </Button>
        </Surface>
      )}
    </section>
  );
}
