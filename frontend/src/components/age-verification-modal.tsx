"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { PixelLabel } from "@/components/ui/pixel-label";

const VERIFICATION_KEY = "vapeupar_age_verified_at";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * `localStorage` es un sistema externo a React, así que se lee con
 * `useSyncExternalStore` y no con un efecto que llame a `setState`: eso último
 * encadenaba un render de más y era el error `react-hooks/set-state-in-effect`
 * que arrastraba el proyecto (pendiente #9 del plan visual).
 *
 * El TTL de 30 días y el comportamiento observable no cambian. Sí cambia el
 * primer fotograma, y a mejor: antes el componente devolvía `null` hasta que
 * corría el efecto, de modo que un visitante sin verificar alcanzaba a ver el
 * catálogo detrás. Ahora el servidor pinta la puerta cerrada.
 */
function subscribe(onStoreChange: () => void) {
  // `storage` solo avisa a las OTRAS pestañas: si el visitante se verifica en
  // una, las demás se enteran por aquí.
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function readNeedsVerification() {
  try {
    const verifiedTimestampStr = localStorage.getItem(VERIFICATION_KEY);
    if (!verifiedTimestampStr) return true;
    const timestamp = parseInt(verifiedTimestampStr, 10);
    // Vigente solo si la verificación cae dentro de los últimos 30 días.
    return isNaN(timestamp) || Date.now() - timestamp >= THIRTY_DAYS_MS;
  } catch {
    // Acceso a localStorage denegado o modo incógnito: se vuelve a preguntar.
    return true;
  }
}

/**
 * En el servidor no hay almacenamiento. La puerta se pinta cerrada: quien ya
 * está verificado la ve un instante mientras hidrata, pero quien no lo está no
 * ve el catálogo nunca. En una puerta legal, ese es el lado correcto del fallo.
 */
const readNeedsVerificationOnServer = () => true;

/**
 * Puerta de verificación +18 (fase V7).
 *
 * Es la primera pantalla que ve cualquier visitante, así que lleva la
 * expresión más fuerte de la marca (`docs/design-reset-inventory.md` §9.2).
 *
 * LO QUE NO SE TOCA (§9.1 y §9.4): el TTL de 30 días, los atributos
 * `role="dialog"` / `aria-modal` / `aria-labelledby` / `aria-describedby`, el
 * foco inicial en el botón de confirmación, el bloqueo de scroll del body, la
 * pantalla de rechazo y **el texto legal palabra por palabra**. Solo cambia la
 * presentación.
 *
 * Este componente se monta FUERA de `.vp-glitch` a propósito: un `filter` en
 * un ancestro lo convertiría en bloque contenedor de sus descendientes
 * `position: fixed` y rompería el overlay a pantalla completa (ver `page.tsx` y
 * el bloque de glitch de `globals.css`).
 */
export function AgeVerificationModal() {
  const needsVerification = useSyncExternalStore(
    subscribe,
    readNeedsVerification,
    readNeedsVerificationOnServer
  );
  const [confirmedNow, setConfirmedNow] = useState(false);
  const [hasRejected, setHasRejected] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isOpen = needsVerification && !confirmedNow;

  useEffect(() => {
    if (!isOpen) return;

    // POR QUÉ NO `document.body.style.overflow = "hidden"`: en iOS Safari el
    // elemento que desplaza la página es `documentElement`, y el navegador
    // ignora el `overflow` del `body`. El resultado era una puerta que en
    // móvil no bloqueaba la navegación: el catálogo seguía desplazándose
    // por detrás.
    //
    // El bloqueo que sí funciona en los dos sistemas es fijar el `body` y
    // compensar el desplazamiento actual con `top` negativo. Al cerrar hay que
    // devolverlo con `window.scrollTo`, o el visitante aparece de vuelta en el
    // principio de la página.
    const scrollY = window.scrollY;
    const { style } = document.body;
    const previous = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
      overflow: style.overflow,
    };

    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";
    style.overflow = "hidden";

    // El foco inicial va al botón de confirmación (§9.1). El temporizador se
    // cancela en la limpieza: si la puerta se cierra antes de los 100ms, mover
    // el foco a un botón ya desmontado lo robaría a la página.
    const focusTimer = setTimeout(() => confirmButtonRef.current?.focus(), 100);

    return () => {
      clearTimeout(focusTimer);
      style.position = previous.position;
      style.top = previous.top;
      style.left = previous.left;
      style.right = previous.right;
      style.width = previous.width;
      style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  /**
   * Trampa de foco (§9.1).
   *
   * El diálogo es una puerta legal: mientras esté abierto, el teclado no puede
   * salir de él. Hasta ahora solo se movía el foco inicial al botón de
   * confirmación, de modo que un `Tab` más llevaba al catálogo de detrás: el
   * contenido seguía siendo alcanzable con teclado y con lector de pantalla
   * aunque la capa opaca lo tapase.
   *
   * Dos piezas, porque una sola no basta:
   *
   * 1. `keydown` en captura reparte el ciclo de `Tab` / `Shift+Tab` entre el
   *    primero y el último elemento enfocable del diálogo.
   * 2. `focusin` es la red de seguridad para todo lo que no pasa por `Tab`:
   *    un clic en el fondo, un `autofocus` tardío, el rotor de VoiceOver o el
   *    regreso desde la barra de direcciones. Si el foco aparece fuera, vuelve
   *    dentro.
   *
   * La lista de enfocables se recalcula en cada pulsación a propósito: al
   * rechazar, el diálogo cambia de contenido y pasa a tener un solo enlace.
   */
  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const SELECTOR =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // `getClientRects()` y no `offsetParent`: dentro de un contenedor
    // `position: fixed` el segundo da resultados engañosos, y aquí hay
    // rótulos que existen en el DOM pero están ocultos por punto de corte.
    const focusables = () =>
      [...dialog.querySelectorAll<HTMLElement>(SELECTOR)].filter(
        (element) => element.getClientRects().length > 0
      );

    const onKeyDown = (event: KeyboardEvent) => {
      // La puerta no se descarta: `Escape` no cierra nada.
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }

      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && dialog.contains(active);

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Node && dialog.contains(target)) return;
      (focusables()[0] ?? dialog).focus();
    };

    // Al pasar a la pantalla de rechazo, el botón enfocado se desmonta y el
    // foco cae al `body` SIN emitir `focusin`, así que la red de seguridad no
    // llega a enterarse. Se recoge aquí, que es donde sí hay un cambio de
    // estado que observar.
    if (!dialog.contains(document.activeElement)) {
      (focusables()[0] ?? dialog).focus();
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [isOpen, hasRejected]);

  const handleConfirmAge = () => {
    try {
      localStorage.setItem(VERIFICATION_KEY, Date.now().toString());
    } catch {
      // fallback if storage disabled
    }
    // `storage` no se emite en la pestaña que escribe, así que el cierre lo
    // lleva este estado local; si localStorage está denegado, es lo único que
    // sostiene la puerta abierta durante la visita.
    setConfirmedNow(true);
  };

  const handleRejectAge = () => {
    setHasRejected(true);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      // `tabIndex={-1}` para que la red de seguridad pueda devolver el foco al
      // propio diálogo si en algún instante no hubiera nada enfocable dentro.
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-dialog-title"
      aria-describedby="age-dialog-desc"
      // Fondo opaco en vez de `bg-black/90 backdrop-blur-md`: el sistema no usa
      // la transparencia como recurso de jerarquía ni el desenfoque de fondo
      // (§2.7 y §3.5). Y esto no es un modal sobre contenido, es una puerta:
      // mostrar el catálogo difuminado detrás es justo lo que no debe pasar.
      //
      // LA CAPA DESPLAZA, NO CENTRA. El texto legal mide ~700px en un teléfono
      // de 360px de ancho, más que el alto de la pantalla. Con `flex
      // items-center` aplicado aquí mismo, el cuadro se recortaba por arriba y
      // por abajo y los dos botones quedaban fuera de la pantalla, sin forma de
      // alcanzarlos: un `position: fixed` no se desplaza, y el scroll de la
      // página está bloqueado a propósito. Eso es lo que hacía la puerta
      // inaccionable en móvil.
      //
      // El centrado baja al hijo con `min-h-full`: cuando el contenido cabe
      // queda centrado, y cuando no cabe crece y esta capa lo desplaza.
      // `overscroll-contain` impide que el gesto se propague a la página.
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background"
    >
      <div className="flex min-h-full items-center justify-center p-4">
        {/*
          Desplazamiento duro en violeta en lugar de `shadow-2xl`. No se usa la
          prop `offset` de `Surface` porque su sombra es negra y aquí el fondo
          también es negro: sería invisible.
        */}
        <div className="w-full max-w-md border-2 border-line bg-surface p-5 shadow-[8px_8px_0_0_var(--color-accent)] rounded-vp sm:p-8">
          {!hasRejected ? (
            <>
              <PixelLabel variant="lime">[ +18 ]</PixelLabel>

              {/* Escala y ritmo más cortos por debajo de `sm` para que la puerta
                  entre de una vez en una pantalla de teléfono. El texto legal es
                  el mismo palabra por palabra (§9.1); solo baja a 14px, que sobre
                  el panel sigue dando 7.1:1. */}
              <h2
                id="age-dialog-title"
                className="mt-5 text-2xl font-bold uppercase leading-[0.95] tracking-[-0.01em] sm:mt-6 sm:text-[1.75rem]"
              >
                Bienvenido a Vapeupar
              </h2>

              <p className="mt-2 text-sm text-muted sm:text-base">
                Control legal de mayoría de edad
              </p>

              <p id="age-dialog-desc" className="mt-5 text-sm leading-relaxed text-muted sm:mt-6 sm:text-base">
                Este sitio web comercializa vaporizadores y líquidos con y sin nicotina. La legislación colombiana (Ley 1335 de 2009) y normas sanitarias prohíben estrictamente el suministro o venta de estos productos a menores de 18 años.
              </p>

              {/* Antes en `amber-400`, que está fuera de la paleta (§2.5). El
                  énfasis pasa a blanco pleno: 14.9:1 sobre el panel. */}
              <p className="mt-4 text-sm font-semibold text-foreground sm:text-base">
                ¿Confirmas bajo juramento que tienes 18 años o más?
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:mt-8">
                {/*
                  Botón crudo con `buttonStyles()` y no `<Button>`: necesita la
                  `ref` que enfoca el diálogo al abrirse, y la primitiva no
                  reenvía refs. Es el caso para el que `buttonStyles()` existe.
                */}
                <button
                  ref={confirmButtonRef}
                  type="button"
                  onClick={handleConfirmAge}
                  // Excepción deliberada a la regla global de `:focus-visible`:
                  // el diálogo mueve el foco aquí por programa al abrirse, y
                  // Chrome no considera "visible" un foco programático en un
                  // botón sin interacción previa de teclado. Sin este `:focus`
                  // explícito, quien llegue con teclado y pulse Enter no vería
                  // dónde está el foco.
                  className={buttonStyles(
                    "primary",
                    "w-full focus:outline-2 focus:outline-offset-2 focus:outline-action"
                  )}
                >
                  Sí, soy mayor de 18 años
                </button>

                <Button variant="secondary" className="w-full" onClick={handleRejectAge}>
                  No, soy menor de edad
                </Button>
              </div>

              <p className="mt-5 text-xs text-muted sm:mt-6 sm:text-sm">
                La verificación se renueva cada 30 días. Se exigirá documento de identidad físico en la entrega.
              </p>
            </>
          ) : (
            <>
              <PixelLabel variant="violet">[ DENEGADO ]</PixelLabel>

              <h3 className="mt-6 text-[1.75rem] font-bold uppercase leading-[0.95] tracking-[-0.01em]">
                Acceso restringido
              </h3>

              <p className="mt-6 text-base leading-relaxed text-muted">
                De acuerdo con la legislación de protección a la infancia y la adolescencia, el acceso a este catálogo está restringido para menores de edad.
              </p>

              <Button variant="secondary" href="https://www.google.com" className="mt-8 w-full">
                Salir de la página
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
