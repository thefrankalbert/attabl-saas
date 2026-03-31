import { z } from 'zod';

/**
 * Zod schemas for authentication-related validation.
 * Used in /api/signup and /api/signup-oauth routes.
 */

export const signupSchema = z.object({
  restaurantName: z
    .string()
    .min(2, 'Le nom du restaurant doit contenir au moins 2 caractères')
    .max(100, 'Le nom du restaurant ne doit pas dépasser 100 caractères'),
  email: z.string().email('Email invalide'),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .max(100, 'Le mot de passe ne doit pas dépasser 100 caractères'),
  phone: z.string().max(20).optional(),
  plan: z.enum(['starter', 'pro', 'business']).optional(),
});

export const signupOAuthSchema = z.object({
  userId: z.string().uuid('User ID invalide'),
  email: z.string().email('Email invalide'),
  restaurantName: z
    .string()
    .min(2, 'Le nom du restaurant doit contenir au moins 2 caractères')
    .max(100, 'Le nom du restaurant ne doit pas dépasser 100 caractères'),
  phone: z.string().max(20).optional(),
  plan: z.enum(['starter', 'pro', 'business']).optional(),
});

export const resendConfirmationSchema = z.object({
  email: z.string().email('Email invalide'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email invalide'),
});

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Le mot de passe est requis').max(100),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type SignupOAuthInput = z.infer<typeof signupOAuthSchema>;
export type ResendConfirmationInput = z.infer<typeof resendConfirmationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
