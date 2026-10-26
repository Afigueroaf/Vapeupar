import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPriceCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Formatea un entero con separador de miles en locale es-CO (1000 -> "1.000").
 *
 * El locale es EXPLÍCITO a propósito: `Number.toLocaleString()` sin argumento
 * usa el locale del entorno, que difiere entre el servidor (Node) y el
 * navegador del visitante, y provoca un error de hidratación de React.
 */
export function formatNumberCO(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value);
}
