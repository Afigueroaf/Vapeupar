/**
 * Origen público de la tienda, sin barra final (decisión D2: se mantiene el
 * nombre de No-IP; ver docs/aws-full-deployment-plan.md, F4).
 *
 * Sale de `NEXT_PUBLIC_SITE_URL`, que en los despliegues viene de SSM
 * (`/vapeupar/<env>/web/NEXT_PUBLIC_SITE_URL`) igual que el resto de variables
 * públicas. Así cambiar de nombre —o algún día pasar a un dominio propio— es
 * cambiar un parámetro y redesplegar, no tocar el código.
 *
 * Lo usan `metadataBase` y la URL de OpenGraph: si apuntan a un origen que no
 * es el real, WhatsApp y X no recuperan la imagen al compartir un enlace. Sin
 * variable (desarrollo local) se usa `http://localhost:3000`, que es correcto
 * en local y en un build de producción deja claro que falta configurarla.
 */
const FALLBACK_SITE_URL = "http://localhost:3000";

export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return FALLBACK_SITE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}
