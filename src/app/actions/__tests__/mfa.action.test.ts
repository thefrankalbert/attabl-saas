import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const etat = {
    adresse: { success: true, reset: 0 },
    paire: { success: true, reset: 0 },
    cles: [] as string[],
    user: null as null | { id: string; factors: unknown[] },
    verifyError: null as null | { code: string },
  };
  const challengeAndVerify = vi.fn(async () => ({ data: {}, error: etat.verifyError }));
  const unenroll = vi.fn(async () => ({ data: {}, error: null }));
  const enroll = vi.fn(async () => ({
    data: { id: 'f-created', totp: { uri: 'otpauth://totp/x', secret: 'SECRET', qr_code: '' } },
    error: null,
  }));
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  return { etat, challengeAndVerify, unenroll, enroll, logger };
});

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}));
vi.mock('@/lib/rate-limit', () => ({
  getClientIpFromHeaders: (hs: Headers) => hs.get('x-forwarded-for') ?? 'anonymous',
  loginAdresseLimiter: {
    check: vi.fn(async (k: string) => {
      h.etat.cles.push(k);
      return h.etat.adresse;
    }),
  },
  loginPaireLimiter: {
    check: vi.fn(async (k: string) => {
      h.etat.cles.push(k);
      return h.etat.paire;
    }),
  },
}));
vi.mock('@/lib/logger', () => ({ logger: h.logger }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: h.etat.user },
        error: h.etat.user ? null : { message: 'no session' },
      }),
      mfa: { challengeAndVerify: h.challengeAndVerify, unenroll: h.unenroll, enroll: h.enroll },
    },
  }),
}));

import {
  actionDisableMfa,
  actionGetMfaStatus,
  actionStartMfaEnrollment,
  actionVerifyMfaCode,
} from '../mfa';

const VERIFIED = { id: 'f-ok', factor_type: 'totp', status: 'verified' };

describe('actions de double authentification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.etat.adresse = { success: true, reset: 0 };
    h.etat.paire = { success: true, reset: 0 };
    h.etat.cles = [];
    h.etat.user = { id: 'user-1', factors: [VERIFIED] };
    h.etat.verifyError = null;
  });

  it('code valide: succes', async () => {
    expect(await actionVerifyMfaCode({ code: '123 456' })).toEqual({ success: true });
    expect(h.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f-ok', code: '123456' });
  });

  it('code invalide (refuse par le serveur Auth): invalidCode', async () => {
    h.etat.verifyError = { code: 'mfa_verification_failed' };
    expect(await actionVerifyMfaCode({ code: '000000' })).toEqual({
      success: false,
      error: 'invalidCode',
    });
  });

  it('code mal forme: invalidInput, sans appel au serveur Auth', async () => {
    expect(await actionVerifyMfaCode({ code: '12ab' })).toEqual({
      success: false,
      error: 'invalidInput',
    });
    expect(h.challengeAndVerify).not.toHaveBeenCalled();
  });

  it('limiteur (compte, adresse) epuise: rateLimited, sans tester le code', async () => {
    h.etat.paire = { success: false, reset: 0 };
    expect(await actionVerifyMfaCode({ code: '123456' })).toEqual({
      success: false,
      error: 'rateLimited',
    });
    expect(h.challengeAndVerify).not.toHaveBeenCalled();
    // Budget propre a la double authentification, par compte ET adresse.
    expect(h.etat.cles).toContain('mfa:user-1:203.0.113.7');
  });

  it('limiteur par adresse epuise: rateLimited avant toute lecture', async () => {
    h.etat.adresse = { success: false, reset: 0 };
    expect(await actionVerifyMfaCode({ code: '123456' })).toEqual({
      success: false,
      error: 'rateLimited',
    });
    expect(h.challengeAndVerify).not.toHaveBeenCalled();
  });

  it('session expiree: unauthenticated', async () => {
    h.etat.user = null;
    expect(await actionVerifyMfaCode({ code: '123456' })).toEqual({
      success: false,
      error: 'unauthenticated',
    });
  });

  it('compte sans facteur: noFactor', async () => {
    h.etat.user = { id: 'user-1', factors: [] };
    expect(await actionVerifyMfaCode({ code: '123456' })).toEqual({
      success: false,
      error: 'noFactor',
    });
  });

  it('desactivation: code faux refuse, facteur garde', async () => {
    h.etat.verifyError = { code: 'mfa_verification_failed' };
    expect(await actionDisableMfa({ code: '000000' })).toEqual({
      success: false,
      error: 'invalidCode',
    });
    expect(h.unenroll).not.toHaveBeenCalled();
  });

  it('desactivation: code valide retire le facteur', async () => {
    expect(await actionDisableMfa({ code: '123456' })).toEqual({ success: true });
    expect(h.unenroll).toHaveBeenCalledWith({ factorId: 'f-ok' });
  });

  it('activation: rend uri et cle, sans les journaliser', async () => {
    h.etat.user = { id: 'user-1', factors: [] };
    const res = await actionStartMfaEnrollment();
    expect(res).toEqual({
      success: true,
      factorId: 'f-created',
      uri: 'otpauth://totp/x',
      secret: 'SECRET',
    });
    const journal = JSON.stringify([
      h.logger.info.mock.calls,
      h.logger.warn.mock.calls,
      h.logger.error.mock.calls,
    ]);
    expect(journal).not.toContain('SECRET');
    expect(journal).not.toContain('otpauth');
  });

  it('etat: active si facteur verifie', async () => {
    expect(await actionGetMfaStatus()).toEqual({ success: true, enabled: true });
    h.etat.user = null;
    expect(await actionGetMfaStatus()).toEqual({ success: false, error: 'unauthenticated' });
  });
});
