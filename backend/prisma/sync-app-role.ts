import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Habilita el login del rol `vapeupar_app` con la contraseña de Secrets Manager
 * (`vapeupar/<env>/rds-app`), que `npm run infra:env-backend` deja dentro de
 * DATABASE_URL.
 *
 * Se ejecuta con el usuario maestro (MIGRATE_DATABASE_URL) después de
 * `prisma migrate deploy`, y de nuevo si se rota la contraseña. La migración
 * crea el rol sin login porque no debe contener secretos.
 */
const ROLE = 'vapeupar_app';

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.MIGRATE_DATABASE_URL;
if (!appUrl || !adminUrl) {
  throw new Error('Faltan DATABASE_URL o MIGRATE_DATABASE_URL. Ejecuta `npm run infra:env-backend`.');
}

const app = new URL(appUrl);
if (decodeURIComponent(app.username) !== ROLE) {
  throw new Error(`DATABASE_URL debe usar el rol ${ROLE}, no "${decodeURIComponent(app.username)}".`);
}
const password = decodeURIComponent(app.password);

async function main(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });
  try {
    // ALTER ROLE no admite parámetros enlazados: la contraseña se cita en el
    // servidor con format(%L) y nunca se interpola en el texto de la consulta.
    const rows = await prisma.$queryRaw<{ stmt: string }[]>`
      SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', ${ROLE}::text, ${password}::text) AS stmt`;
    await prisma.$executeRawUnsafe(rows[0]!.stmt);
    console.log(`Rol ${ROLE}: login habilitado con la contraseña de Secrets Manager.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
