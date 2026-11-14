import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A-09: le changement d'adresse d'un membre n'a lieu qu'apres confirmation par
 * la NOUVELLE adresse. Le jeton est signe, expire, et lie a l'adresse actuelle.
 */

const getUserById = vi.fn();
const updateUserById = vi.fn();
const mirrorUpdate = vi.fn();
const mirrorEq = vi.fn();

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/email.service', () => ({ sendWelcomeOnboardingEmail: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: (...a: unknown[]) => getUserById(...a),
        updateUserById: (...a: unknown[]) => updateUserById(...a),
      },
    },
    from: (table: string) => ({
      update: (payload: unknown) => {
        mirrorUpdate(table, payload);
        return { eq: (...a: unknown[]) => mirrorEq(...a) };
      },
    }),
  }),
}));

import { GET } from '../route';
import { signEmailChangeToken } from '@/lib/auth/email-change-token';

const ORIGINAL = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function suivre(token: string | null): Promise<URL> {
  const q = token === null ? '' : `token=${encodeURIComponent(token)}&`;
  const res = await GET(new Request(`https://attabl.com/auth/confirm?${q}type=email_change`));
  return new URL(res.headers.get('location') ?? '');
}

function validToken(over?: { fromEmail?: string }) {
  return signEmailChangeToken({
    userId: 'u-1',
    fromEmail: over?.fromEmail ?? 'ancien@resto.test',
    toEmail: 'nouveau@resto.test',
  });
}

describe('GET /auth/confirm (email_change)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key';
    getUserById.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'ancien@resto.test' } },
      error: null,
    });
    updateUserById.mockResolvedValue({ error: null });
    mirrorEq.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL;
  });

  it('change l adresse du compte (confirmee) et le miroir quand le lien est valide', async () => {
    const cible = await suivre(validToken());

    expect(cible.pathname).toBe('/login');
    expect(cible.searchParams.get('confirmed')).toBe('true');
    expect(updateUserById).toHaveBeenCalledWith('u-1', {
      email: 'nouveau@resto.test',
      email_confirm: true,
    });
    expect(mirrorUpdate).toHaveBeenCalledWith('admin_users', { email: 'nouveau@resto.test' });
    expect(mirrorEq).toHaveBeenCalledWith('user_id', 'u-1');
  });

  it('TEMOIN: un jeton falsifie ne change rien', async () => {
    const [payload] = validToken().split('.');
    const cible = await suivre(`${payload}.AAAA`);

    expect(cible.searchParams.get('error')).toBe('expired_link');
    expect(updateUserById).not.toHaveBeenCalled();
    expect(mirrorUpdate).not.toHaveBeenCalled();
  });

  it('TEMOIN: sans jeton, rien ne change', async () => {
    const cible = await suivre(null);

    expect(cible.searchParams.get('error')).toBe('expired_link');
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('TEMOIN: un lien perime (adresse deja changee depuis) ne change rien', async () => {
    getUserById.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'deja-change@resto.test' } },
      error: null,
    });

    const cible = await suivre(validToken());

    expect(cible.searchParams.get('error')).toBe('expired_link');
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('n ecrit pas le miroir quand le compte auth refuse la nouvelle adresse', async () => {
    updateUserById.mockResolvedValue({ error: { message: 'email exists' } });

    const cible = await suivre(validToken());

    expect(cible.searchParams.get('error')).toBe('auth_failed');
    expect(mirrorUpdate).not.toHaveBeenCalled();
  });
});
