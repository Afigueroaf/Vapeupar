/**
 * Marca del hueco donde se dibuja el vaporizador.
 *
 * Vive en su propio módulo, sin `"use client"`, porque lo comparten un
 * componente de servidor (`hero.tsx`, que pone el atributo) y uno de cliente
 * (`vaporizer-point-cloud.tsx`, que lo busca). Tenerlo en un solo sitio evita
 * el fallo silencioso de que una de las dos partes cambie la cadena: el
 * componente no avisa si no encuentra el ancla, simplemente centra el objeto
 * en el lienzo, y con el marco a pantalla completa eso lo dejaría flotando en
 * mitad de la intro.
 */
export const VAPORIZER_ANCHOR_ATTRIBUTE = "data-vaporizer-anchor";

export const VAPORIZER_ANCHOR_SELECTOR = `[${VAPORIZER_ANCHOR_ATTRIBUTE}]`;
