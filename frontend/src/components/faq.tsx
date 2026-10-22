"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

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

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section 
      id="faq" 
      aria-label="Preguntas Frecuentes"
      className="border-t border-zinc-800/80 bg-zinc-950 py-16 scroll-mt-20"
    >
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400 mb-3">
            <HelpCircle className="size-3.5" aria-hidden="true" />
            <span>Resuelve tus Dudas</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Preguntas Frecuentes
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Todo lo que necesitas saber sobre compras, domicilios y garantías en Vapeupar
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/40 transition hover:border-zinc-700"
              >
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between p-4 sm:p-5 text-left text-sm font-bold text-white transition focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <span>{item.question}</span>
                  <ChevronDown
                    className={`size-4 text-emerald-400 transition-transform duration-200 shrink-0 ml-3 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 text-xs leading-relaxed text-zinc-400 border-t border-zinc-800/40 pt-3">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
