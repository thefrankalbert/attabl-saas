import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signEmailChangeToken, verifyEmailChangeToken } from '../email-change-token';

const CLAIMS = { userId: 'u-1', fromEmail: 'Old@Resto.test', toEmail: 'new@resto.test' };
const ORIGINAL = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe('email change token (A-09)', () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key';
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL;
  });

  it('accepte un jeton valide et normalise les adresses', () => {
    const token = signEmailChangeToken(CLAIMS);
    expect(verifyEmailChangeToken(token)).toEqual({
      userId: 'u-1',
      fromEmail: 'old@resto.test',
      toEmail: 'new@resto.test',
    });
  });

  it('refuse un jeton dont la nouvelle adresse a ete reecrite (signature invalide)', () => {
    const token = signEmailChangeToken(CLAIMS);
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...CLAIMS, toEmail: 'pirate@evil.test', exp: Date.now() + 1e9 }),
    ).toString('base64url');
    expect(verifyEmailChangeToken(`${forged}.${signature}`)).toBeNull();
  });

  it('refuse un jeton expire', () => {
    const token = signEmailChangeToken(CLAIMS, Date.now() - 25 * 60 * 60 * 1000);
    expect(verifyEmailChangeToken(token)).toBeNull();
  });

  it('refuse un jeton signe avec un autre secret', () => {
    const token = signEmailChangeToken(CLAIMS);
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'another-secret';
    expect(verifyEmailChangeToken(token)).toBeNull();
  });

  it('refuse les formes invalides sans lever', () => {
    expect(verifyEmailChangeToken('')).toBeNull();
    expect(verifyEmailChangeToken('abc')).toBeNull();
    expect(verifyEmailChangeToken('a.b.c')).toBeNull();
    expect(verifyEmailChangeToken('!!!.???')).toBeNull();
  });
});
