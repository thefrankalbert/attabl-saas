import { describe, it, expect } from 'vitest';
import {
  createInvitationSchema,
  acceptInvitationSchema,
  validateInvitationSchema,
} from '../invitation.schema';
import { STAFF_POSTES } from '@/types/permission.types';

const VALID_TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

describe('createInvitationSchema', () => {
  const base = { email: 'team@restaurant.com' };

  it('accepts valid invitation input', () => {
    const result = createInvitationSchema.safeParse({ ...base, postes: ['waiter'] });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = createInvitationSchema.safeParse({
      email: 'not-an-email',
      postes: ['waiter'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects the owner poste, alone or cumulated', () => {
    expect(createInvitationSchema.safeParse({ ...base, postes: ['owner'] }).success).toBe(false);
    expect(
      createInvitationSchema.safeParse({ ...base, postes: ['manager', 'owner'] }).success,
    ).toBe(false);
    // temoin: sans owner, la meme requete passe
    expect(createInvitationSchema.safeParse({ ...base, postes: ['manager'] }).success).toBe(true);
  });

  it('accepts each of the 10 invitable postes', () => {
    expect(STAFF_POSTES).toHaveLength(10);
    for (const poste of STAFF_POSTES) {
      expect(createInvitationSchema.safeParse({ ...base, postes: [poste] }).success).toBe(true);
    }
  });

  it('accepts a cumulation of postes', () => {
    expect(
      createInvitationSchema.safeParse({ ...base, postes: ['manager', 'cashier'] }).success,
    ).toBe(true);
  });

  it('rejects an empty postes list and a missing one', () => {
    expect(createInvitationSchema.safeParse({ ...base, postes: [] }).success).toBe(false);
    expect(createInvitationSchema.safeParse(base).success).toBe(false);
  });

  it('rejects an unknown poste and the retired admin role', () => {
    expect(createInvitationSchema.safeParse({ ...base, postes: ['admin'] }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ ...base, postes: ['plongeur'] }).success).toBe(false);
  });

  it('rejects a duplicate poste', () => {
    expect(createInvitationSchema.safeParse({ ...base, postes: ['chef', 'chef'] }).success).toBe(
      false,
    );
  });

  it('accepts optional permission_overrides with known codes', () => {
    const result = createInvitationSchema.safeParse({
      ...base,
      postes: ['waiter'],
      permission_overrides: { 'orders.pay': true },
    });
    expect(result.success).toBe(true);
  });

  it('rejects permission_overrides with an unknown permission code', () => {
    const result = createInvitationSchema.safeParse({
      ...base,
      postes: ['waiter'],
      permission_overrides: { 'orders.delete_everything': true },
    });
    expect(result.success).toBe(false);
  });
});

describe('acceptInvitationSchema', () => {
  it('accepts valid accept input with name and password', () => {
    const result = acceptInvitationSchema.safeParse({
      token: VALID_TOKEN,
      full_name: 'Jean Dupont',
      password: 'SecurePass123!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = acceptInvitationSchema.safeParse({
      token: VALID_TOKEN,
      full_name: 'Jean',
      password: '123',
    });
    expect(result.success).toBe(false);
  });

  // CHANGEMENT DE CONTRAT (reserve S4 du contre-audit LOT 2). Ces deux cas
  // exigeaient full_name + password pour TOUT payload d'acceptation. Or le
  // service les IGNORE des que l'adresse invitee possede un compte: le
  // titulaire saisissait un mot de passe sans aucun effet, et l'adhesion par
  // simple session (desormais la seule preuve de consentement acceptee, voir
  // invitation.token-consent.test.ts) etait impossible.
  //
  // La protection n'est pas perdue, elle a change de couche:
  //  - creation de compte sans nom ni mot de passe: refusee par le service
  //    (ServiceError VALIDATION), verifie dans invitation.accept.test.ts
  //    ("refuse un nouveau compte sans nom ni mot de passe");
  //  - le motif d'origine de l'exigence (un appel vide au montage de la page
  //    qui brulait un jeton du limiteur d'acceptation) est couvert par
  //    validateInvitationSchema / POST /api/invitations/validate, qui a son
  //    propre limiteur - cas verifies dans le describe suivant;
  //  - les bornes restent appliquees des que les champs sont fournis (voir
  //    "rejects short password" ci-dessus et les deux cas ci-dessous).
  it('accepts a token-only payload: un titulaire deja inscrit rejoint avec sa session', () => {
    const result = acceptInvitationSchema.safeParse({ token: VALID_TOKEN });
    expect(result.success).toBe(true);
  });

  it('rejects a too-short full_name when one is provided', () => {
    const result = acceptInvitationSchema.safeParse({
      token: VALID_TOKEN,
      full_name: 'J',
      password: 'SecurePass123!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed token even without credentials', () => {
    const result = acceptInvitationSchema.safeParse({ token: 'pas-un-jeton' });
    expect(result.success).toBe(false);
  });
});

describe('createInvitationSchema - normalisation de la casse', () => {
  // Reserve S4: .eq() est sensible a la casse en Postgres. Sans minuscules a
  // l'ecriture, "Victime@X.com" ne retrouvait pas le compte "victime@x.com" a
  // l'acceptation, et le garde anti-doublon des invitations pending se
  // contournait en changeant simplement la casse.
  it('minuscule et detrime l adresse', () => {
    const result = createInvitationSchema.safeParse({
      email: '  Equipier@Resto-A.TEST  ',
      postes: ['waiter'],
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.email).toBe('equipier@resto-a.test');
  });
});

describe('validateInvitationSchema', () => {
  it('accepts a token-only payload', () => {
    const result = validateInvitationSchema.safeParse({ token: VALID_TOKEN });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed token', () => {
    expect(validateInvitationSchema.safeParse({ token: 'abc' }).success).toBe(false);
    expect(validateInvitationSchema.safeParse({ token: null }).success).toBe(false);
  });
});
