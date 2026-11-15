import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signRecoveryMarker, verifyRecoveryMarker } from '../recovery-marker';

const ORIGINAL = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe('recovery marker (A-06)', () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key';
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL;
  });

  it('rend le compte du marqueur quand il est valide', () => {
    expect(verifyRecoveryMarker(signRecoveryMarker('u-1'))).toBe('u-1');
  });

  it('refuse un marqueur expire (15 minutes)', () => {
    const old = signRecoveryMarker('u-1', Date.now() - 16 * 60 * 1000);
    expect(verifyRecoveryMarker(old)).toBeNull();
  });

  it('refuse un marqueur falsifie, mal forme, ou signe avec un autre secret', () => {
    const token = signRecoveryMarker('u-1');
    const [payload] = token.split('.');
    expect(verifyRecoveryMarker(`${payload}.AAAA`)).toBeNull();
    expect(verifyRecoveryMarker('abc')).toBeNull();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'other';
    expect(verifyRecoveryMarker(token)).toBeNull();
  });

  it('un jeton de changement d adresse ne vaut pas marqueur (etiquettes distinctes)', async () => {
    const { signEmailChangeToken } = await import('../email-change-token');
    const t = signEmailChangeToken({
      userId: 'u-1',
      fromEmail: 'a@b.test',
      toEmail: 'c@d.test',
      tenantId: 't',
      requesterId: 'r',
      nonce: 'n',
      step: 'current',
    });
    expect(verifyRecoveryMarker(t)).toBeNull();
  });

  it('ne leve pas quand le secret serveur manque', () => {
    const token = signRecoveryMarker('u-1');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(verifyRecoveryMarker(token)).toBeNull();
  });
});
