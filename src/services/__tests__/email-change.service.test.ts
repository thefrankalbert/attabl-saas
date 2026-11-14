import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A-09 (contre-audit M1): chaque etape relit l'etat. Un jeton emis avant un
 * retrait de droits, un changement de perimetre ou une nouvelle demande ne doit
 * rien appliquer.
 */

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const sendNew = vi.fn();
vi.mock('@/services/email.service', () => ({
  sendEmailChangeConfirmationEmail: (...a: unknown[]) => sendNew(...a),
}));
const scope = vi.fn();
vi.mock('@/lib/auth/target-account-scope', () => ({
  checkTargetAccountScope: (...a: unknown[]) => scope(...a),
}));

import { createEmailChangeService } from '../email-change.service';
import {
  signEmailChangeToken,
  verifyEmailChangeToken,
  type EmailChangeClaims,
} from '@/lib/auth/email-change-token';

const ORIGINAL = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLAIMS: EmailChangeClaims = {
  userId: 'u-1',
  fromEmail: 'ancien@resto.test',
  toEmail: 'nouveau@resto.test',
  tenantId: 't-1',
  requesterId: 'r-1',
  nonce: 'n-1',
  step: 'current',
};

interface World {
  authEmail: string;
  nonce: string | undefined;
  requester: { role: string; is_active: boolean } | null;
  target: { role: string } | null;
  mirrorRows: { id: string }[];
  mirrorError: boolean;
  updateError: boolean;
}

let world: World;
const updateUserById = vi.fn();
const mirrorUpdate = vi.fn();
const mirrorEqs: Array<[string, unknown]> = [];

function client(): SupabaseClient {
  return {
    auth: {
      admin: {
        getUserById: async () => ({
          data: {
            user: { email: world.authEmail, app_metadata: { email_change_nonce: world.nonce } },
          },
          error: null,
        }),
        updateUserById: (...a: unknown[]) => {
          updateUserById(...a);
          return Promise.resolve({ error: world.updateError ? { message: 'x' } : null });
        },
      },
    },
    from: () => {
      const readChain = (row: unknown) => {
        const c: Record<string, unknown> = {};
        c.select = () => c;
        c.eq = () => c;
        c.is = () => c;
        c.maybeSingle = async () => ({ data: row, error: null });
        return c;
      };
      return {
        select: (cols: string) => {
          // requester: 'role, is_active'; target: 'role'
          return readChain(cols.includes('is_active') ? world.requester : world.target);
        },
        update: (payload: unknown) => {
          mirrorUpdate(payload);
          const c: Record<string, unknown> = {};
          c.eq = (col: string, val: unknown) => {
            mirrorEqs.push([col, val]);
            return c;
          };
          c.select = async () => ({
            data: world.mirrorRows,
            error: world.mirrorError ? { message: 'x' } : null,
          });
          return c;
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe('createEmailChangeService.confirmStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mirrorEqs.length = 0;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key';
    world = {
      authEmail: 'ancien@resto.test',
      nonce: 'n-1',
      requester: { role: 'owner', is_active: true },
      target: { role: 'manager' },
      mirrorRows: [{ id: 'row-1' }],
      mirrorError: false,
      updateError: false,
    };
    scope.mockResolvedValue({ allowed: true });
    sendNew.mockResolvedValue(true);
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL;
  });

  it('etape current: envoie a la NOUVELLE adresse un lien d etape new, sans rien ecrire', async () => {
    const out = await createEmailChangeService(client()).confirmStep(CLAIMS);

    expect(out).toBe('new_address_notified');
    expect(sendNew).toHaveBeenCalledTimes(1);
    const [to, data] = sendNew.mock.calls[0] as [string, { confirmUrl: string }];
    expect(to).toBe('nouveau@resto.test');
    const claims = verifyEmailChangeToken(new URL(data.confirmUrl).searchParams.get('token') ?? '');
    expect(claims).toMatchObject({ step: 'new', nonce: 'n-1', tenantId: 't-1' });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(mirrorUpdate).not.toHaveBeenCalled();
  });

  it('etape new: applique l adresse confirmee, efface le nonce, et borne le miroir au restaurant', async () => {
    const out = await createEmailChangeService(client()).confirmStep({ ...CLAIMS, step: 'new' });

    expect(out).toBe('applied');
    expect(updateUserById).toHaveBeenCalledWith('u-1', {
      email: 'nouveau@resto.test',
      email_confirm: true,
      app_metadata: { email_change_nonce: null },
    });
    expect(mirrorUpdate).toHaveBeenCalledWith({ email: 'nouveau@resto.test' });
    expect(mirrorEqs).toContainEqual(['tenant_id', 't-1']);
    expect(mirrorEqs).toContainEqual(['user_id', 'u-1']);
  });

  it.each([
    ['adresse deja changee', () => (world.authEmail = 'autre@resto.test'), 'expired'],
    ['demande remplacee (nonce different)', () => (world.nonce = 'n-2'), 'expired'],
    ['demande jamais enregistree (pas de nonce)', () => (world.nonce = undefined), 'expired'],
    [
      'demandeur desactive',
      () => (world.requester = { role: 'owner', is_active: false }),
      'refused',
    ],
    ['demandeur retire', () => (world.requester = null), 'refused'],
    [
      'demandeur retrograde',
      () => (world.requester = { role: 'waiter', is_active: true }),
      'refused',
    ],
    ['cible devenue plus haut placee', () => (world.target = { role: 'owner' }), 'refused'],
    ['cible retiree du restaurant', () => (world.target = null), 'refused'],
  ])('TEMOIN: %s -> rien n est applique', async (_label, mutate, expected) => {
    mutate();

    for (const step of ['current', 'new'] as const) {
      const out = await createEmailChangeService(client()).confirmStep({ ...CLAIMS, step });
      expect(out).toBe(expected);
    }
    expect(updateUserById).not.toHaveBeenCalled();
    expect(sendNew).not.toHaveBeenCalled();
    expect(mirrorUpdate).not.toHaveBeenCalled();
  });

  it('TEMOIN: compte devenu partage avec un autre restaurant -> refus (garde de perimetre)', async () => {
    scope.mockResolvedValue({ allowed: false, reason: 'cross_tenant' });

    const out = await createEmailChangeService(client()).confirmStep({ ...CLAIMS, step: 'new' });

    expect(out).toBe('refused');
    expect(scope).toHaveBeenCalledWith(expect.anything(), 'u-1', 't-1');
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('miroir non ecrit: restaure l adresse d origine et ne confirme rien', async () => {
    world.mirrorRows = [];

    const out = await createEmailChangeService(client()).confirmStep({ ...CLAIMS, step: 'new' });

    expect(out).toBe('failed');
    expect(updateUserById).toHaveBeenLastCalledWith('u-1', {
      email: 'ancien@resto.test',
      email_confirm: true,
    });
  });

  it('erreur du compte auth a l application: echec sans ecrire le miroir', async () => {
    world.updateError = true;

    const out = await createEmailChangeService(client()).confirmStep({ ...CLAIMS, step: 'new' });

    expect(out).toBe('failed');
    expect(mirrorUpdate).not.toHaveBeenCalled();
  });

  it('echec d envoi a la nouvelle adresse: echec', async () => {
    sendNew.mockResolvedValue(false);
    expect(await createEmailChangeService(client()).confirmStep(CLAIMS)).toBe('failed');
  });

  it('un jeton signe est bien relu avec les memes revendications', () => {
    const token = signEmailChangeToken(CLAIMS);
    expect(verifyEmailChangeToken(token)).toEqual(CLAIMS);
  });
});
