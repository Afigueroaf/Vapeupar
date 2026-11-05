"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GLITCH_MAX_SHIFT } from "@/lib/glitch";

const FILTER_ID = "vp-rgb-glitch";

/**
 * Los otros dos filtros son idénticos salvo en el margen de su región, y el
 * margen importa porque la región RECORTA: se mide en porcentaje de la caja del
 * elemento y tiene que dar de sí más que el desplazamiento máximo —17px: 14 de
 * `GLITCH_MAX_SHIFT` más 3 de jitter—, o las copias de color se cortan a ras
 * del borde y el glitch se ve como un recorte y no como una aberración
 * cromática.
 *
 * El 8% del filtro de franja cubre cualquier bloque de 210px de ancho para
 * arriba, que es lo que miden todos. Una tarjeta de producto es media columna
 * del catálogo —unos 150px en un teléfono— y el botón flotante mide 56px, así
 * que cada uno necesita el suyo: a esos tamaños el 8% son 12px y 4,5px.
 *
 * Son tres nodos en `<defs>` y los tres se mueven a la vez, porque el bucle
 * recoge los `feOffset` por atributo y no por filtro.
 */
const CARD_FILTER_ID = "vp-rgb-glitch-card";
const CHIP_FILTER_ID = "vp-rgb-glitch-chip";

const INTRO_DECAY_MS = 2800;
const BURST_DURATION_MS = 420;
const BURST_PEAK = 0.42;
const BURST_INTERVAL_MIN_MS = 5000;
const BURST_INTERVAL_MAX_MS = 9000;

/**
 * Cuánto se adelanta el armado del filtro al inicio de la ráfaga.
 *
 * Aplicar `filter` crea una capa de composición, y hacerlo en el mismo
 * fotograma en que empieza el efecto pondría ese coste justo en el pico. 120 ms
 * son unos siete fotogramas a 60 Hz: suficiente para que la capa esté lista y
 * demasiado poco para que el precalentado cueste nada apreciable (sube el
 * tiempo con filtro de ~6% a ~8% de la visita). Durante ese adelanto `dx` vale
 * 0, así que no se ve absolutamente nada.
 */
const ARM_LEAD_MS = 120;

function nextBurstDelay() {
  return BURST_INTERVAL_MIN_MS + Math.random() * (BURST_INTERVAL_MAX_MS - BURST_INTERVAL_MIN_MS);
}

/**
 * Separa el SourceGraphic en R / G / B, desplaza rojo y azul en sentidos
 * opuestos y los recompone con `screen`. Con dx=0 el resultado es idéntico al
 * original, así que el filtro es visualmente neutro en reposo.
 *
 * `sRGB` es obligatorio: en linearRGB los colores de marca se lavan.
 *
 * `margin` es el porcentaje de caja que la región reserva alrededor del
 * elemento. Tiene que dar de sí más que el desplazamiento máximo en píxeles
 * reales, o las copias desplazadas se recortan.
 */
function RgbSplitFilter({ id, margin }: { id: string; margin: number }) {
  const span = `${100 + margin * 2}%`;
  const start = `${-margin}%`;

  return (
    <filter
      id={id}
      x={start}
      y={start}
      width={span}
      height={span}
      colorInterpolationFilters="sRGB"
    >
      <feOffset data-vp-glitch="red" in="SourceGraphic" dx="0" dy="0" result="redShifted" />
      <feColorMatrix
        in="redShifted"
        type="matrix"
        values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result="red"
      />

      <feOffset data-vp-glitch="blue" in="SourceGraphic" dx="0" dy="0" result="blueShifted" />
      <feColorMatrix
        in="blueShifted"
        type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
        result="blue"
      />

      <feColorMatrix
        in="SourceGraphic"
        type="matrix"
        values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result="green"
      />

      <feBlend in="red" in2="green" mode="screen" result="redGreen" />
      <feBlend in="redGreen" in2="blue" mode="screen" />
    </filter>
  );
}

/**
 * Glitch RGB a nivel de página.
 *
 * Singleton: se monta una sola vez en el layout raíz. Publica los tres filtros
 * SVG que las clases `.vp-glitch*` consumen desde CSS y escribe
 * `--glitch-shift` + `html.glitch-active` en cada frame.
 *
 * Bajo `prefers-reduced-motion: reduce` no monta nada, así que la clase nunca se
 * activa y el filtro nunca llega a aplicarse (`docs/design-reset-inventory.md` §8.5).
 *
 * Tampoco monta nada en la consola (`/admin`): ahí no hay `.vp-glitch` que
 * filtrar, así que el bucle de `requestAnimationFrame` solo gastaría batería
 * (plan A5: el armazón del admin va sin glitch).
 *
 * LO QUE CUESTA ESTO, Y LO QUE SE HACE PARA QUE NO CUESTE DE BALDE. El efecto
 * dura 420 ms y vuelve cada 5-9 s: está animando en torno al 6% del tiempo. El
 * bucle, en cambio, corre siempre, y cada escritura sobre una primitiva del
 * filtro invalida el filtrado de TODOS los bloques que la usan. Escribir
 * `dx="0"` encima de `dx="0"` sesenta veces por segundo es, por tanto, repintar
 * lo que hay en pantalla para no cambiar nada, y eso se nota en un teléfono.
 *
 * De ahí las guardas de abajo: no se toca el DOM si el desplazamiento no ha
 * cambiado, y el bucle se detiene con la pestaña de fondo. Es la misma
 * disciplina que ya siguen las piezas 3D —la nube de puntos ajusta su
 * presupuesto al equipo y el prisma para su bucle fuera de pantalla—, que hasta
 * ahora no había llegado aquí.
 *
 * Y de ahí, sobre todo, el ARMADO: el filtro no vive durante toda la visita,
 * sino solo mientras hay algo que ver y solo en los bloques que están a la
 * vista. `arm()` y `disarm()`, aquí abajo, son la mitad en JavaScript de lo que
 * `globals.css` §GLITCH RGB DE PÁGINA explica entero, incluido el porqué del
 * precalentado. Lo que se ve es exactamente lo mismo que antes.
 */
