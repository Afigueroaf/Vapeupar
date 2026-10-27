import { CardField } from "@/components/ui/card-field";
import { PixelLabel } from "@/components/ui/pixel-label";
import { Surface } from "@/components/ui/surface";

/**
 * Banda de señales de confianza.
 *
 * Contenido que antes vivía dentro del hero como "value props" con iconos.
 * Se extrae a su propia banda para que el hero quede con un solo mensaje
 * (`docs/design-reset-inventory.md` §5.7). Los iconos decorativos se
 * sustituyen por etiquetas pixel (§4.6).
 */
const ITEMS = [
  {
    label: "Envío",
    title: "Domicilio en Valledupar",
    detail: "Entrega rápida en tu puerta",
  },
  {
    label: "Original",
    title: "Productos 100% originales",
    detail: "Verificables con código QR",
  },
  {
    label: "Pago",
    title: "Pago contra entrega",
    detail: "Efectivo, Nequi y Daviplata",
  },
];

export function TrustBand() {
  return (
    <section
      aria-label="Garantías de compra"
      className="border-b-2 border-line"
    >
      {/* Las tres tarjetas comparten un campo de fondo continuo y reaccionan al
          puntero. Ver `.vp-card` en `globals.css` y `ui/card-field.tsx`. */}
      <CardField className="mx-auto grid max-w-vp gap-6 px-4 py-10 sm:px-6 sm:grid-cols-3 xl:px-10">
        {ITEMS.map((item) => (
          <Surface key={item.label} className="vp-card p-5">
            <PixelLabel variant="lime">{item.label}</PixelLabel>
            <h3 className="mt-4 text-xl font-bold leading-tight">{item.title}</h3>
            <p className="mt-1 text-base text-muted">{item.detail}</p>
          </Surface>
        ))}
      </CardField>
    </section>
  );
}
