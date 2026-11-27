import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMfaService } from '../mfa.service';
import { ServiceError } from '../errors';

const F_VERIFIED = { id: 'f-ok', factor_type: 'totp', status: 'verified' };
const F_PENDING = { id: 'f-new', factor_type: 'totp', status: 'unverified' };

function mockClient() {
  const mfa = {
    enroll: vi.fn(async () => ({
      data: { id: 'f-created', totp: { uri: 'otpauth://totp/x', secret: 'SECRET', qr_code: '' } },
      error: null,
    })),
    unenroll: vi.fn(async () => ({ data: {}, error: null })),
    challengeAndVerify: vi.fn(async () => ({ data: {}, error: null as unknown })),
  };
  return { mfa, client: { auth: { mfa } } as never };
}

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ServiceError);
    return (err as ServiceError).message;
  }
  throw new Error('aurait du echouer');
}

describe('createMfaService', () => {
  let m: ReturnType<typeof mockClient>;
  beforeEach(() => {
    m = mockClient();
  });

  describe('startEnrollment', () => {
    it('cree un facteur TOTP et rend uri + cle', async () => {
      const res = await createMfaService(m.client).startEnrollment({ factors: [] });
      expect(res).toEqual({ factorId: 'f-created', uri: 'otpauth://totp/x', secret: 'SECRET' });
      expect(m.mfa.enroll).toHaveBeenCalledWith(
        expect.objectContaining({ factorType: 'totp', issuer: 'ATTABL' }),
      );
    });

    it('retire d abord un essai jamais confirme', async () => {
      await createMfaService(m.client).startEnrollment({ factors: [F_PENDING] } as never);
      expect(m.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f-new' });
    });

    it('deja activee: refuse sans rien creer', async () => {
      expect(
        await reason(
          createMfaService(m.client).startEnrollment({ factors: [F_VERIFIED] } as never),
        ),
      ).toBe('alreadyEnabled');
      expect(m.mfa.enroll).not.toHaveBeenCalled();
    });

    it('TOTP desactive cote serveur Auth: unavailable', async () => {
      m.mfa.enroll.mockResolvedValueOnce({
        data: null,
        error: { code: 'mfa_totp_enroll_not_enabled' },
      } as never);
      expect(await reason(createMfaService(m.client).startEnrollment({ factors: [] }))).toBe(
        'unavailable',
      );
    });
  });

  describe('verifyCode', () => {
    it('code valide sur le facteur verifie du compte', async () => {
      await createMfaService(m.client).verifyCode({ factors: [F_VERIFIED] } as never, {
        code: '123456',
      });
      expect(m.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f-ok', code: '123456' });
    });

    it('activation: verifie le facteur demande s il appartient au compte', async () => {
      await createMfaService(m.client).verifyCode({ factors: [F_PENDING] } as never, {
        code: '123456',
        factorId: 'f-new',
      });
      expect(m.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f-new', code: '123456' });
    });

    it('facteur d un autre compte: refuse sans appeler le serveur Auth', async () => {
      expect(
        await reason(
          createMfaService(m.client).verifyCode({ factors: [F_PENDING] } as never, {
            code: '123456',
            factorId: 'f-autre-compte',
          }),
        ),
      ).toBe('noFactor');
      expect(m.mfa.challengeAndVerify).not.toHaveBeenCalled();
    });

    it('compte sans facteur: noFactor', async () => {
      expect(
        await reason(createMfaService(m.client).verifyCode({ factors: [] }, { code: '123456' })),
      ).toBe('noFactor');
    });

    it('code faux: invalidCode (jamais le texte brut du serveur)', async () => {
      m.mfa.challengeAndVerify.mockResolvedValueOnce({
        data: null as never,
        error: { code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' },
      });
      expect(
        await reason(
          createMfaService(m.client).verifyCode({ factors: [F_VERIFIED] } as never, {
            code: '000000',
          }),
        ),
      ).toBe('invalidCode');
    });

    it('defi expire: expired', async () => {
      m.mfa.challengeAndVerify.mockResolvedValueOnce({
        data: null as never,
        error: { code: 'mfa_challenge_expired' },
      });
      expect(
        await reason(
          createMfaService(m.client).verifyCode({ factors: [F_VERIFIED] } as never, {
            code: '000000',
          }),
        ),
      ).toBe('expired');
    });
  });

  describe('disable', () => {
    it('code valide puis retrait du facteur', async () => {
      await createMfaService(m.client).disable({ factors: [F_VERIFIED] } as never, '123456');
      expect(m.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f-ok', code: '123456' });
      expect(m.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f-ok' });
    });

    it('code faux: le facteur reste en place', async () => {
      m.mfa.challengeAndVerify.mockResolvedValueOnce({
        data: null as never,
        error: { code: 'mfa_verification_failed' },
      });
      expect(
        await reason(createMfaService(m.client).disable({ factors: [F_VERIFIED] } as never, '1')),
      ).toBe('invalidCode');
      expect(m.mfa.unenroll).not.toHaveBeenCalled();
    });

    it('rien a desactiver: noFactor', async () => {
      expect(await reason(createMfaService(m.client).disable({ factors: [] }, '123456'))).toBe(
        'noFactor',
      );
    });
  });

  it('status suit les facteurs verifies', () => {
    const svc = createMfaService(m.client);
    expect(svc.status({ factors: [F_VERIFIED] } as never)).toEqual({ enabled: true });
    expect(svc.status({ factors: [F_PENDING] } as never)).toEqual({ enabled: false });
  });
});
