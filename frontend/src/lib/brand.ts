/**
 * Color de marca para los metadatos del documento.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. El negro de la marca vive en `globals.css` como
 * `--color-vp-black`, que es su sitio. Pero hay dos consumidores que no pueden
 * leer un token de CSS: el manifiesto de aplicación, que es JSON, y la etiqueta
 * `<meta name="theme-color">`, que Next genera desde el objeto `viewport` antes
 * de que exista ninguna hoja de estilos. Tenerlo aquí deja un literal en lugar
 * de dos sueltos, por el mismo motivo que `lib/glitch.ts` centraliza el
 * desplazamiento máximo del glitch.
 *
 * Si cambia `--color-vp-black`, cambia aquí.
 */
export const VP_BLACK = "#080808";
