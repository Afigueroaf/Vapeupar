import { z } from 'zod';

/**
 * Esquemas de la superficie autenticada (plan A4.2). Nada que venga del cliente
 * entra a un servicio sin pasar por aquí.
 */

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * La longitud mínima es la del pool (`passwordPolicy.minLength: 12`). El resto
 * de la política (mayúscula, minúscula, dígito) la aplica Cognito, que es quien
 * manda: duplicarla aquí sería tener dos fuentes de verdad.
 */
const password = z.string().min(12).max(256);

export const LoginSchema = z.object({
  email,
  password: z.string().min(1).max(256)
});

export const NewPasswordSchema = z.object({
  email,
  password
});

export const InviteSchema = z.object({
  email,
  role: z.enum(['owner', 'operator']).default('operator')
});

export const UserIdSchema = z.object({
  id: z.uuid()
});
