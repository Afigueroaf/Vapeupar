import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { decodeCsv, formatPlan } from '../src/catalog/initial-count.js';
import { disconnectPrisma } from '../src/db/prisma.js';
import { PrismaInitialCountSource } from '../src/repositories/prisma-initial-count.repository.js';
import { PrismaStockRepository } from '../src/repositories/prisma-stock.repository.js';
import { PrismaUserRepository } from '../src/repositories/prisma-user.repository.js';
import { InitialCountService } from '../src/services/initial-count.service.js';
import { StockService } from '../src/services/stock.service.js';

/**
 * Importa la planilla del conteo físico inicial (ver `export-count-template.ts`)
 * como movimientos de stock: `inbound` con costo y proveedor si la variante
 * tenía stock 0, `adjustment` con motivo por la diferencia si ya tenía.
 *
 *   npm run db:import-stock --workspace=backend -- --file scripts/data/conteo-2026-11-20.csv --user-email <owner> --batch 2026-11
 *   npm run db:import-stock --workspace=backend -- --file scripts/data/conteo-2026-11-20.csv --user-email <owner> --batch 2026-11 --apply
 *
 * Sin `--apply` es un dry-run: lee la base, valida y muestra el plan sin
 * escribir nada. Con `--apply` vuelve a mostrar el plan y pide escribir el lote
 * para confirmar (`--yes` lo omite; ejecutarlo desde PowerShell o cmd: en Git
 * Bash la terminal no se detecta y la confirmación no llega). Si hay cualquier
 * error o una variante activa sin fila, no escribe nada, y tampoco si el plan
 * recalculado difiere de la vista previa confirmada. Cada movimiento pasa por
 * `stockService.recordMovement`, firmado por el owner de `--user-email`, con
 * `AuditLog` y `operationKey` `conteo-inicial:<lote>:<línea>/<variante>`:
 * repetir el mismo lote no duplica; para corregir, otro `--batch`.
 *
 * Necesita `backend/.env` (`npm run infra:env-backend`) y el túnel abierto
 * (`npm run infra:db-tunnel`).
 */

const USAGE = 'Uso: npm run db:import-stock --workspace=backend -- --file <planilla.csv> --user-email <owner> --batch <lote> [--apply [--yes]]';

function flag(argv: string[], name: string): string | undefined {
  const inline = argv.find(a => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
}

async function confirm(batch: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error('Sin terminal interactiva (¿Git Bash?): ejecútalo desde PowerShell o cmd, o añade --yes.');
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`\nEl libro de stock no se puede editar. Escribe el lote (${batch}) para aplicar: `);
    return answer.trim() === batch;
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  dotenv.config();
  const argv = process.argv.slice(2);
  const file = flag(argv, 'file');
  const userEmail = flag(argv, 'user-email');
  const batch = flag(argv, 'batch');
  const apply = argv.includes('--apply');
  if (apply && argv.includes('--dry-run')) throw new Error(`--apply y --dry-run se excluyen.\n${USAGE}`);
  if (!file || !userEmail || !batch) throw new Error(`Faltan argumentos.\n${USAGE}`);

  const path = resolve(file);
  const csvText = decodeCsv(readFileSync(path));
  const stockRepository = new PrismaStockRepository();
  const service = new InitialCountService(
    new PrismaInitialCountSource(),
    stockRepository,
    new StockService(stockRepository),
    new PrismaUserRepository()
  );

  console.log(`Planilla ${path}\n`);
  const preview = await service.importCount({ csvText, batch, userEmail, apply: false });
  console.log(formatPlan(preview.plan));

  if (!preview.plan.canApply) {
    process.exitCode = 1;
    return;
  }
  if (!apply) {
    console.log('\n--dry-run: no se ha escrito nada. Revisa el plan y repite con --apply.');
    return;
  }
  const pending = preview.plan.totals.inbound.rows + preview.plan.totals.adjustment.rows;
  if (pending === 0) {
    console.log(`\nNada que registrar: 0 creados, ${preview.plan.totals.replayed} ya registrados en el lote ${batch}.`);
    return;
  }
  if (!argv.includes('--yes') && !(await confirm(batch))) {
    console.log('No confirmado: no se ha escrito nada.');
    process.exitCode = 1;
    return;
  }

  const result = await service.importCount({ csvText, batch, userEmail, apply: true, confirmedPlan: preview.plan });
  if (!result.applied) {
    console.log('\nEl plan cambió desde la vista previa y ya no se puede aplicar:\n');
    console.log(formatPlan(result.plan));
    process.exitCode = 1;
    return;
  }
  for (const r of result.results) {
    console.log(`  fila ${r.row}: ${r.ref} → ${r.stock}${r.replayed ? ' (ya estaba)' : ''}`);
  }
  const created = result.results.filter(r => !r.replayed).length;
  const replayed = result.plan.totals.replayed + result.results.length - created;
  console.log(`\nListo: ${created} creados, ${replayed} ya registrados en el lote ${batch}.`);
}

main()
  .catch((error: unknown) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
