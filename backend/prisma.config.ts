import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Configuración del CLI de Prisma (migraciones, generate, seed).
 *
 * El CLI usa MIGRATE_DATABASE_URL (usuario maestro): las migraciones necesitan
 * DDL. El backend en runtime usa DATABASE_URL (rol vapeupar_app, sin DDL), que
 * se lee en src/db/prisma.ts. Ambas las genera `npm run infra:env-backend`.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('MIGRATE_DATABASE_URL'),
  },
});
