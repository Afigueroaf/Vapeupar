import Image from "next/image";
import { PixelLabel } from "@/components/ui/pixel-label";
import type { HeroContent } from "@/lib/content/schemas";

/**
 * Columna de texto de la intro: etiqueta, logotipo-titular y reclamo.
 *
 * Separada de `Hero` (que es async y lee la API) para que la vista previa de
 * `/admin/content` (A5.4) pinte exactamente el mismo marcado con el valor que
 * se está editando. Sin estado ni datos propios: sirve en servidor y cliente.
 */
export function HeroView({ content }: { content: HeroContent }) {
  return (
    <div>
      <PixelLabel variant="outline">[ {content.label} ]</PixelLabel>

      {/*
        El logotipo hace de titular. El `alt` es el que le da nombre
        accesible al `h1`: sin él la cabecera principal de la portada se
        quedaría muda para un lector de pantalla.

        El archivo de `public` es el de `assets/logo/logovupar_w.svg` sin el
        PNG de calco que Inkscape deja incrustado y oculto (`display:none`)
        dentro: 203 kB de los 208 del original. Es la misma limpieza que ya
        hizo falta con el logotipo anterior, así que conviene repetirla en
        cualquier SVG que llegue de Inkscape antes de meterlo en `public`.
      */}
      {/*
        Logotipo y reclamo comparten caja, y el ancho se decide aquí una
        sola vez. Es lo que permite centrar el reclamo **sobre el
        logotipo** y no sobre la columna: si cada uno midiera lo suyo, un
        `text-center` lo centraría respecto a la rejilla y quedaría
        desplazado.

        El tamaño se da por ancho y no por alto: el logotipo es muy
        apaisado (5,4:1) y, atado al alto, en un teléfono se saldría del
        margen lateral.

        A partir de `xl` la caja se sale de su columna de la rejilla —770px
        contra los ~704 que mide— porque ahí es donde el logotipo alcanza
        su tamaño objetivo. Cabe de sobra: termina mucho antes de donde
        empieza el vaporizador, y por debajo de ese punto de corte vuelve a
        ajustarse a la columna, que es lo que evita el desbordamiento
        lateral en pantallas intermedias.
      */}
      {/* El ancho sale de `--vp-lead` (globals.css) y no de un literal: la
          banda de confianza fija el mínimo de su columna con esa misma
          variable, y de ahí que sus tarjetas caigan bajo el vaporizador.
          Cambiar el valor aquí a mano desalinearía la banda en silencio. */}
      <div className="mt-6 w-full max-w-[var(--vp-lead)] xl:w-[var(--vp-lead)] xl:max-w-none">
        <h1>
          <Image
            src="/logo-completo-blanco.svg"
            alt="Vapeupar"
            width={2822}
            height={550}
            priority
            className="h-auto w-full"
          />
        </h1>

        {/* Reclamo en Press Start 2P. La clase `vp-label` es el único sitio
            autorizado para esa fuente, así que el reclamo la reutiliza en
            lugar de pedir la familia por su cuenta; `vp-label-lead` solo le
            sube el tamaño. En mayúsculas porque lo impone la clase. */}
        <p className="vp-label vp-label-lead mt-6 text-center text-action">
          {content.tagline}
        </p>
      </div>
    </div>
  );
}
