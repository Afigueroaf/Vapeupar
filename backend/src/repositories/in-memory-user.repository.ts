import { AdminUser, DuplicateUserError, UserRepository } from './user.repository.js';

/** Implementación para tests. Las filas se copian al entrar y al salir. */
export class InMemoryUserRepository implements UserRepository {
  private readonly rows = new Map<string, AdminUser>();

  constructor(seed: AdminUser[] = []) {
    for (const user of seed) this.rows.set(user.id, { ...user });
  }

  public async findById(id: string): Promise<AdminUser | undefined> {
    const row = this.rows.get(id);
    return row ? { ...row } : undefined;
  }

  public async findByEmail(email: string): Promise<AdminUser | undefined> {
    const row = [...this.rows.values()].find(u => u.email === email);
    return row ? { ...row } : undefined;
  }

  public async create(user: AdminUser): Promise<AdminUser> {
    if (this.rows.has(user.id) || await this.findByEmail(user.email)) {
      throw new DuplicateUserError(user.email);
    }
    this.rows.set(user.id, { ...user });
    return { ...user };
  }

  public async deactivate(id: string): Promise<AdminUser | undefined> {
    const row = this.rows.get(id);
    if (!row) return undefined;
    row.active = false;
    return { ...row };
  }
}
