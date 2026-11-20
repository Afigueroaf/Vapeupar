#!/usr/bin/env node
// Guarda de bundle de la portada (docs/frontend.md, «Presupuesto de rendimiento»).
//
// Se ejecuta DESPUÉS de `npm run build` y no compila nada: lee lo que el build
// ya dejó en frontend/.next. Comprueba dos cosas del JavaScript que la portada
// carga de entrada, que es el que el HTML prerenderizado referencia (las
// etiquetas <script> y cualquier otra mención a /_next/static/chunks/, como
// las precargas). Lo que se carga más tarde con import() o next/dynamic no
// aparece ahí, que es justo la frontera que interesa vigilar.
//
//   1. three.js no está en esos chunks. La firma es «WebGLRenderer», que solo
//      existe en el núcleo de three. Si ningún chunk del build la contiene, la
//      firma ha dejado de valer (otro nombre, otra versión) y la guarda falla
//      en vez de aprobar en vacío.
//   2. Su peso, comprimido con gzip, no pasa de INITIAL_JS_BUDGET_KB.
//
// Uso: npm run build && npm run check:bundle
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEXT = path.join(ROOT, "frontend", ".next");
const HOME_HTML = path.join(NEXT, "server", "app", "index.html");
const CHUNKS = path.join(NEXT, "static", "chunks");

/** Firma de three.js: la clase del renderizador, que no se minifica. */
const THREE_SIGNATURE = "WebGLRenderer";

/**
 * Techo del JS inicial de la portada, en KB gzip. A 2026-11-20 mide ~250 KB:
 * el techo deja ~15 % de margen para que una dependencia pequeña no lo rompa y
 * una grande (three, un editor, una librería de gráficos) sí. Subirlo es una
 * decisión, no un arreglo: anótalo en docs/frontend.md.
 */
const INITIAL_JS_BUDGET_KB = 290;

function fail(message) {
  console.error(`✗ check:bundle — ${message}`);
  process.exit(1);
}

if (!fs.existsSync(HOME_HTML)) {
  fail(`no existe ${path.relative(ROOT, HOME_HTML)}. Ejecuta antes npm run build.`);
}

const html = fs.readFileSync(HOME_HTML, "utf8");
const initial = [...new Set(html.match(/static\/chunks\/[\w./-]+?\.js/g) ?? [])];
if (initial.length === 0) fail("el HTML de la portada no referencia ningún chunk: ¿ha cambiado el formato del build?");

const read = (rel) => {
  const file = path.join(NEXT, rel);
  if (!fs.existsSync(file)) fail(`la portada referencia ${rel}, que no está en el build.`);
  return fs.readFileSync(file);
};

const anywhere = fs
  .readdirSync(CHUNKS, { recursive: true })
  .filter((f) => String(f).endsWith(".js"))
  .some((f) => fs.readFileSync(path.join(CHUNKS, String(f)), "utf8").includes(THREE_SIGNATURE));
if (!anywhere) fail(`ningún chunk contiene «${THREE_SIGNATURE}»: la firma de three.js ya no sirve, actualízala.`);

let gzipBytes = 0;
const offenders = [];
for (const rel of initial) {
  const source = read(rel);
  gzipBytes += zlib.gzipSync(source, { level: 9 }).length;
  if (source.includes(THREE_SIGNATURE)) offenders.push(rel);
}

if (offenders.length > 0) {
  fail(`three.js ha entrado en el JS inicial de la portada (${offenders.join(", ")}). Cárgalo con next/dynamic o import().`);
}

const kb = gzipBytes / 1024;
if (kb > INITIAL_JS_BUDGET_KB) {
  fail(`JS inicial de la portada: ${kb.toFixed(1)} KB gzip, por encima del presupuesto de ${INITIAL_JS_BUDGET_KB} KB.`);
}

console.log(
  `✓ check:bundle — portada: ${initial.length} chunks iniciales, ${kb.toFixed(1)} KB gzip (presupuesto ${INITIAL_JS_BUDGET_KB}), sin three.js.`,
);
