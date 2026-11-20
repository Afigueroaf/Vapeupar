import type { SVGProps } from "react";

/**
 * Iconos pixel de Vapeupar (decisión §4.5 del plan de diseño, 2026-11-16).
 *
 * Sustituyen a Lucide en la tienda: su trazo lineal y redondeado no casaba con
 * una marca angular de bordes de 2 px y tipografía pixel. Cada icono es un
 * mapa de 16 × 16 celdas escrito aquí mismo, `#` lleno y `.` vacío, con trazo
 * de 2 celdas como los bordes del sistema. Así el dibujo se lee y se corrige
 * en el código, sin exportar nada de un editor.
 *
 * El mapa se convierte una sola vez, al cargar el módulo, en un `path` de
 * rectángulos (una tira por cada racha horizontal). `crispEdges` evita el
 * antialiasing: a `size-4` cada celda es un píxel CSS exacto; a `size-5` la
 * escala es 1,25 y el navegador redondea, que en arte pixel es lo correcto.
 *
 * El color es `currentColor`, como en Lucide: el icono hereda el del texto.
 * Por defecto `aria-hidden`; todos acompañan a un texto o a un `aria-label`.
 *
 * La consola `/admin` sigue con Lucide de momento: es una herramienta interna
 * densa y no entraba en la decisión.
 */

const GRID = 16;

type Bitmap = readonly string[];

