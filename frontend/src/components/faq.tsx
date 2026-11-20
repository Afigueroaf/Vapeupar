"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@/components/ui/icons";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

import { withLegalFaqItem, type FaqContent } from "@/lib/content/schemas";

/**
 * Acordeón de preguntas frecuentes del sistema VP (fase V6).
 *
 * Tres cosas que cambian respecto a la versión del lienzo
 * (`docs/design-reset-inventory.md` §9.3):
 *
 * 1. **El panel ya no se desmonta al cerrar.** Antes desaparecía del DOM, así
 *    que no se podía animar ni encontrar con Ctrl+F. Ahora se colapsa con el
 *    truco de `grid-template-rows: 0fr → 1fr`, que es lo único que permite
 *    animar hasta una altura automática sin medir con JS. Donde el motor no
 *    sepa interpolar `fr` (Safari anterior a 17.4), abre y cierra de golpe:
 *    se degrada, no se rompe.
 * 2. **Marcado semántico**: cada pregunta es un `<h3>` que contiene el botón,
 *    y cada respuesta es una `region` etiquetada por ese botón
 *    (`aria-controls` / `aria-labelledby`). Se eligió el patrón de acordeón de
 *    ARIA APG en vez de `<dl>` porque es el que los lectores de pantalla
 *    anuncian de forma consistente, y porque mete las preguntas en el índice
 *    de encabezados de la página.
 * 3. **Composición asimétrica**: el encabezado a la izquierda y el acordeón a
 *    la derecha. El `max-w-4xl` centrado quedaba descolgado del resto de la
 *    página ahora que las secciones usan el armazón completo `max-w-vp`; esto
 *    llena el ancho sin alargar la línea de lectura.
 *
 * El texto llega por props desde `app/page.tsx`, que lo lee de la API de
 * contenido (A7.2) con el marcador de marcas aliadas ya sustituido (A7.4).
 * Este componente es de cliente por el acordeón y no puede pedirlo él.
 *
 * La pregunta legal +18 no llega por props: la inserta aquí
 * `withLegalFaqItem`, siempre en la misma posición, para que ninguna
 * publicación desde la consola pueda quitarla. La vista previa de
 * `/admin/content` usa este mismo componente.
 */
export function FAQ({
  content,
  preview = false,
}: {
  content: FaqContent;
  /**
   * Vista previa de la consola: sin el ancla `#faq` y con otros ids de
   * botón y panel, para no repetir los de la página.
   */
  preview?: boolean;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const items = withLegalFaqItem(content.items);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section
      id={preview ? undefined : "faq"}
      aria-label="Preguntas Frecuentes"
      className="vp-glitch border-t-2 border-line scroll-mt-20"
    >
      <div className="mx-auto grid max-w-vp gap-block px-inline py-section lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <PixelLabel variant="outline">[ FAQ ]</PixelLabel>

          <h2 className="mt-4 text-[1.75rem] font-bold uppercase leading-[0.95] tracking-[-0.01em] sm:text-[2.5rem]">
            {content.title}
          </h2>

          <p className="mt-3 text-base text-muted sm:text-[1.0625rem]">
            {content.intro}
          </p>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => {
            const isOpen = openIndex === index;
            const prefix = preview ? "faq-preview" : "faq";
            const buttonId = `${prefix}-button-${index}`;
            const panelId = `${prefix}-panel-${index}`;

            return (
              <Surface
                // Por índice: dos preguntas iguales desde la consola no deben
                // romper la reconciliación.
                key={index}
                border={isOpen ? "line" : "muted"}
                className="overflow-hidden transition-colors duration-150 ease-vp"
              >
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    onClick={() => toggle(index)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left font-display text-base font-bold transition-colors duration-150 ease-vp hover:text-action sm:text-[1.0625rem]"
                  >
                    <span>{item.question}</span>
                    <ChevronDownIcon
                      className={cn(
                        "size-5 shrink-0 text-action transition-transform duration-200 ease-vp",
                        isOpen && "rotate-180"
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </h3>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  // El panel colapsado no tiene nada enfocable, así que
                  // ocultarlo a las tecnologías de asistencia no deja contenido
                  // alcanzable por teclado fuera del árbol de accesibilidad.
                  aria-hidden={!isOpen}
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-vp",
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="border-t-2 border-muted px-5 pb-5 pt-4 text-base leading-relaxed text-muted">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </Surface>
            );
          })}
        </div>
      </div>
    </section>
  );
}
