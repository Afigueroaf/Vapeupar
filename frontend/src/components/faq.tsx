"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: "¿Cómo funcionan las entregas a domicilio en Valledupar?",
    answer: "Realizamos envíos en moto express a cualquier barrio de Valledupar en un plazo promedio de 30 a 60 minutos desde la confirmación de tu pedido por WhatsApp. También realizamos despachos a municipios cercanos del Cesar y a nivel nacional."
  },
  {
    question: "¿Cuáles son los métodos de pago disponibles?",
    answer: "Aceptamos pago contra entrega (efectivo al recibir), transferencias por Nequi, Daviplata y Bancolombia a la Mano. No tienes que pagar nada por adelantado para domicilios locales si prefieres contra entrega."
  },
  {
    question: "¿Cómo sé que los vaporizadores son 100% originales?",
    answer: "Todos nuestros productos provienen directamente de distribuidores autorizados de marcas líderes como Lost Mary, Geekvape, OXVA, Elf Bar y Nasty Juice. Cada caja incluye un sello de seguridad con código QR raspable que puedes escanear en el sitio oficial del fabricante para verificar su autenticidad."
  },
  {
    question: "¿Es obligatoria la cédula de ciudadanía para recibir el pedido?",
    answer: "Sí, de manera obligatoria y sin excepciones. Cumpliendo con la legislación colombiana (Ley 1335 de 2009), la venta de productos de vapeo y nicotina está estrictamente restringida a mayores de 18 años. Nuestro domiciliario te solicitará presentar el documento físico de identidad al momento de la entrega."
  },
  {
    question: "¿Tienen garantía los dispositivos?",
    answer: "Sí. Los vaporizadores desechables cuentan con garantía de encendido al momento de la entrega (si presentara falla de fábrica se cambia de inmediato). Los Pods recargables cuentan con garantía de 30 días sobre defectos electrónicos en el dispositivo."
  }
];

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
 */
export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section
      id="faq"
      aria-label="Preguntas Frecuentes"
      className="vp-glitch border-t-2 border-line scroll-mt-20"
    >
      <div className="mx-auto grid max-w-vp gap-10 px-4 py-16 sm:px-6 xl:px-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <PixelLabel variant="outline">[ FAQ ]</PixelLabel>

          <h2 className="mt-4 text-[1.75rem] font-bold uppercase leading-[0.95] tracking-[-0.01em] sm:text-[2.5rem]">
            Preguntas frecuentes
          </h2>

          <p className="mt-3 text-base text-muted sm:text-[1.0625rem]">
            Todo lo que necesitas saber sobre compras, domicilios y garantías en Vapeupar.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((item, index) => {
            const isOpen = openIndex === index;
            const buttonId = `faq-button-${index}`;
            const panelId = `faq-panel-${index}`;

            return (
              <Surface
                key={item.question}
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
                    <ChevronDown
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
