#!/usr/bin/env node
// Deathnote: roadmap vivo de Vapeupar en la terminal.
// Datos: docs/deathnote/items/<id>.json, docs/deathnote/hitos.json, docs/deathnote/meta.json
// Uso: npm run deathnote -- <comando> (o `node scripts/deathnote.mjs <comando>`). `ayuda` lista los comandos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "docs", "deathnote");
const ITEMS = path.join(DIR, "items");
const STATUSES = ["decision", "en_curso", "pendiente", "hecho"];
const LABEL = { decision: "Tu decisión", en_curso: "En camino", pendiente: "Faltan", hecho: "Completados" };
const SHORT = { decision: "decisión", en_curso: "en curso", pendiente: "pendiente", hecho: "hecho" };
const AREAS = ["frontend", "backend", "datos", "infra", "seguridad", "diseño", "admin", "rendimiento", "producto"];
const PRIO = { alta: 0, media: 1, baja: 2 };

const color = process.env.NO_COLOR ? false : Boolean(process.stdout.isTTY || process.env.FORCE_COLOR);
const sgr = (c) => (s) => (color ? `\x1b[${c}m${s}\x1b[0m` : String(s));
const c = { b: sgr("1"), dim: sgr("2"), red: sgr("31"), green: sgr("32"), yellow: sgr("33"), blue: sgr("34"), gray: sgr("90") };
const tint = { decision: c.yellow, en_curso: c.blue, pendiente: c.gray, hecho: c.green };
const WIDTH = Math.min(process.stdout.columns || 100, 110);

function wrap(text, indent = 2, width = WIDTH) {
  const pad = " ".repeat(indent);
  const out = [];
  for (const para of String(text ?? "").split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if ((line + " " + word).trim().length > width - indent) { out.push(pad + line); line = word; }
      else line = (line + " " + word).trim();
    }
    out.push(pad + line);
  }
  return out.join("\n");
}

function load() {
  const items = fs.readdirSync(ITEMS).filter((f) => f.endsWith(".json")).map((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(ITEMS, f), "utf8"));
    return { id: f.slice(0, -5), ...data };
  });
  return items;
}
function save(item) {
  const { id, ...data } = item;
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(ITEMS, id + ".json"), JSON.stringify(data, null, 2) + "\n");
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")); } catch { return fallback; }
}
function find(items, query) {
  if (!query) fail("Falta el id del pendiente. Usa `lista` para verlos.");
  const exact = items.find((i) => i.id === query);
  if (exact) return exact;
  const q = query.toLowerCase();
  const tiers = [
    items.filter((i) => i.id.startsWith(q)),
    items.filter((i) => i.id.includes(q)),
    items.filter((i) => i.title.toLowerCase().includes(q)),
  ];
  const first = tiers.find((t) => t.length === 1);
  if (first && tiers.slice(0, tiers.indexOf(first)).every((t) => !t.length)) return first[0];
  const hits = tiers.find((t) => t.length) || [];
  if (!hits.length) fail(`No hay ningún pendiente que coincida con "${query}".`);
  fail(`"${query}" coincide con varios:\n` + hits.map((i) => "  " + i.id).join("\n"));
}
function fail(msg) { console.error(c.red("✗ ") + msg); process.exit(1); }
function slug(t) {
  return String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "pendiente";
}
function choices(it) {
  return [
    ...(it.options || []).map((o, index) => ({ ...o, kind: "option", index })),
    ...(it.suggestions || []).map((o, index) => ({ ...o, kind: "suggestion", index })),
  ];
}
function chosen(it) {
  if (!it.choice) return null;
  const list = it.choice.kind === "option" ? it.options : it.suggestions;
  return list?.[it.choice.index] ?? null;
}
function effectivePrompt(it) {
  const base = chosen(it)?.prompt || "";
  const extra = (it.userPrompt || "").trim();
  if (base && extra) return base + "\n\nIndicaciones adicionales:\n" + extra;
  return base || extra;
}
function sortItems(list, status) {
  if (status === "hecho") return list.sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
  return list.sort((a, b) => (b.queued ? 1 : 0) - (a.queued ? 1 : 0) || (PRIO[a.priority] ?? 1) - (PRIO[b.priority] ?? 1) || a.title.localeCompare(b.title));
}
function flags(it) {
  const f = [];
  if (it.queued && it.status !== "hecho") f.push(c.red("● en cola"));
  if (it.choice) f.push(c.green("✓ elegido"));
  if (it.origin === "usuario") f.push(c.dim("tuyo"));
  return f.join(" ");
}
function row(it) {
  const prio = it.priority === "alta" ? c.red("alta ") : c.dim((it.priority || "media").padEnd(5));
  return `  ${prio} ${it.title}  ${c.dim(`[${it.area || "general"}] ${it.id}`)} ${flags(it)}`;
}
function parseFlags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) out[a.slice(2)] = true;
      else { out[a.slice(2)] = next; i++; }
    }
    else out._.push(a);
  }
  return out;
}

