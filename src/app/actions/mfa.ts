'use server';

import { headers } from 'next/headers';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getClientIpFromHeaders, loginAdresseLimiter, loginPaireLimiter } from '@/lib/rate-limit';
import { mfaDisableSchema, mfaVerifySchema } from '@/lib/validations/mfa.schema';
import {
  createMfaService,
  isMfaErrorCode,
  type MfaEnrollment,
  type MfaErrorCode,
} from '@/services/mfa.service';
import { ServiceError } from '@/services/errors';
import { logger } from '@/lib/logger';

/**
 * Double authentification (audit K6.13): activation, code, desactivation.
 *
 * Ordre de chaque action: limite par adresse -> Zod -> `auth.getUser()` ->
 * limite par (compte, adresse) -> service. Le client n'envoie qu'un code (et,
 * a l'activation, l'identifiant du facteur qu'il vient de recevoir, que le
 * service verifie comme appartenant au compte). Aucun code ni secret n'est
 * journalise.
 *
 * Les limiteurs sont ceux de la connexion (fichier protege, reutilise tel
 * quel): 200 essais / 15 min par adresse, 10 / 15 min par couple
 * (compte, adresse), fermes en cas de panne de Redis. La cle du couple porte
 * le prefixe `mfa:` pour ne pas partager le budget du mot de passe.
 */
export type MfaActionError = MfaErrorCode | 'rateLimited' | 'invalidInput' | 'unauthenticated';

type Failure = { success: false; error: MfaActionError };

interface Context {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
}

async function guard(): Promise<{ adresse: string } | Failure> {
  const adresse = getClientIpFromHeaders(await headers());
  const etat = await loginAdresseLimiter.check(adresse);
  if (!etat.success) return { success: false, error: 'rateLimited' };
  return { adresse };
}

async function authenticate(adresse: string): Promise<Context | Failure> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { success: false, error: 'unauthenticated' };
  const etat = await loginPaireLimiter.check(`mfa:${user.id}:${adresse}`);
  if (!etat.success) return { success: false, error: 'rateLimited' };
  return { supabase, user };
}

function failureFrom(err: unknown, action: string, userId: string): Failure {
  if (err instanceof ServiceError && isMfaErrorCode(err.message)) {
    if (err.message === 'failed') logger.error('MFA action failed', { action, userId });
    return { success: false, error: err.message };
  }
  logger.error('MFA action error', err, { action, userId });
  return { success: false, error: 'failed' };
}

export async function actionGetMfaStatus(): Promise<{ success: true; enabled: boolean } | Failure> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { success: false, error: 'unauthenticated' };
  return { success: true, enabled: createMfaService(supabase).status(user).enabled };
}

export async function actionStartMfaEnrollment(): Promise<
  ({ success: true } & MfaEnrollment) | Failure
> {
  const g = await guard();
  if ('success' in g) return g;
  const ctx = await authenticate(g.adresse);
  if ('success' in ctx) return ctx;
  try {
    const enrollment = await createMfaService(ctx.supabase).startEnrollment(ctx.user);
    return { success: true, ...enrollment };
  } catch (err) {
    return failureFrom(err, 'enroll', ctx.user.id);
  }
}

export async function actionVerifyMfaCode(input: unknown): Promise<{ success: true } | Failure> {
  const g = await guard();
  if ('success' in g) return g;
  const parsed = mfaVerifySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'invalidInput' };
  const ctx = await authenticate(g.adresse);
  if ('success' in ctx) return ctx;
  try {
    await createMfaService(ctx.supabase).verifyCode(ctx.user, parsed.data);
    logger.info('MFA code verified', {
      userId: ctx.user.id,
      enrollment: parsed.data.factorId !== undefined,
    });
    return { success: true };
  } catch (err) {
    return failureFrom(err, 'verify', ctx.user.id);
  }
}

export async function actionDisableMfa(input: unknown): Promise<{ success: true } | Failure> {
  const g = await guard();
  if ('success' in g) return g;
  const parsed = mfaDisableSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'invalidInput' };
  const ctx = await authenticate(g.adresse);
  if ('success' in ctx) return ctx;
  try {
    await createMfaService(ctx.supabase).disable(ctx.user, parsed.data.code);
    logger.info('MFA disabled', { userId: ctx.user.id });
    return { success: true };
  } catch (err) {
    return failureFrom(err, 'disable', ctx.user.id);
  }
}
