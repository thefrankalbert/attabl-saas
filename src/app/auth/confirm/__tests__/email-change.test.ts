import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A-09: une etape du changement d'adresse ne s'applique que par POST. Un GET
 * (scanner de courriel, apercu de lien) n'a aucun effet. L'etat est relu a
 * chaque etape (voir email-change.service.test.ts).
 */

const confirmStep = vi.fn();
const limiterCheck = vi.fn();

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));
vi.mock('@/lib/rate-limit', () => ({
  adminPasswordResetLinkLimiter: { check: (...a: unknown[]) => limiterCheck(...a) },
}));
vi.mock('@/services/email.service', () => ({ sendWelcomeOnboardingEmail: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/services/email-change.service', () => ({
  createEmailChangeService: () => ({ confirmStep: (...a: unknown[]) => confirmStep(...a) }),
}));

import { GET, POST } from '../route';
import { signEmailChangeToken, type EmailChangeClaims } from '@/lib/auth/email-change-token';

const ORIGINAL = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLAIMS: EmailChangeClaims = {
  userId: 'u-1',
  fromEmail: 'ancien@resto.test',
  toEmail: 'nouveau@resto.test',
  tenantId: 't-1',
  requesterId: 'r-1',
  nonce: 'n-1',
  step: 'new',
};

async function poster(token: string | null): Promise<URL> {
  const body = new FormData();
  if (token !== null) body.set('token', token);
  const res = await POST(new Request('https://attabl.com/auth/confirm', { method: 'POST', body }));
  expect(res.status).toBe(303);
  return new URL(res.headers.get('location') ?? '');
}

describe('POST /auth/confirm (changement d adresse)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key';
    limiterCheck.mockResolvedValue({ success: true });
    confirmStep.mockResolvedValue('applied');
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL;
  });

  it('applique l etape et renvoie a la connexion quand le changement est applique', async () => {
    const cible = await poster(signEmailChangeToken(CLAIMS));

    expect(cible.pathname).toBe('/login');
    expect(cible.searchParams.get('confirmed')).toBe('true');
    expect(confirmStep).toHaveBeenCalledWith(CLAIMS);
  });

  it('etape current: renvoie vers la page de remerciement une fois la nouvelle adresse prevenue', async () => {
    confirmStep.mockResolvedValue('new_address_notified');

    const cible = await poster(signEmailChangeToken({ ...CLAIMS, step: 'current' }));

    expect(cible.pathname).toBe('/auth/confirm-email-change');
    expect(cible.searchParams.get('done')).toBe('current');
    expect(limiterCheck).toHaveBeenCalledWith('email-change-step:u-1');
  });

  it('TEMOIN: un GET n applique rien (scanner de courriel)', async () => {
    const token = signEmailChangeToken(CLAIMS);
    await GET(
      new Request(
        `https://attabl.com/auth/confirm?token=${encodeURIComponent(token)}&type=email_change`,
      ),
    );

    expect(confirmStep).not.toHaveBeenCalled();
  });

  it('TEMOIN: un jeton falsifie ou absent ne change rien', async () => {
    const [payload] = signEmailChangeToken(CLAIMS).split('.');
    expect((await poster(`${payload}.AAAA`)).searchParams.get('error')).toBe('expired_link');
    expect((await poster(null)).searchParams.get('error')).toBe('expired_link');
    expect(confirmStep).not.toHaveBeenCalled();
  });

  it('secret serveur absent: page d erreur propre, pas de 500', async () => {
    const token = signEmailChangeToken(CLAIMS);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const cible = await poster(token);

    expect(cible.searchParams.get('error')).toBe('auth_failed');
    expect(confirmStep).not.toHaveBeenCalled();
  });

  it('refus du service: aucune confirmation affichee', async () => {
    confirmStep.mockResolvedValue('refused');
    expect((await poster(signEmailChangeToken(CLAIMS))).searchParams.get('error')).toBe(
      'auth_failed',
    );
    confirmStep.mockResolvedValue('expired');
    expect((await poster(signEmailChangeToken(CLAIMS))).searchParams.get('error')).toBe(
      'expired_link',
    );
  });

  it('l etape current est bornee: au-dela du quota, aucune etape n est jouee', async () => {
    limiterCheck.mockResolvedValue({ success: false });

    const cible = await poster(signEmailChangeToken({ ...CLAIMS, step: 'current' }));

    expect(cible.searchParams.get('error')).toBe('auth_failed');
    expect(confirmStep).not.toHaveBeenCalled();
  });
});