// ---------- comandos ----------
function tablero(items) {
  const count = Object.fromEntries(STATUSES.map((s) => [s, items.filter((i) => i.status === s).length]));
  const total = items.length || 1;
  const meta = readJson("meta.json", {});
  console.log(c.b("DEATHNOTE · Vapeupar") + c.dim(meta.lastSync ? `   sincronizado ${meta.lastSync.slice(0, 16).replace("T", " ")} · ${meta.commit || ""}` : ""));
  const bar = STATUSES.slice().reverse().map((s) => tint[s]("█".repeat(Math.round((count[s] / total) * 40)))).join("");
  console.log(`${bar}  ${Math.round((count.hecho / total) * 100)}% completado`);
  console.log(STATUSES.map((s) => tint[s](c.b(String(count[s]))) + " " + LABEL[s].toLowerCase()).join("   ·   "));

  const queued = items.filter((i) => i.queued && i.status !== "hecho");
  if (queued.length) console.log("\n" + c.red(`● ${queued.length} en la cola de Claude`) + c.dim(" → ejecútalos con /deathnote ejecutar"));

  for (const s of ["decision", "en_curso", "pendiente"]) {
    const list = sortItems(items.filter((i) => i.status === s), s);
    console.log("\n" + tint[s](c.b(`${LABEL[s].toUpperCase()} (${list.length})`)));
    if (!list.length) console.log(c.dim("  (nada)"));
    for (const it of list) console.log(row(it));
  }
  const done = sortItems(items.filter((i) => i.status === "hecho"), "hecho");
  console.log("\n" + tint.hecho(c.b(`COMPLETADOS (${done.length})`)) + c.dim("  → `lista hecho` para verlos"));
  console.log(c.dim("\nDetalle: npm run deathnote -- ver <id>   ·   Ayuda: npm run deathnote -- ayuda"));
}

function lista(items, args) {
  const f = parseFlags(args);
  const status = f._[0];
  if (status && !STATUSES.includes(status)) fail(`Estado desconocido "${status}". Usa: ${STATUSES.join(", ")}.`);
  let list = items.filter((i) => (!status || i.status === status) && (!f.area || i.area === f.area));
  if (f.cola) list = list.filter((i) => i.queued && i.status !== "hecho");
  for (const s of STATUSES) {
    const part = sortItems(list.filter((i) => i.status === s), s);
    if (!part.length) continue;
    console.log(tint[s](c.b(`${LABEL[s].toUpperCase()} (${part.length})`)));
    for (const it of part) console.log(row(it));
    console.log("");
  }
  if (!list.length) console.log(c.dim("Nada coincide."));
}

