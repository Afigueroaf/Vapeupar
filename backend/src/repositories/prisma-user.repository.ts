import { getPrisma } from '../db/prisma.js';
import { isUuid } from '../db/uuid.js';
import { AdminUser, DuplicateUserError, UserRepository } from './user.repository.js';

/** `id` es el `sub` de Cognito, que es un UUID. */
export class PrismaUserRepository implements UserRepository {
  public async findById(id: string): Promise<AdminUser | undefined> {
    // Un `sub` que no es UUID no puede existir en la tabla, y consultarlo con
    // una columna `uuid` haría fallar la consulta en vez de devolver vacío.
    if (!isUuid(id)) return undefined;
    const row = await getPrisma().user.findUnique({ where: { id } });
    return row ?? undefined;
  }

  public async findByEmail(email: string): Promise<AdminUser | undefined> {
    const row = await getPrisma().user.findUnique({ where: { email } });
    return row ?? undefined;
  }

  public async create(user: AdminUser): Promise<AdminUser> {
    try {
      return await getPrisma().user.create({ data: user });
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
        throw new DuplicateUserError(user.email);
      }
      throw error;
    }
  }

  public async deactivate(id: string): Promise<AdminUser | undefined> {
    if (!isUuid(id)) return undefined;
    try {
      return await getPrisma().user.update({ where: { id }, data: { active: false } });
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2025') {
        return undefined;
      }
      throw error;
    }
  }
}