function assertBitmap(name: string, rows: Bitmap): void {
  if (rows.length !== GRID || rows.some((row) => row.length !== GRID || /[^#.]/.test(row))) {
    throw new Error(`Icono pixel «${name}»: el mapa tiene que ser de ${GRID}×${GRID} con «#» y «.»`);
  }
}

/** Cada racha horizontal de `#` es un rectángulo de una celda de alto. */
function toPath(rows: Bitmap): string {
  let d = "";
  rows.forEach((row, y) => {
    for (const run of row.matchAll(/#+/g)) {
      const x = run.index ?? 0;
      d += `M${x} ${y}h${run[0].length}v1h-${run[0].length}z`;
    }
  });
  return d;
}

/** Gira el mapa un cuarto de vuelta en el sentido de las agujas del reloj. */
function rotateCW(rows: Bitmap): Bitmap {
  return Array.from({ length: GRID }, (_, y) =>
    Array.from({ length: GRID }, (_, x) => rows[GRID - 1 - x][y]).join(""),
  );
}

function mirror(rows: Bitmap): Bitmap {
  return rows.map((row) => [...row].reverse().join(""));
}

// --- Mapas -----------------------------------------------------------------

const CHEVRON_DOWN: Bitmap = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "..##........##..",
  "..###......###..",
  "...###....###...",
  "....###..###....",
  ".....######.....",
  "......####......",
  "................",
  "................",
  "................",
  "................",
  "................",
];

/** Abajo girado tres cuartos de vuelta: apunta a la derecha. */
const CHEVRON_RIGHT = rotateCW(rotateCW(rotateCW(CHEVRON_DOWN)));
const CHEVRON_LEFT = mirror(CHEVRON_RIGHT);

const CLOSE: Bitmap = [
  "................",
  "................",
  "..##........##..",
  "..###......###..",
  "...###....###...",
  "....###..###....",
  ".....######.....",
  "......####......",
  "......####......",
  ".....######.....",
  "....###..###....",
  "...###....###...",
  "..###......###..",
  "..##........##..",
  "................",
  "................",
];

const MENU: Bitmap = [
  "................",
  "................",
  "................",
  "..############..",
  "..############..",
  "................",
  "................",
  "..############..",
  "..############..",
  "................",
  "................",
  "..############..",
  "..############..",
  "................",
  "................",
  "................",
];

const PLUS: Bitmap = [
  "................",
  "................",
  "................",
  ".......##.......",
  ".......##.......",
  ".......##.......",
  ".......##.......",
  "...##########...",
  "...##########...",
  ".......##.......",
  ".......##.......",
  ".......##.......",
  ".......##.......",
  "................",
  "................",
  "................",
];

const MINUS: Bitmap = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "...##########...",
  "...##########...",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

const SEARCH: Bitmap = [
  "................",
  "................",
  "....#####.......",
  "...#######......",
  "..###...###.....",
  "..##.....##.....",
  "..##.....##.....",
  "..##.....##.....",
  "..###...###.....",
  "...#######......",
  "....#####.##....",
  "..........###...",
  "...........###..",
  "............##..",
  "................",
  "................",
];

const BAG: Bitmap = [
  "................",
  "................",
  "......####......",
  ".....######.....",
  ".....##..##.....",
  ".....##..##.....",
  "..############..",
  "..############..",
  "..##........##..",
  "..##........##..",
  "..##........##..",
  "..##........##..",
  "..##........##..",
  "..############..",
  "..############..",
  "................",
];

const TRASH: Bitmap = [
  "................",
  "................",
  "......####......",
  "..############..",
  "..############..",
  "................",
  "...##########...",
  "...##.#..#.##...",
  "...##.#..#.##...",
  "...##.#..#.##...",
  "...##.#..#.##...",
  "...##.#..#.##...",
  "...##########...",
  "...##########...",
  "................",
  "................",
];

const CHAT: Bitmap = [
  "................",
  "................",
  "...##########...",
  "..############..",
  ".###........###.",
  ".##..........##.",
  ".##..........##.",
  ".##..........##.",
  ".###........###.",
  "..############..",
  "...##########...",
  "...###..........",
  "..###...........",
  ".###............",
  "................",
  "................",
];

/** Moto de reparto, de perfil: la tarjeta de envío. */
const DELIVERY: Bitmap = [
  "................",
  "................",
  "..........####..",
  "...........##...",
  "...........##...",
  ".######....##...",
  ".######....##...",
  "..#############.",
  "..#############.",
  "...##########...",
  "..####....####..",
  ".##..##..##..##.",
  ".##..##..##..##.",
  "..####....####..",
  "................",
  "................",
];

/** Sello con visto: la tarjeta de producto original. */
const SEAL: Bitmap = [
  "................",
  "......####......",
  "...##########...",
  "..############..",
  "..##........##..",
  ".##.......##.##.",
  ".##......##..##.",
  ".##.##..##...##.",
  ".##..####....##.",
  ".##...##.....##.",
  "..##........##..",
  "..############..",
  "...##########...",
  "......####......",
  "................",
  "................",
];

/** Billete: la tarjeta de pago. */
const CASH: Bitmap = [
  "................",
  "................",
  "................",
  "################",
  "################",
  "##............##",
  "##....####....##",
  "##.#.##..##.#.##",
  "##.#.##..##.#.##",
  "##....####....##",
  "##............##",
  "################",
  "################",
  "................",
  "................",
  "................",
];

// --- Componentes -------------------------------------------------------------

type IconProps = SVGProps<SVGSVGElement>;

function pixelIcon(name: string, bitmap: Bitmap) {
  assertBitmap(name, bitmap);
  const d = toPath(bitmap);

  function PixelIcon({ "aria-hidden": ariaHidden = true, ...props }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${GRID} ${GRID}`}
        width={GRID}
        height={GRID}
        fill="currentColor"
        shapeRendering="crispEdges"
        aria-hidden={ariaHidden}
        focusable="false"
        {...props}
      >
        <path d={d} />
      </svg>
    );
  }
  PixelIcon.displayName = `${name}Icon`;
  return PixelIcon;
}

export const ChevronDownIcon = pixelIcon("ChevronDown", CHEVRON_DOWN);
export const ChevronRightIcon = pixelIcon("ChevronRight", CHEVRON_RIGHT);
export const ChevronLeftIcon = pixelIcon("ChevronLeft", CHEVRON_LEFT);
export const CloseIcon = pixelIcon("Close", CLOSE);
export const MenuIcon = pixelIcon("Menu", MENU);
export const PlusIcon = pixelIcon("Plus", PLUS);
export const MinusIcon = pixelIcon("Minus", MINUS);
export const SearchIcon = pixelIcon("Search", SEARCH);
export const BagIcon = pixelIcon("Bag", BAG);
export const TrashIcon = pixelIcon("Trash", TRASH);
export const ChatIcon = pixelIcon("Chat", CHAT);
export const DeliveryIcon = pixelIcon("Delivery", DELIVERY);
export const SealIcon = pixelIcon("Seal", SEAL);
export const CashIcon = pixelIcon("Cash", CASH);