function ver(items, id) {
  const it = find(items, id);
  console.log(tint[it.status](c.b(`[${SHORT[it.status]}]`)) + " " + c.b(it.title) + "  " + flags(it));
  console.log(c.dim(`  id ${it.id} · área ${it.area || "general"} · prioridad ${it.priority || "media"}`));
  if (it.summary) console.log("\n" + wrap(it.summary));
  if (it.question) console.log("\n" + c.yellow(c.b("La decisión")) + "\n" + wrap(it.question));
  const list = choices(it);
  if (list.length) {
    console.log("\n" + c.b("Opciones") + c.dim("  (elige con: elegir " + it.id + " <n>)"));
    list.forEach((o, n) => {
      const on = it.choice && it.choice.kind === o.kind && it.choice.index === o.index;
      const tag = [o.recommended ? c.green("RECOMENDADA") : "", o.kind === "suggestion" ? c.dim("sugerencia") : "", on ? c.green("✓ ELEGIDA") : ""].filter(Boolean).join(" ");
      console.log(`\n  ${c.b(n + 1 + ".")} ${c.b(o.label)} ${tag}`);
      if (o.detail) console.log(wrap(o.detail, 5));
      if (o.prompt) console.log(c.dim(wrap(o.prompt, 5)));
    });
  }
  if (it.userPrompt) console.log("\n" + c.b("Tu prompt") + "\n" + wrap(it.userPrompt));
  const eff = effectivePrompt(it);
  console.log("\n" + c.b("Prompt que se ejecutará") + "\n" + (eff ? wrap(eff) : c.dim("  (elige una opción o escribe tu prompt)")));
  if (it.claudeNote) console.log("\n" + c.b("Nota de Claude") + "\n" + wrap(it.claudeNote));
  const kv = [["fuente", it.source], ["evidencia", it.evidence], ["bloqueado por", it.blockedBy?.join(", ")], ["origen", it.origin === "usuario" ? "añadido por ti" : "documentación"], ["en cola desde", it.queued ? it.queuedAt : ""], ["completado", it.completedAt]].filter(([, v]) => v);
  console.log("");
  for (const [k, v] of kv) console.log(c.dim(`  ${k.padEnd(14)}`) + v);
}

function elegir(items, id, n) {
  const it = find(items, id);
  const list = choices(it);
  const i = Number(n) - 1;
  if (!list.length) fail("Este pendiente no tiene opciones ni sugerencias; escribe tu prompt con `prompt`.");
  if (!Number.isInteger(i) || i < 0 || i >= list.length) fail(`Elige un número entre 1 y ${list.length}.`);
  it.choice = { kind: list[i].kind, index: list[i].index };
  save(it);
  console.log(c.green("✓ ") + `Elegida "${list[i].label}" para ${it.id}. Mándalo a la cola con: cola ${it.id}`);
}

function prompt(items, id, text) {
  const it = find(items, id);
  it.userPrompt = text.join(" ").trim();
  if (!it.userPrompt) delete it.userPrompt;
  save(it);
  console.log(c.green("✓ ") + (it.userPrompt ? `Prompt guardado en ${it.id}.` : `Prompt borrado de ${it.id}.`));
}

function cola(items, id, on) {
  const it = find(items, id);
  if (on) {
    if (!effectivePrompt(it)) fail("Antes elige una opción (`elegir`) o escribe tu prompt (`prompt`).");
    if (it.status === "hecho") fail("Ese pendiente ya está completado.");
    it.queued = true; it.queuedAt = new Date().toISOString();
  } else { it.queued = false; delete it.queuedAt; }
  save(it);
  const n = load().filter((i) => i.queued && i.status !== "hecho").length;
  console.log(c.green("✓ ") + (on ? `${it.id} en la cola (${n} en total). Ejecuta con /deathnote ejecutar.` : `${it.id} fuera de la cola.`));
}

function estado(items, id, s) {
  const it = find(items, id);
  if (!STATUSES.includes(s)) fail(`Usa uno de: ${STATUSES.join(", ")}.`);
  it.status = s;
  if (s === "hecho") { it.completedAt = new Date().toISOString(); it.queued = false; delete it.queuedAt; }
  else delete it.completedAt;
  save(it);
  console.log(c.green("✓ ") + `${it.id} → ${SHORT[s]}.`);
}

function prioridad(items, id, p) {
  const it = find(items, id);
  if (!(p in PRIO)) fail("Usa alta, media o baja.");
  it.priority = p; save(it);
  console.log(c.green("✓ ") + `${it.id} → prioridad ${p}.`);
}