export function PageGlitch() {
  const [motionAllowed, setMotionAllowed] = useState(false);
  const onConsole = usePathname().startsWith("/admin");
  const enabled = motionAllowed && !onConsole;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotionAllowed(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const root = document.documentElement;
    let frame = 0;
    let start = 0;
    let burstAt = 0;
    let burstStart = -1;

    root.classList.add("glitch-ready");

    /* --- Armado: quién lleva el filtro, y cuándo ------------------------- */

    /**
     * Bloques armados ahora mismo, para poder desarmar exactamente los mismos.
     *
     * Se guarda la lista en vez de volver a consultar el DOM al desarmar: entre
     * una cosa y otra el catálogo puede haber cambiado de filtro y haber tirado
     * tarjetas, y un `querySelectorAll` posterior no las encontraría. La clase
     * se quedaría pegada en un nodo reciclado por React.
     */
    let armedNodes: Element[] = [];
    let armed = false;

    /**
     * Arma el filtro en los bloques que están a la vista.
     *
     * UNA SOLA PASADA DE MEDIDA, Y ANTES DE ESCRIBIR NADA: se leen todos los
     * rectángulos primero y las clases se ponen después. Intercalar lecturas y
     * escrituras forzaría un reflujo por bloque en vez de uno por ráfaga.
     *
     * Se mide con `getBoundingClientRect` en lugar de mantener un
     * `IntersectionObserver` vivo porque esto ocurre una vez cada 5-9 s y el
     * observador tendría que seguir además las altas y bajas de tarjetas del
     * catálogo. Veinticinco medidas cada siete segundos no se notan; un
     * observador con su MutationObserver detrás, sí.
     */
    const arm = () => {
      if (armed) return;
      armed = true;

      const height = window.innerHeight;
      const width = window.innerWidth;
      const nodes = document.querySelectorAll(".vp-glitch, .vp-glitch-card, .vp-glitch-chip");

      const visible: Element[] = [];
      for (const node of nodes) {
        const box = node.getBoundingClientRect();
        // Margen de una pantalla: la ráfaga dura 420 ms y en ese tiempo se puede
        // estar desplazando la página. Sin holgura, un bloque que entra a mitad
        // de ráfaga aparecería sin filtrar.
        if (
          box.bottom > -height &&
          box.top < height * 2 &&
          box.right > -width &&
          box.left < width * 2
        ) {
          visible.push(node);
        }
      }

      for (const node of visible) node.classList.add("vp-glitch-on");
      armedNodes = visible;
      root.classList.add("glitch-armed");
    };

    const disarm = () => {
      if (!armed) return;
      armed = false;

      root.classList.remove("glitch-armed");
      for (const node of armedNodes) node.classList.remove("vp-glitch-on");
      armedNodes = [];
    };

    // Los tres filtros se mueven con el mismo `dx`, de modo que las franjas, las
    // tarjetas y el botón glitchean a la vez. Se recogen una sola vez: son seis
    // nodos y esto se lee en cada frame.
    const reds = [
      ...document.querySelectorAll<SVGFEOffsetElement>('[data-vp-glitch="red"]'),
    ];
    const blues = [
      ...document.querySelectorAll<SVGFEOffsetElement>('[data-vp-glitch="blue"]'),
    ];

    /**
     * Último desplazamiento escrito en el DOM. Arranca en `null` y no en 0 para
     * que el primer fotograma escriba siempre, aunque salga 0: el filtro nace
     * con `dx="0"` en el marcado, pero `--glitch-shift` y `glitch-active` no
     * existen hasta que alguien los pone.
     */
    let appliedShift: number | null = null;

    const apply = (intensity: number, now: number) => {
      // Jitter horizontal tipo scanline en intensidades altas.
      const lineNoise =
        intensity > 0.25 ? Math.max(0, Math.sin(now * 0.001 * 23 + 1.7)) * intensity * 3 : 0;
      const shift = Math.round(intensity * GLITCH_MAX_SHIFT + lineNoise);

      // EL FILTRO SOLO SE TOCA CUANDO CAMBIA. `shift` es un entero redondeado,
      // así que entre ráfagas vale 0 fotograma tras fotograma y aquí no se
      // escribe nada: ni atributos, ni custom property, ni clase. El filtro se
      // queda aplicado y estático, que es lo que el navegador sabe cachear.
      if (shift === appliedShift) return;
      appliedShift = shift;

      for (const node of reds) node.setAttribute("dx", String(-shift));
      for (const node of blues) node.setAttribute("dx", String(shift));
      root.style.setProperty("--glitch-shift", String(shift));
      // El umbral se compara contra el desplazamiento ya redondeado y no contra
      // la intensidad, para que la clase cambie exactamente cuando cambia lo
      // que se ve. Con `GLITCH_MAX_SHIFT` por encima de un píxel, una intensidad
      // por debajo del umbral anterior ya redondeaba a 0.
      root.classList.toggle("glitch-active", shift > 0);
    };

    const tick = (now: number) => {
      if (!start) {
        start = now;
        burstAt = now + INTRO_DECAY_MS + nextBurstDelay();
      }

      const sinceStart = now - start;
      let intensity = 0;

      if (sinceStart < INTRO_DECAY_MS) {
        // Caída de potencia: desplome inicial rápido y cola lenta.
        intensity = (1 - sinceStart / INTRO_DECAY_MS) ** 2.4;
      }

      if (burstStart < 0 && now >= burstAt) burstStart = now;
      if (burstStart >= 0) {
        const t = (now - burstStart) / BURST_DURATION_MS;
        if (t >= 1) {
          burstStart = -1;
          burstAt = now + nextBurstDelay();
        } else {
          // Campana: sube y baja de forma simétrica.
          intensity = Math.max(intensity, BURST_PEAK * Math.sin(t * Math.PI));
        }
      }

      // El filtro se arma un poco ANTES de que haya algo que ver, no cuando ya
      // lo hay: ver §GLITCH RGB DE PÁGINA en `globals.css`. `burstAt` se conoce
      // de antemano, así que el adelanto sale gratis.
      if (sinceStart < INTRO_DECAY_MS || burstStart >= 0 || now >= burstAt - ARM_LEAD_MS) {
        arm();
      } else {
        disarm();
      }

      apply(intensity, now);
      frame = requestAnimationFrame(tick);
    };

    /**
     * Arranque y parada del bucle según la pestaña esté a la vista.
     *
     * `requestAnimationFrame` ya se ralentiza en segundo plano, pero no se
     * garantiza que pare, y al volver entrega un salto de reloj que metería la
     * ráfaga a destiempo. Parando y reanudando, el efecto no gasta nada en una
     * pestaña que nadie mira y vuelve con su propio ritmo.
     */
    /** Momento en que se escondió la pestaña, para descontar ese hueco. */
    let hiddenAt = 0;

    const resume = () => {
      if (frame) return;
      const now = performance.now();

      // EL RELOJ SE ADELANTA, NO SE REINICIA. Reiniciarlo volvería a meter
      // `sinceStart` dentro de la caída de entrada, o sea que la entrada
      // dramática de la carga se repetiría cada vez que se vuelve a la pestaña.
      // Corriendo `start` y `burstAt` el hueco que ha durado la ausencia, la
      // animación continúa donde estaba: la entrada ocurre una sola vez y la
      // siguiente ráfaga conserva su cuenta atrás.
      if (start) {
        const gap = now - hiddenAt;
        start += gap;
        burstAt += gap;
      }

      // Una ráfaga interrumpida no se reanuda por la mitad: se descarta y se
      // programa la siguiente. Si no, al volver se vería arrancar de golpe a
      // media campana.
      if (burstStart >= 0) {
        burstStart = -1;
        burstAt = now + nextBurstDelay();
      }

      frame = requestAnimationFrame(tick);
    };

    const pause = () => {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
      hiddenAt = performance.now();
      // Se deja el filtro en reposo, no a medio glitch: una pestaña que se
      // oculta en mitad de una ráfaga volvería congelada con los canales
      // separados.
      apply(0, 0);
      // Y se desarma, para que una pestaña de fondo no se quede con una capa de
      // composición por bloque durante horas.
      disarm();
    };

    const syncVisibility = () => {
      if (document.visibilityState === "visible") resume();
      else pause();
    };

    document.addEventListener("visibilitychange", syncVisibility);
    syncVisibility();

    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      cancelAnimationFrame(frame);
      disarm();
      root.classList.remove("glitch-ready", "glitch-active");
      root.style.removeProperty("--glitch-shift");
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <svg aria-hidden="true" focusable="false" className="absolute size-0">
        <defs>
          <RgbSplitFilter id={FILTER_ID} margin={8} />
          <RgbSplitFilter id={CARD_FILTER_ID} margin={15} />
          <RgbSplitFilter id={CHIP_FILTER_ID} margin={40} />
        </defs>
      </svg>

      <div aria-hidden="true" className="vp-glitch-scanlines" />
    </>
  );
}
