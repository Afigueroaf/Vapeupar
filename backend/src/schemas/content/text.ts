import { z } from 'zod';

/**
 * Texto editable con límites. Se recorta antes de medir, así que un valor de
 * solo espacios cuenta como vacío y no pasa el mínimo.
 *
 * Los máximos no son arbitrarios: son lo que cabe en el diseño sin romperlo
 * (una tarjeta de la banda de confianza apilada a 375 px, un `<title>` que
 * Google no corta). Subirlos es una decisión de diseño, no de validación.
 */
export const text = (max: number, min = 1) => z.string().trim().min(min).max(max);