function nuevo(items, args) {
  const f = parseFlags(args);
  const title = f._.join(" ").trim();
  if (!title) fail('Escribe el título: nuevo "Pasarela de pagos con PSE" --tipo decision --area backend');
  const tipo = f.tipo || "pendiente";
  if (!["pendiente", "decision", "en_curso"].includes(tipo)) fail("--tipo debe ser pendiente, decision o en_curso.");
  const area = f.area || "producto";
  if (!AREAS.includes(area)) console.log(c.yellow("! ") + `Área nueva "${area}" (las habituales: ${AREAS.join(", ")}).`);
  let id = slug(title);
  if (items.some((i) => i.id === id)) id += "-" + Date.now().toString(36).slice(-4);
  const now = new Date().toISOString();
  const it = { id, title, status: tipo, priority: f.prioridad || "media", area, summary: f.contexto || "", origin: "usuario", source: "Añadido desde la terminal", createdAt: now };
  if (tipo === "decision") it.question = f.pregunta || title;
  if (f.prompt) it.userPrompt = f.prompt;
  if (!it.summary) delete it.summary;
  save(it);
  console.log(c.green("✓ ") + `Anotado ${id}. Pide sugerencias en Claude con: /deathnote sugerir ${id}`);
}

function borrar(items, id) {
  const it = find(items, id);
  if (it.origin !== "usuario") fail("Solo se borran desde aquí los pendientes que añadiste tú; los de la documentación se marcan como hecho o se descartan con Claude.");
  fs.unlinkSync(path.join(ITEMS, it.id + ".json"));
  console.log(c.green("✓ ") + `Borrado ${it.id}.`);
}

function hitos() {
  const list = readJson("hitos.json", []).slice().reverse();
  console.log(c.b(`BITÁCORA DE HITOS (${list.length})`));
  for (const h of list) {
    console.log(`\n  ${c.dim(h.date)}  ${c.b(h.title)}`);
    if (h.detail) console.log(wrap(h.detail, 14));
    if (h.ref) console.log(c.dim(" ".repeat(14) + h.ref));
  }
}

function ayuda() {
  console.log(`${c.b("Deathnote")} · npm run deathnote -- <comando>

  ${c.b("(sin comando)")}                 tablero: conteos, cola y pendientes por estado
  ${c.b("lista")} [estado] [--area x] [--cola] lista filtrada (estado: ${STATUSES.join(", ")})
  ${c.b("ver")} <id>                       detalle, opciones numeradas y prompt final
  ${c.b("elegir")} <id> <n>                elige la opción o sugerencia n
  ${c.b("prompt")} <id> "texto"            tu prompt (se suma a la opción elegida); vacío lo borra
  ${c.b("cola")} <id> / ${c.b("sacar")} <id>         manda a la cola de Claude / la saca
  ${c.b("estado")} <id> <estado>           cambia el estado
  ${c.b("prioridad")} <id> <alta|media|baja>
  ${c.b("nuevo")} "título" [--tipo pendiente|decision|en_curso] [--area x] [--prioridad p]
         [--contexto "..."] [--pregunta "..."] [--prompt "..."]
  ${c.b("borrar")} <id>                    borra un pendiente añadido por ti
  ${c.b("hitos")}                          bitácora de hitos

  <id> admite una parte del id o del título si es única.
  Dentro de Claude Code: ${c.b("! npm run deathnote")} o la skill ${c.b("/deathnote")}.`);
}

const [cmd, ...rest] = process.argv.slice(2);
const items = load();
switch (cmd) {
  case undefined: case "tablero": tablero(items); break;
  case "lista": lista(items, rest); break;
  case "ver": ver(items, rest[0]); break;
  case "elegir": elegir(items, rest[0], rest[1]); break;
  case "prompt": prompt(items, rest[0], rest.slice(1)); break;
  case "cola": cola(items, rest[0], true); break;
  case "sacar": cola(items, rest[0], false); break;
  case "estado": estado(items, rest[0], rest[1]); break;
  case "prioridad": prioridad(items, rest[0], rest[1]); break;
  case "nuevo": nuevo(items, rest); break;
  case "borrar": borrar(items, rest[0]); break;
  case "hitos": hitos(); break;
  case "ayuda": case "help": case "-h": case "--help": ayuda(); break;
  default: fail(`Comando desconocido "${cmd}". Usa: npm run deathnote -- ayuda`);
}
