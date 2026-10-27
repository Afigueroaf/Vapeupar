import dotenv from 'dotenv';
import { z } from 'zod';
import { inviteUser } from '../src/services/auth.service.js';
import { PrismaUserRepository } from '../src/repositories/prisma-user.repository.js';
import { DuplicateUserError } from '../src/repositories/user.repository.js';
import { disconnectPrisma } from '../src/db/prisma.js';

/**
 * Invita al primer `owner`, que es el huevo y la gallina de la consola: la ruta
 * `POST /api/admin/users/invite` exige ser `owner` para invitar, así que el
 * primero tiene que entrar por aquí (plan A4.1).
 *
 *   npm run admin:invite -- correo@dominio.com [--role operator]
 *
 * Necesita credenciales de AWS y el túnel a la base abierto
 * (`npm run infra:db-tunnel`).
 */
const ArgsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['owner', 'operator']).default('owner')
});

function parseArgs(argv: string[]): z.infer<typeof ArgsSchema> {
  const positional = argv.filter(arg => !arg.startsWith('--'));
  const roleFlag = argv.find(arg => arg.startsWith('--role'));
  const role = roleFlag?.includes('=') ? roleFlag.split('=')[1] : argv[argv.indexOf(roleFlag ?? '') + 1];

  const parsed = ArgsSchema.safeParse({
    email: positional[0],
    role: roleFlag ? role : undefined
  });
  if (!parsed.success) {
    const detail = parsed.error.errors.map(e => `${e.path.join('.') || 'argumento'}: ${e.message}`).join('; ');
    throw new Error(`${detail}\nUso: npm run admin:invite -- correo@dominio.com [--role operator]`);
  }
  return parsed.data;
}

async function main(): Promise<void> {
  dotenv.config();
  const { email, role } = parseArgs(process.argv.slice(2));
  const users = new PrismaUserRepository();

  if (await users.findByEmail(email)) {
    throw new Error(`Ya existe un usuario con el correo ${email}`);
  }

  // Mismo orden que la ruta: Cognito primero, porque de ahí sale el `sub`.
  const invited = await inviteUser(email);
  const user = await users.create({ id: invited.sub, email, role, active: true });

  console.log(`Invitado ${user.email} con rol ${user.role}.`);
  console.log(`  sub (clave en la tabla User): ${user.id}`);
  console.log(`  usuario en el pool:           ${invited.username}`);
  console.log('Cognito le envió la contraseña temporal por correo; vence en 3 días.');
  console.log('En el primer inicio de sesión tendrá que definir una nueva (NEW_PASSWORD_REQUIRED).');
}

main()
  .catch((error: unknown) => {
    if (error instanceof DuplicateUserError) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
