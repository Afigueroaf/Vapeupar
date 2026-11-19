import { z } from 'zod';
import { text } from './text.js';

/**
 * Las tarjetas del panel de información (`frontend/src/components/trust-band.tsx`).
 *
 * Son exactamente tres: el panel está maquetado para tres tarjetas apiladas en
 * el alto de un teléfono en vertical, y una cuarta lo desbordaría.
 */
export const TrustBandItemSchema = z.strictObject({
  label: text(16),
  title: text(48),
  detail: text(80)
});

export const TrustBandContentSchema = z.strictObject({
  items: z.array(TrustBandItemSchema).length(3)
});

export type TrustBandContent = z.infer<typeof TrustBandContentSchema>;

export const TRUST_BAND_DEFAULT: TrustBandContent = {
  items: [
    { label: 'Envío', title: 'Domicilio en Valledupar', detail: 'Entrega rápida en tu puerta' },
    { label: 'Original', title: 'Productos 100% originales', detail: 'Verificables con código QR' },
    { label: 'Pago', title: 'Pago contra entrega', detail: 'Efectivo, Nequi y Daviplata' }
  ]
};
