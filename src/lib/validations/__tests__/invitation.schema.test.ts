import { describe, it, expect } from 'vitest';
import {
  createInvitationSchema,
  acceptInvitationSchema,
  validateInvitationSchema,
} from '../invitation.schema';

const VALID_TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

describe('createInvitationSchema', () => {
  it('accepts valid invitation input', () => {
    const result = createInvitationSchema.safeParse({
      email: 'team@restaurant.com',
      role: 'waiter',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = createInvitationSchema.safeParse({
      email: 'not-an-email',
      role: 'waiter',
    });
    expect(result.success).toBe(false);
  });

  it('rejects owner role', () => {
    const result = createInvitationSchema.safeParse({
      email: 'owner@test.com',
      role: 'owner',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all invitable roles', () => {
    const roles = ['admin', 'manager', 'cashier', 'chef', 'waiter'];
    for (const role of roles) {
      const result = createInvitationSchema.safeParse({
        email: 'test@test.com',
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts optional custom_permissions', () => {
    const result = createInvitationSchema.safeParse({
      email: 'test@test.com',
      role: 'waiter',
      custom_permissions: { 'orders.manage': true },
    });
    expect(result.success).toBe(true);
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
  //    validateInvitationSchema / GET /api/invitations/validate, qui a son
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
      role: 'waiter',
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
