import dotenv from 'dotenv';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rejectOutputPath } from '../src/catalog/initial-count.js';
import { disconnectPrisma } from '../src/db/prisma.js';
import { PrismaInitialCountSource } from '../src/repositories/prisma-initial-count.repository.js';
import { PrismaStockRepository } from '../src/repositories/prisma-stock.repository.js';
import { PrismaUserRepository } from '../src/repositories/prisma-user.repository.js';
import { InitialCountService } from '../src/services/initial-count.service.js';
import { StockService } from '../src/services/stock.service.js';

/**
 * Genera la planilla del conteo físico inicial: una fila por variante activa,
 * con `cantidad`, `costoUnitario` y `proveedor` vacíos para que el dueño los
 * rellene en Excel (item `carga-datos-reales`). Solo lee la base.
 *
 *   npm run db:count-template --workspace=backend -- --out ../../conteo-2026-11.csv
 *
 * npm ejecuta el script desde `backend/`, así que `../../` es la carpeta que
 * contiene el repositorio. La planilla lleva costos: se niega a escribirla
 * dentro del repo (salvo en `backend/scripts/data/`, ignorada por git) y a
 * sobrescribir un archivo existente (podría ser una planilla ya rellenada)
 * salvo con `--force`.
 *
 * Necesita `backend/.env` (`npm run infra:env-backend`) y el túnel abierto
 * (`npm run infra:db-tunnel`).
 */

const REPO_ROOT = resolve(__dirname, '../..');
const USAGE = 'Uso: npm run db:count-template --workspace=backend -- --out ../../conteo-2026-11.csv [--force]';

function flag(argv: string[], name: string): string | undefined {
  const inline = argv.find(a => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  dotenv.config();
  const argv = process.argv.slice(2);
  const out = flag(argv, 'out');
  if (!out || out.startsWith('--')) throw new Error(`Falta --out.\n${USAGE}`);

  const target = resolve(out);
  const rejected = rejectOutputPath(target, REPO_ROOT);
  if (rejected) throw new Error(rejected);
  if (existsSync(target) && !argv.includes('--force')) {
    throw new Error(`${target} ya existe y podría ser una planilla rellenada; usa otro nombre o --force`);
  }

  const stockRepository = new PrismaStockRepository();
  const service = new InitialCountService(
    new PrismaInitialCountSource(),
    stockRepository,
    new StockService(stockRepository),
    new PrismaUserRepository()
  );
  const { csv, rows } = await service.exportTemplate();
  writeFileSync(target, csv, 'utf8');

  console.log(`Planilla escrita en ${target}: ${rows} variantes activas.`);
  console.log('Rellena cantidad (entero, 0 si no hay), costoUnitario (pesos por unidad, obligatorio si se cuenta algo');
  console.log('y la variante tenía stock 0) y, si quieres, proveedor (nombre exacto de uno creado en /admin).');
  console.log('No cambies variantId, lineSlug ni variantSlug ni borres filas. Guarda como CSV y pasa el --dry-run.');
}

main()
  .catch((error: unknown) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
