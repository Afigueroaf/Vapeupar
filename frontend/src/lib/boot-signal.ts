/**
 * Señal compartida entre la pantalla de arranque y lo que hay debajo.
 *
 * POR QUÉ EXISTE: mientras el arranque tapa la página, la puerta +18 ya está
 * montada debajo y, 100 ms después de hidratar, mueve el foco a su botón de
 * confirmación. Un visitante que pulsara Espacio o Intro durante esos 4 s
 * aceptaba la declaración de mayoría de edad SIN HABERLA VISTO, y quedaba
 * guardada 30 días. Ahora el arranque vuelve inerte todo lo demás y la puerta
 * espera a `whenBootDone` para dar el foco.
 *
 * El estado vive en `<html data-vp-boot="on">` y el aviso es un evento de
 * `window`: los dos componentes no comparten árbol de React (uno está en el
 * layout raíz y el otro dentro de cada página).
 */
const EVENT = "vp-boot-done";

export function isBooting(): boolean {
  return document.documentElement.dataset.vpBoot === "on";
}

export function startBoot(): void {
  document.documentElement.dataset.vpBoot = "on";
}

export function endBoot(): void {
  if (!isBooting()) return;
  delete document.documentElement.dataset.vpBoot;
  window.dispatchEvent(new Event(EVENT));
}

/** Llama a `callback` cuando no hay arranque en curso. Devuelve la cancelación. */
export function whenBootDone(callback: () => void): () => void {
  if (!isBooting()) {
    callback();
    return () => {};
  }

  const listener = () => {
    window.removeEventListener(EVENT, listener);
    callback();
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/**
 * Vuelve inertes a los hermanos de `overlay` dentro de `parent` (sin teclado,
 * sin lector de pantalla, sin clics). Respeta los que ya lo eran y deja los
 * `<script>`. Devuelve la restauración.
 */
export function inertSiblings(overlay: HTMLElement, parent: HTMLElement): () => void {
  const touched: HTMLElement[] = [];

  for (const child of Array.from(parent.children) as HTMLElement[]) {
    if (child === overlay || child.tagName === "SCRIPT" || child.inert) continue;
    child.inert = true;
    touched.push(child);
  }

  return () => {
    for (const child of touched) child.inert = false;
  };
}
