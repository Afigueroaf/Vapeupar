import type { StockMovementType } from "@/types/admin";

/**
 * Nombres de los tipos de movimiento en la consola. El contrato de la API va en
 * inglés (`inbound`, `shrinkage`...); lo que se lee en pantalla, en español.
 */
export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  inbound: "Ingreso",
  sale: "Venta",
  adjustment: "Ajuste",
  shrinkage: "Merma",
  return: "Devolución",
};

/** Qué le hace al disponible cada tipo, para avisarlo antes de registrar. */
export const MOVEMENT_HINTS: Record<StockMovementType, string> = {
  inbound: "Suma al disponible. Admite proveedor y costo unitario.",
  sale: "Resta del disponible.",
  adjustment: "Conteo físico: el signo lo pones tú y exige motivo.",
  shrinkage: "Resta del disponible (producto perdido o dañado).",
  return: "Suma al disponible (devolución de un cliente).",
};

export const MOVEMENT_TYPES = Object.keys(MOVEMENT_LABELS) as StockMovementType[];
