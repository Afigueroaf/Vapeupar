import dotenv from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
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
 *   npm run db:count-template --workspace=backend
 *   npm run db:count-template --workspace=backend -- --out "%USERPROFILE%\Documents\conteo.csv"
 *
 * Sin `--out` escribe `backend/scripts/data/conteo-<fecha>.csv`, carpeta que
 * git ignora. La planilla lleva costos: se niega a escribirla en otro sitio del
 * repo y a sobrescribir un archivo existente (podría ser una planilla ya
 * rellenada) salvo con `--force`.
 *
 * Necesita `backend/.env` (`npm run infra:env-backend`) y el túnel abierto
 * (`npm run infra:db-tunnel`).
 */

const REPO_ROOT = resolve(__dirname, '../..');
const DATA_DIR = resolve(__dirname, 'data');

function flag(argv: string[], name: string): string | undefined {
  const inline = argv.find(a => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main(): Promise<void> {
  dotenv.config();
  const argv = process.argv.slice(2);
  if (argv.includes('--out') && !flag(argv, 'out')) throw new Error('--out necesita una ruta');
  const out = flag(argv, 'out');

  const target = out ? resolve(out) : resolve(DATA_DIR, `conteo-${today()}.csv`);
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
  if (!out) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(target, csv, 'utf8');

  console.log(`Planilla escrita en ${target}: ${rows} variantes activas.`);
  console.log('Rellena cantidad (entero, 0 si no hay), costoUnitario (pesos por unidad, obligatorio si se cuenta algo');
  console.log('y la variante tenía stock 0) y, si quieres, proveedor (nombre exacto de uno creado en /admin).');
  console.log('No cambies variantId, lineSlug ni variantSlug ni borres filas. Guarda como CSV y pasa el --dry-run.');
  console.log(`Dry-run: npm run db:import-stock --workspace=backend -- --file "${relative(process.cwd(), target)}" --user-email <owner> --batch <lote>`);
}

main()
  .catch((error: unknown) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
