"use client";

import { useState, useMemo, useEffect } from "react";
import { Product, ProductCategory } from "@/types/product";
import { ProductCard } from "./product-card";
import { Search, SlidersHorizontal, PackageSearch } from "lucide-react";

interface ProductCatalogProps {
  initialProducts: Product[];
}

const CATEGORIES: { id: ProductCategory | "all"; label: string; anchorId?: string }[] = [
  { id: "all", label: "Todos los Productos" },
  { id: "disposables", label: "Desechables (Puffs)", anchorId: "desechables" },
  { id: "pod-systems", label: "Pods Recargables", anchorId: "pods" },
  { id: "salt-nic", label: "Sales de Nicotina", anchorId: "liquidos" },
  { id: "freebase-liquids", label: "E-Líquidos Freebase" },
  { id: "mods-tanks", label: "Mods y Tanques" },
  { id: "coils-accessories", label: "Resistencias y Accesorios" }
];

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
    let result = initialProducts.filter(product => {
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
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 scroll-mt-20"
    >
      {/* Invisible anchor points for smooth navigation from header links */}
      <div id="desechables" className="scroll-mt-24" />
      <div id="pods" className="scroll-mt-24" />
      <div id="liquidos" className="scroll-mt-24" />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            Catálogo Oficial
          </span>
          <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Explora Nuestra Colección
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Mostrando {filteredProducts.length} producto{filteredProducts.length === 1 ? "" : "s"} disponibles para entrega en Valledupar
          </p>
        </div>

        {/* Search Input with accessible label */}
        <div className="relative w-full md:w-80">
          <label htmlFor="catalog-search" className="sr-only">
            Buscar productos por sabor, marca o caladas
          </label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-400" aria-hidden="true" />
          <input
            id="catalog-search"
            type="search"
            placeholder="Buscar por sabor, marca, puffs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-zinc-800 bg-zinc-900/80 py-2.5 pl-10 pr-4 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none transition"
          />
        </div>
      </div>

      {/* Category Filter Buttons */}
      <div 
        role="group" 
        aria-label="Filtro de categorías"
        className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-none"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            aria-pressed={selectedCategory === cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`whitespace-nowrap min-h-[40px] rounded-xl px-4 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
              selectedCategory === cat.id
                ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                : "border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-white"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Secondary Filters: Brand & Sorting */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-400 pt-3 border-t border-zinc-800/60">
        <div className="flex items-center gap-3">
          {brands.length > 2 && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="brand-select" className="text-zinc-400 flex items-center gap-1">
                <SlidersHorizontal className="size-3.5 text-zinc-500" aria-hidden="true" />
                Marca:
              </label>
              <select
                id="brand-select"
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="min-h-[36px] rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">Todas las marcas</option>
                {brands.filter(b => b !== "all").map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="sort-select" className="text-zinc-400">
            Ordenar por:
          </label>
          <select
            id="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="min-h-[36px] rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="featured">Destacados</option>
            <option value="price-asc">Menor precio</option>
            <option value="price-desc">Mayor precio</option>
            <option value="puffs">Más puffs (caladas)</option>
          </select>
        </div>
      </div>

      {/* Product Grid */}
      {filteredProducts.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-12 text-center">
          <PackageSearch className="size-12 text-zinc-600 mb-3" aria-hidden="true" />
          <h3 className="text-base font-bold text-white">No se encontraron productos</h3>
          <p className="mt-1 text-xs text-zinc-400 max-w-sm">
            Prueba ajustando los términos de búsqueda o seleccionando otra categoría en el menú superior.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("all");
              setSelectedBrand("all");
              setSearchQuery("");
              setSortBy("featured");
            }}
            className="mt-4 min-h-[40px] rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700"
          >
            Restablecer filtros
          </button>
        </div>
      )}
    </section>
  );
}
