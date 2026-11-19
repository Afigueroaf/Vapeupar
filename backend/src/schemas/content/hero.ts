import { z } from 'zod';
import { text } from './text.js';

/**
 * Intro de la portada (`frontend/src/components/hero.tsx`).
 *
 * El titular es el logotipo, que no es texto; lo editable es la etiqueta pixel
 * de encima y el reclamo de debajo. La etiqueta se guarda sin corchetes: los
 * pone el componente, que es quien decide el lenguaje visual.
 */
export const HeroContentSchema = z.strictObject({
  label: text(32),
  tagline: text(32)
});

export type HeroContent = z.infer<typeof HeroContentSchema>;

export const HERO_DEFAULT: HeroContent = {
  label: 'SYSTEM ONLINE',
  tagline: 'Virtual Vape Shop'
};
