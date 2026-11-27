import { describe, it, expect, vi } from 'vitest';
import {
  currentAssuranceLevel,
  decideMfaGate,
  decideMfaPage,
  hasVerifiedFactor,
  type AssuranceLevel,
} from '../mfa-assurance';

type Claims = Parameters<typeof currentAssuranceLevel>[0];

function clientWithClaims(result: unknown): Claims {
  return { auth: { getClaims: vi.fn(async () => result) } } as unknown as Claims;
}

describe('hasVerifiedFactor', () => {
  it('seul un facteur VERIFIE compte', () => {
    expect(hasVerifiedFactor({ factors: [] })).toBe(false);
    expect(hasVerifiedFactor(null)).toBe(false);
    expect(hasVerifiedFactor({ factors: undefined })).toBe(false);
    expect(hasVerifiedFactor({ factors: [{ status: 'unverified' }] } as never)).toBe(false);
    expect(hasVerifiedFactor({ factors: [{ status: 'verified' }] } as never)).toBe(true);
  });
});

describe('currentAssuranceLevel', () => {
  it('lit aal dans les revendications verifiees', async () => {
    expect(
      await currentAssuranceLevel(
        clientWithClaims({ data: { claims: { aal: 'aal2' } }, error: null }),
      ),
    ).toBe('aal2');
    expect(
      await currentAssuranceLevel(
        clientWithClaims({ data: { claims: { aal: 'aal1' } }, error: null }),
      ),
    ).toBe('aal1');
  });

  it('jeton refuse par le serveur (signature, expiration): null, jamais aal2', async () => {
    expect(
      await currentAssuranceLevel(clientWithClaims({ data: null, error: { message: 'bad jwt' } })),
    ).toBeNull();
  });

  it('valeur inattendue ou exception: null', async () => {
    expect(
      await currentAssuranceLevel(
        clientWithClaims({ data: { claims: { aal: 'aal3' } }, error: null }),
      ),
    ).toBeNull();
    const throwing = {
      auth: {
        getClaims: vi.fn(async () => {
          throw new Error('reseau');
        }),
      },
    } as unknown as Claims;
    expect(await currentAssuranceLevel(throwing)).toBeNull();
  });
});

describe('decideMfaGate', () => {
  it('facteur + aal1 (ou niveau illisible): code exige', () => {
    expect(decideMfaGate({ hasFactor: true, level: 'aal1', requireEnrollment: false })).toBe(
      'challenge',
    );
    expect(decideMfaGate({ hasFactor: true, level: null, requireEnrollment: false })).toBe(
      'challenge',
    );
  });

  it('facteur + aal2: passe', () => {
    expect(decideMfaGate({ hasFactor: true, level: 'aal2', requireEnrollment: true })).toBe('ok');
  });

  it('sans facteur: activation si exigee (super admin), sinon passe', () => {
    expect(decideMfaGate({ hasFactor: false, level: 'aal1', requireEnrollment: true })).toBe(
      'enroll',
    );
    expect(decideMfaGate({ hasFactor: false, level: 'aal1', requireEnrollment: false })).toBe('ok');
  });

  it('aal2 sans facteur (facteur retire depuis) ne suffit pas au super admin', () => {
    expect(decideMfaGate({ hasFactor: false, level: 'aal2', requireEnrollment: true })).toBe(
      'enroll',
    );
  });
});

describe('decideMfaPage', () => {
  it('session expiree: connexion', () => {
    expect(
      decideMfaPage({ signedIn: false, hasFactor: false, level: null, mustEnroll: false }),
    ).toBe('login');
  });

  it('compte sans facteur et non super admin: continue (pas de page vide)', () => {
    expect(
      decideMfaPage({ signedIn: true, hasFactor: false, level: 'aal1', mustEnroll: false }),
    ).toBe('continue');
  });

  it('super admin sans facteur: activation', () => {
    expect(
      decideMfaPage({ signedIn: true, hasFactor: false, level: 'aal1', mustEnroll: true }),
    ).toBe('enroll');
  });

  it('facteur: code en aal1, continue en aal2', () => {
    expect(
      decideMfaPage({ signedIn: true, hasFactor: true, level: 'aal1', mustEnroll: false }),
    ).toBe('challenge');
    expect(
      decideMfaPage({ signedIn: true, hasFactor: true, level: 'aal2', mustEnroll: true }),
    ).toBe('continue');
  });

  /**
   * Pas de boucle: chaque fois que /auth/mfa renvoie vers la destination
   * (`continue`), la garde de cette destination laisse passer (`ok`), quel que
   * soit le type de page (super admin ou non). Exhaustif sur tous les etats.
   */
  it('jamais de boucle entre /auth/mfa et une page gardee', () => {
    const levels: Array<AssuranceLevel | null> = [null, 'aal1', 'aal2'];
    for (const hasFactor of [true, false]) {
      for (const level of levels) {
        for (const superAdmin of [true, false]) {
          const page = decideMfaPage({ signedIn: true, hasFactor, level, mustEnroll: superAdmin });
          if (page !== 'continue') continue;
          const gate = decideMfaGate({ hasFactor, level, requireEnrollment: superAdmin });
          expect({ hasFactor, level, superAdmin, gate }).toEqual({
            hasFactor,
            level,
            superAdmin,
            gate: 'ok',
          });
        }
      }
    }
  });
});
