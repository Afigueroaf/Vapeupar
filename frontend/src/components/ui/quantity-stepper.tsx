import { MinusIcon, PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface QuantityStepperProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
  /** Lo que se está contando, para los nombres accesibles de los botones. */
  label: string;
  /** Mínimo 1 en vez de 0: en la ficha no tiene sentido pedir cero. */
  min?: number;
  compact?: boolean;
}

/**
 * Selector de cantidad: menos, cifra, más. Los botones miden 44px —el mínimo
 * táctil— también en la versión compacta del cajón.
 *
 * En el cajón el mínimo es 1, no 0: bajar a cero quitaría la línea sin
 * querer, y para eso está la papelera, que dice lo que hace.
 */
export function QuantityStepper({ value, max, onChange, label, min = 1, compact = false }: QuantityStepperProps) {
  const button =
    "flex size-11 items-center justify-center transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-30";
  return (
    <div className="inline-flex items-center border-2 border-muted" role="group" aria-label={`Cantidad de ${label}`}>
      <button
        type="button"
        className={button}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={`Quitar una unidad de ${label}`}
      >
        <MinusIcon className="size-4" aria-hidden="true" />
      </button>
      <span
        className={cn("text-center font-bold tabular-nums", compact ? "w-8" : "w-12 text-lg")}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        className={button}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={`Añadir una unidad de ${label}`}
      >
        <PlusIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
