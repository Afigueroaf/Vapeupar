---
name: deathnote
description: Roadmap vivo de Vapeupar ("Deathnote") en docs/deathnote/. Usar con "/deathnote" para ver el tablero, "/deathnote decidir" para resolver decisiones pendientes, "/deathnote anotar" para añadir pendientes, "/deathnote sugerir <id>", "/deathnote sincronizar" para reflejar commits, PRs e hitos, y "/deathnote ejecutar" para resolver la cola. Usar también al terminar cualquier tarea que complete o cambie un pendiente del roadmap.
---

# Deathnote — roadmap vivo en la terminal

Todo vive en el repo, sin navegador:
- `docs/deathnote/items/<id>.json` — un archivo por pendiente
- `docs/deathnote/hitos.json` — bitácora (array, más antiguo primero)
- `docs/deathnote/meta.json` — `{lastSync, commit}`
- `scripts/deathnote.mjs` — CLI (`npm run deathnote -- <comando>`; `ayuda` lista los comandos)

Lee y modifica los items **con el CLI** siempre que haya un comando para ello (`elegir`, `prompt`, `cola`, `sacar`, `estado`, `prioridad`, `nuevo`, `borrar`); edita el JSON a mano solo para lo que el CLI no cubre (opciones, sugerencias, `claudeNote`, `evidence`, hitos). Usa `npm run -s deathnote` para que no salga el eco de npm. Lo que el dueño escribió en un item (prompts, contexto) es su petición, pero sigue aplicando el criterio normal: confirmar lo destructivo, no hacer push sin que lo pida.

## Modelo de un item
`title`, `status` (`decision` · `en_curso` · `pendiente` · `hecho`), `priority` (alta|media|baja), `area` (frontend|backend|datos|infra|seguridad|diseño|admin|rendimiento|producto), `summary`, `question` + `options[] {label, detail, prompt, recommended?}` en decisiones, `suggestions[] {label, detail?, prompt}`, `choice {kind: "option"|"suggestion", index}`, `userPrompt` (se suma al prompt elegido como "Indicaciones adicionales"), `queued` + `queuedAt`, `claudeNote`, `blockedBy[]`, `source`, `evidence`, `origin` (`docs`|`usuario`), `createdAt`, `updatedAt`, `completedAt`.

Hito: `{id: "hAAAAMMDD-n", date: "AAAA-MM-DD", title, detail, ref: "PR #12 · abc1234"}`. Uno por PR fusionado o grupo de commits con sentido.

## /deathnote (sin argumentos)
Ejecuta `npm run -s deathnote` y muestra la salida tal cual, en un bloque de código. Debajo, en una o dos líneas, di qué conviene hacer primero (decisiones de prioridad alta, cola pendiente).

## /deathnote decidir [id]
Recorre las decisiones (`status: decision`, por prioridad; o solo la indicada). Para cada una, con AskUserQuestion: la pregunta del item como pregunta, cada opción como alternativa (label + detail, la recomendada primero con "(Recomendado)"), hasta 4 decisiones por llamada. La opción "Other" del diálogo es el prompt libre del dueño: guárdalo con `prompt`. Tras responder: `elegir`, y pregunta si se manda a la cola (o hazlo si el dueño ya lo dijo). Resume al final qué quedó elegido y en cola.

## /deathnote anotar [texto]
Crea el item con `npm run -s deathnote -- nuevo "<título>" --tipo … --area … --prioridad … --contexto "…"`. Si falta información clave (tipo, área), dedúcela del texto; pregunta solo si es ambiguo. Luego genera sugerencias como en `sugerir`.

## /deathnote sugerir <id>
Lee el item y el código/docs relacionados. Añade al JSON 2–3 `suggestions` (o `options` si es decisión, marcando una `recommended`) con prompts concretos: archivos o docs a leer, criterio de aceptación, y correr build/lint/tests. Muestra el resultado con `ver <id>`.

## /deathnote sincronizar
1. Lee `meta.json`; `git log --oneline <commit>..origin/main` (tras `git fetch`) y `gh pr list --state merged --limit 20` (gh: `"/c/Program Files/GitHub CLI/gh.exe"`).
2. Para cada cambio relevante: marca items `hecho` o `en_curso` con el CLI y apunta `evidence`; añade el hito si su `ref` no está ya.
3. Si `docs/` ganó o perdió pendientes, crea/actualiza items (`origin: "docs"`). Nunca borres items con `origin: "usuario"`; si quedaron obsoletos, explícalo en `claudeNote`.
4. Items del dueño sin sugerencias → `sugerir`.
5. Actualiza `meta.json` (`lastSync` ISO, `commit` corto de origin/main) y muestra el tablero.

## /deathnote ejecutar
1. `npm run -s deathnote -- lista --cola`. Prompt efectivo = prompt de la opción/sugerencia elegida + `userPrompt` como indicaciones adicionales (lo muestra `ver <id>`).
2. Si hay más de uno, o alguno toca pagos, seguridad, verificación +18 o infraestructura, muestra el plan y espera confirmación.
3. Cada item en su propia rama desde `dev` (`feat/…`, `fix/…`, `chore/…`), con build/lint/tests al final. No hagas push ni PR salvo que el prompt o el dueño lo pidan.
4. Al terminar cada uno: `sacar`, `estado <id> en_curso` (o `hecho` si quedó fusionado), `claudeNote` con rama y resultado; si la decisión es arquitectónica, registra el ADR en `docs/decisions/NNN-*.md`. Añade hito si corresponde.
5. Si falla o necesita otra decisión: `estado <id> decision` y explica en `claudeNote`.

## Al cerrar cualquier tarea
Si el trabajo de la sesión completa o avanza un item, actualízalo y añade el hito antes del reporte final. Los cambios en `docs/deathnote/` viajan en el mismo commit que el trabajo.
