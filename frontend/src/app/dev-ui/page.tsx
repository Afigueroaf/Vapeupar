import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { SelectField, TextField } from "@/components/ui/field";

/**
 * Banco de pruebas de las primitivas VP (fase V2).
 * Solo existe en desarrollo: en producción devuelve 404.
 * Sirve para verificar variantes, foco con teclado y contraste.
 */
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16 space-y-16">
      <header className="space-y-4">
        <PixelLabel variant="outline">[ DEV ONLY ]</PixelLabel>
        <h1 className="text-[2.5rem] sm:text-7xl font-bold leading-[0.95]">
          Primitivas VP
        </h1>
        <p className="text-base sm:text-[1.0625rem] text-muted max-w-xl">
          Fase V2 del plan de ejecución visual. Navega con Tab para verificar el foco.
        </p>
      </header>

      <section className="space-y-5">
        <h2 className="text-[1.75rem] sm:text-[2.5rem] font-bold">Etiquetas pixel</h2>
        <div className="flex flex-wrap items-center gap-4">
          <PixelLabel variant="lime">NEW DROP</PixelLabel>
          <PixelLabel variant="violet">LVL 01</PixelLabel>
          <PixelLabel variant="outline">[ SYSTEM ONLINE ]</PixelLabel>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-[1.75rem] sm:text-[2.5rem] font-bold">Botones</h2>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="primary">Explorar tienda ↗</Button>
          <Button variant="secondary">Ver colección</Button>
          <Button variant="ghost">Saber más</Button>
          <Button variant="primary" disabled>
            Agotado
          </Button>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-[1.75rem] sm:text-[2.5rem] font-bold">Superficies</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          <Surface className="p-5">
            <PixelLabel variant="lime">MUTED</PixelLabel>
            <p className="mt-3 text-base text-foreground">Borde por defecto.</p>
          </Surface>
          <Surface border="line" className="p-5">
            <PixelLabel variant="outline">LINE</PixelLabel>
            <p className="mt-3 text-base text-foreground">Borde estructural.</p>
          </Surface>
          <Surface border="accent" offset className="p-5">
            <PixelLabel variant="violet">ACCENT</PixelLabel>
            <p className="mt-3 text-base text-foreground">Con offset duro.</p>
          </Surface>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-[1.75rem] sm:text-[2.5rem] font-bold">Campos</h2>
        <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
          <div>
            <label htmlFor="dev-search" className="sr-only">
              Buscar
            </label>
            <TextField
              id="dev-search"
              type="search"
              placeholder="Buscar por sabor, marca..."
              icon={<Search className="size-4" aria-hidden="true" />}
            />
          </div>
          <div>
            <label htmlFor="dev-sort" className="sr-only">
              Ordenar
            </label>
            <SelectField id="dev-sort" defaultValue="featured">
              <option value="featured">Destacados</option>
              <option value="price-asc">Menor precio</option>
            </SelectField>
          </div>
        </div>
      </section>
    </main>
  );
}
