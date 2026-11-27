import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ServiceError, type ServiceErrorCode } from '@/services/errors';
import { hasVerifiedFactor } from '@/lib/auth/mfa-assurance';

/**
 * Double authentification par application (TOTP) d'un compte.
 *
 * `supabase` est le client SERVEUR de la requete (cookies): la verification
 * d'un code y enregistre la nouvelle session aal2. `user` vient d'un
 * `auth.getUser()` fait par l'appelant: les facteurs sont lus cote serveur.
 *
 * Aucune donnee de facteur n'est journalisee ici. Le secret ne sort que vers
 * l'utilisateur lui-meme, une fois, pour qu'il l'ajoute a son application.
 *
 * Les erreurs sont des `ServiceError` dont le message est un code stable
 * (`MfaErrorCode`), traduit cote interface.
 */
export type MfaErrorCode =
  'invalidCode' | 'expired' | 'unavailable' | 'alreadyEnabled' | 'noFactor' | 'failed';

export interface MfaEnrollment {
  factorId: string;
  /** URI otpauth:// a afficher en QR code. */
  uri: string;
  /** Cle a saisir a la main si le QR code ne passe pas. */
  secret: string;
}

const ISSUER = 'ATTABL';

function fail(reason: MfaErrorCode, status: ServiceErrorCode = 'VALIDATION'): never {
  throw new ServiceError(reason, status);
}

/** Traduit une erreur du serveur Auth en code stable. Jamais son texte brut. */
function reasonFromAuthError(error: { code?: string } | null): MfaErrorCode {
  switch (error?.code) {
    case 'mfa_verification_failed':
    case 'mfa_verification_rejected':
      return 'invalidCode';
    case 'mfa_challenge_expired':
      return 'expired';
    case 'mfa_totp_enroll_not_enabled':
    case 'mfa_totp_verify_not_enabled':
      return 'unavailable';
    case 'mfa_factor_not_found':
      return 'noFactor';
    case 'mfa_verified_factor_exists':
      return 'alreadyEnabled';
    default:
      return 'failed';
  }
}

function totpFactors(user: Pick<User, 'factors'>) {
  return (user.factors ?? []).filter((f) => f.factor_type === 'totp');
}

export function createMfaService(supabase: Pick<SupabaseClient, 'auth'>) {
  async function challengeAndVerify(factorId: string, code: string): Promise<void> {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) fail(reasonFromAuthError(error));
  }

  return {
    status(user: Pick<User, 'factors'>): { enabled: boolean } {
      return { enabled: hasVerifiedFactor(user) };
    },

    /**
     * Demarre l'activation: un facteur non verifie est cree, son QR code et sa
     * cle sont rendus. Les essais precedents jamais confirmes sont retires
     * d'abord (sinon ils s'empilent jusqu'a la limite de facteurs du compte).
     */
    async startEnrollment(user: Pick<User, 'factors'>): Promise<MfaEnrollment> {
      if (hasVerifiedFactor(user)) fail('alreadyEnabled', 'CONFLICT');

      for (const stale of totpFactors(user).filter((f) => f.status !== 'verified')) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: stale.id });
        if (error) fail(reasonFromAuthError(error), 'INTERNAL');
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: ISSUER,
        // Unique: le serveur refuse deux facteurs du meme nom.
        friendlyName: `${ISSUER} ${crypto.randomUUID().slice(0, 8)}`,
      });
      if (error || !data) fail(reasonFromAuthError(error), 'INTERNAL');
      return { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret };
    },

    /**
     * Verifie un code. Avec `factorId`: confirme l'activation de CE facteur
     * (il doit appartenir au compte). Sans: code de connexion sur le facteur
     * verifie du compte. Le succes enregistre une session aal2.
     */
    async verifyCode(
      user: Pick<User, 'factors'>,
      input: { code: string; factorId?: string },
    ): Promise<void> {
      const factors = totpFactors(user);
      const factor = input.factorId
        ? factors.find((f) => f.id === input.factorId)
        : factors.find((f) => f.status === 'verified');
      if (!factor) fail('noFactor', 'NOT_FOUND');
      await challengeAndVerify(factor.id, input.code);
    },

    /**
     * Desactive la double authentification. Un code valide est exige: il
     * prouve la possession de l'application et porte la session en aal2, que
     * le serveur Auth demande pour retirer un facteur verifie.
     */
    async disable(user: Pick<User, 'factors'>, code: string): Promise<void> {
      const verified = totpFactors(user).filter((f) => f.status === 'verified');
      if (verified.length === 0) fail('noFactor', 'NOT_FOUND');
      await challengeAndVerify(verified[0].id, code);
      for (const factor of verified) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error) fail(reasonFromAuthError(error), 'INTERNAL');
      }
    },
  };
}

export function isMfaErrorCode(value: string): value is MfaErrorCode {
  return ['invalidCode', 'expired', 'unavailable', 'alreadyEnabled', 'noFactor', 'failed'].includes(
    value,
  );
}
