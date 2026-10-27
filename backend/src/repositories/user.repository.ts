/** Usuario de la consola. `id` es el `sub` de Cognito (ver `schema.prisma`). */
export interface AdminUser {
  id: string;
  email: string;
  role: 'owner' | 'operator';
  active: boolean;
}

/** Ya existe una fila con ese correo o ese `sub`. */
export class DuplicateUserError extends Error {
  constructor(public readonly email: string) {
    super(`Ya existe un usuario con el correo "${email}"`);
    this.name = 'DuplicateUserError';
  }
}

/**
 * Autorización de la consola. Cognito dice quién es el usuario; esta tabla dice
 * si puede entrar y con qué rol, así que un usuario del pool sin fila activa
 * aquí no tiene acceso (ADR-002, plan A4.1).
 */
export interface UserRepository {
  /** `undefined` si el `sub` no tiene fila. */
  findById(id: string): Promise<AdminUser | undefined>;
  findByEmail(email: string): Promise<AdminUser | undefined>;
  create(user: AdminUser): Promise<AdminUser>;
  /** `undefined` si no existe. Devuelve la fila ya desactivada. */
  deactivate(id: string): Promise<AdminUser | undefined>;
}
