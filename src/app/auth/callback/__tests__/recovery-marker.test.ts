import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** A-06: le marqueur de recuperation n'est pose qu'apres un jeton de recuperation valide. */

const verifyOtp = vi.fn();

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  hashEmail: () => 'h',
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { verifyOtp } }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/services/signup.service', () => ({ createSignupService: () => ({}) }));

import { GET } from '../route';
import { RECOVERY_MARKER_COOKIE, verifyRecoveryMarker } from '@/lib/auth/recovery-marker';

const ORIGINAL = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe('GET /auth/callback (recovery)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key';
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL;
  });

  it('pose un marqueur httpOnly lie au compte quand le jeton est valide', async () => {
    verifyOtp.mockResolvedValue({ data: { user: { id: 'u-7' } }, error: null });

    const res = await GET(
      new Request('https://attabl.com/auth/callback?token_hash=abc&type=recovery'),
    );

    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/reset-password');
    const cookie = res.cookies.get(RECOVERY_MARKER_COOKIE);
    expect(cookie?.value).toBeTruthy();
    expect(verifyRecoveryMarker(cookie?.value ?? '')).toBe('u-7');
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
  });

  it('TEMOIN: aucun marqueur quand le jeton est invalide', async () => {
    verifyOtp.mockResolvedValue({ data: null, error: { message: 'expired' } });

    const res = await GET(
      new Request('https://attabl.com/auth/callback?token_hash=abc&type=recovery'),
    );

    expect(new URL(res.headers.get('location') ?? '').searchParams.get('error')).toBe(
      'invalid_token',
    );
    expect(res.cookies.get(RECOVERY_MARKER_COOKIE)).toBeUndefined();
  });
});
