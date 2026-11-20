import { z } from 'zod';
import { text } from './text.js';

/**
 * Las tarjetas del panel de información (`frontend/src/components/trust-band-view.tsx`).
 *
 * Son exactamente tres: el panel está maquetado para tres tarjetas apiladas en
 * el alto de un teléfono en vertical, y una cuarta lo desbordaría.
 *
 * Cada tarjeta: icono pixel, etiqueta, dato destacado, título y de una a tres
 * líneas concretas (`detail` es la primera; `points`, hasta dos más). Sin
 * enlaces (decisión `dec-tarjetas-de-informacion-enlace-de-cada-tarjeta`).
 *
 * `icon`, `highlight` y `points` son OPCIONALES a propósito: las filas
 * publicadas antes del rediseño solo traen `label`, `title` y `detail`, y
 * tienen que seguir validando sin migración. Sin `icon`, el sitio pone el de
 * la posición (`TRUST_BAND_ICONS`); sin `highlight` ni `points`, la tarjeta
 * simplemente no los pinta.
 */

/** Iconos disponibles, en el orden por defecto de las tarjetas. */
export const TRUST_BAND_ICONS = ['delivery', 'original', 'payment'] as const;

export const TrustBandItemSchema = z.strictObject({
  icon: z.enum(TRUST_BAND_ICONS).optional(),
  label: text(16),
  highlight: text(24).optional(),
  title: text(48),
  detail: text(80),
  points: z.array(text(60)).min(1).max(2).optional()
});

export const TrustBandContentSchema = z.strictObject({
  items: z.array(TrustBandItemSchema).length(3)
});

export type TrustBandContent = z.infer<typeof TrustBandContentSchema>;

/**
 * Copy prudente hasta que el dueño confirme entrega y pago
 * (`dec-datos-reales-de-entrega-zonas-tiempos-y-horario`,
 * `dec-metodos-de-pago-y-verificacion-qr`): solo afirma lo que tarjeta, FAQ y
 * pie ya dicen igual. Sin tiempos, zonas fuera de Valledupar ni horarios; de
 * los métodos de pago, solo los que nombran los tres; y el QR, condicionado a
 * que la caja lo traiga. El texto definitivo se publica desde `/admin/content`.
 */
export const TRUST_BAND_DEFAULT: TrustBandContent = {
  items: [
    {
      icon: 'delivery',
      label: 'Envío',
      highlight: 'En moto',
      title: 'Domicilio en Valledupar',
      detail: 'Entrega rápida en tu puerta',
      points: ['Pides por WhatsApp y coordinamos la entrega', 'Cédula al recibir: solo mayores de 18']
    },
    {
      icon: 'original',
      label: 'Original',
      highlight: '100% original',
      title: 'Productos originales',
      detail: 'De distribuidores autorizados',
      points: ['QR del fabricante en la caja, si la marca lo trae']
    },
    {
      icon: 'payment',
      label: 'Pago',
      highlight: 'Al recibir',
      title: 'Pago contra entrega',
      detail: 'Efectivo, Nequi o Daviplata',
      points: ['Nada por adelantado en domicilios locales']
    }
  ]
};
