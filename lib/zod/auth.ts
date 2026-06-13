/**
 * Zod schemas for the auth surface (login / signup).
 *
 * V1 uses email + password via Supabase Auth (signInWithPassword / signUp).
 * Password recovery is via resetPasswordForEmail → /reset-password.
 *
 * Password min length 8 is stricter than Supabase's default 6. Confirmation
 * email is disabled in the Supabase project for internal beta — flip back on
 * before GA (see IMPLEMENTATION.md GA prereqs).
 */
import { z } from 'zod';

export const Email = z.string().trim().toLowerCase().email();

export const Password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

export const LoginWithPassword = z.object({
  email: Email,
  password: Password,
});

export const Role = z.enum(['agent', 'buyer']);
export type Role = z.infer<typeof Role>;

export const SignupWithPassword = z
  .object({
    email: Email,
    password: Password,
    confirm: Password,
    role: Role,
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ['confirm'],
  });
