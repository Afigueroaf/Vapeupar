"use client";

import { useState, useMemo } from "react";
import { Product, ProductCategory } from "@/types/product";
import { ProductCard } from "./product-card";
import { Search, SlidersHorizontal, PackageSearch } from "lucide-react";

interface ProductCatalogProps {
  initialProducts: Product[];
}

const CATEGORIES: { id: ProductCategory | "all"; label: string }[] = [
  { id: "all", label: "Todos los Productos" },
  { id: "disposables", label: "Desechables (Puffs)" },
  { id: "pod-systems", label: "Pods Recargables" },
  { id: "salt-nic", label: "Sales de Nicotina" },
  { id: "freebase-liquids", label: "E-Líquidos Freebase" },
  { id: "coils-accessories", label: "Resistencias y Accesorios" }
];

export function ProductCatalog({ initialProducts }: ProductCatalogProps) {
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");

  const brands = useMemo(() => {
    const list = Array.from(new Set(initialProducts.map(p => p.brand)));
    return ["all", ...list];
  }, [initialProducts]);

  const filteredProducts = useMemo(() => {
    return initialProducts.filter(product => {
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
  }, [initialProducts, selectedCategory, selectedBrand, searchQuery]);

  return (
    <section id="catalogo" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            Catálogo Oficial
          </span>
          <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Explora Nuestra Colección
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Mostrando {filteredProducts.length} producto{filteredProducts.length === 1 ? "" : "s"} disponibles para entrega
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por sabor, marca, puffs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 py-2.5 pl-10 pr-4 text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none transition"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold transition ${
              selectedCategory === cat.id
                ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                : "border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-white"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Filter by brand */}
      {brands.length > 2 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
          <SlidersHorizontal className="size-3.5 text-zinc-500" />
          <span>Marca:</span>
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="all">Todas las marcas</option>
            {brands.filter(b => b !== "all").map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      )}

      {/* Product Grid */}
      {filteredProducts.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-12 text-center">
          <PackageSearch className="size-12 text-zinc-600 mb-3" />
          <h3 className="text-base font-bold text-white">No se encontraron productos</h3>
          <p className="mt-1 text-xs text-zinc-400 max-w-sm">
            Prueba ajustando los términos de búsqueda o seleccionando otra categoría en el menú superior.
          </p>
          <button
            onClick={() => {
              setSelectedCategory("all");
              setSelectedBrand("all");
              setSearchQuery("");
            }}
            className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700"
          >
            Restablecer filtros
          </button>
        </div>
      )}
    </section>
  );
}
