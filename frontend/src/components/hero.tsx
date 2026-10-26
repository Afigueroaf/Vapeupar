import { Button } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";
import { waLink } from "@/lib/contact";

export function Hero() {
  const advisorHref = waLink("Hola, necesito asesoría para elegir mi vape");

  return (
    <section
      aria-label="Bienvenida y propuesta de valor"
      className="border-b-2 border-line"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        {/* Columna de texto */}
        <div>
          <PixelLabel variant="outline">[ SYSTEM ONLINE ]</PixelLabel>

          <h1 className="mt-6 text-[2.5rem] font-bold uppercase leading-[0.92] tracking-[-0.01em] sm:text-7xl">
            Level up
            <br />
            your style.
          </h1>

          <p className="mt-6 max-w-md text-base leading-relaxed text-muted sm:text-[1.0625rem]">
            Dispositivos, accesorios y cultura digital en una sola frecuencia.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            {/* Único CTA primario de la vista */}
            <Button variant="primary" href="#catalogo">
              Explorar tienda ↗
            </Button>

            {advisorHref && (
              <Button
                variant="secondary"
                href={advisorHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                Hablar con un asesor
              </Button>
            )}
          </div>
        </div>

        {/*
          Espacio reservado para el render 3D del producto.
          Placeholder geométrico hasta que existan los assets: la decisión
          técnica del 3D (secuencia de imágenes vs. model-viewer vs. R3F)
          y su presupuesto de peso se tratan en una fase posterior.
          Ver `docs/design-reset-inventory.md` §7.5.
        */}
        <div
          aria-hidden="true"
          className="relative flex aspect-square w-full items-center justify-center border-2 border-accent rounded-vp"
        >
          <span className="font-display text-7xl font-bold text-accent sm:text-8xl">
            VP®
          </span>
          <PixelLabel variant="violet" className="absolute bottom-4 left-4">
            Render 3D
          </PixelLabel>
        </div>
      </div>
    </section>
  );
}
