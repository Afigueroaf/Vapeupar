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
 * Fecha y hora cortas en es-CO ("27/10/26, 15:04"), para el kardex de la consola.
 * El locale es explícito por el mismo motivo que en `formatNumberCO`.
 */
export function formatDateTimeCO(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso));
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
