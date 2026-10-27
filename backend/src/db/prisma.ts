import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Cliente de Prisma del runtime. Conecta con DATABASE_URL (rol vapeupar_app,
 * sin permisos de DDL); las migraciones usan otra credencial, ver
 * prisma.config.ts.
 *
 * Se crea bajo demanda: importar este módulo no abre conexiones, así que los
 * tests unitarios con repositorios en memoria no necesitan base de datos.
 */
let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!client) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Falta DATABASE_URL. Ejecuta `npm run infra:env-backend` y abre el túnel.');
    }
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}
