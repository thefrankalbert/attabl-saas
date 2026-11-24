import { describe, it, expect } from 'vitest';
import { resolvePostLoginRedirect } from '../post-login-redirect';

const TENANT = '/sites/lepicurien/admin';

describe('resolvePostLoginRedirect', () => {
  it('suit un lien profond du meme etablissement', () => {
    expect(resolvePostLoginRedirect(TENANT, '/sites/lepicurien/admin/orders')).toBe(
      '/sites/lepicurien/admin/orders',
    );
    expect(resolvePostLoginRedirect(TENANT, '/sites/lepicurien/admin/orders?tab=open')).toBe(
      '/sites/lepicurien/admin/orders?tab=open',
    );
  });

  it('ramene la forme sous-domaine sous l etablissement du compte', () => {
    expect(resolvePostLoginRedirect(TENANT, '/admin/orders')).toBe(`${TENANT}/orders`);
    expect(resolvePostLoginRedirect(TENANT, '/admin')).toBe(TENANT);
  });

  it('suit toujours la page de paiement, avec ses parametres', () => {
    expect(resolvePostLoginRedirect(TENANT, '/checkout?plan=pro&interval=monthly')).toBe(
      '/checkout?plan=pro&interval=monthly',
    );
  });

  it('suit une sous-page de la console plateforme pour un super-admin', () => {
    expect(resolvePostLoginRedirect('/admin/platform', '/admin/platform/tenants')).toBe(
      '/admin/platform/tenants',
    );
  });

  it('retombe sur la destination par defaut sans parametre', () => {
    expect(resolvePostLoginRedirect(TENANT, null)).toBe(TENANT);
    expect(resolvePostLoginRedirect(TENANT, '')).toBe(TENANT);
  });

  it.each([
    ['adresse externe', 'https://pirate.example/x'],
    ['double barre', '//pirate.example/x'],
    ['barre inverse', '/\\pirate.example'],
    ['schema javascript', 'javascript:alert(1)'],
    ['retour chariot', '/sites/lepicurien/admin\r\nx'],
    ['trop long', `/sites/lepicurien/admin/${'a'.repeat(600)}`],
  ])('refuse %s', (_label, requested) => {
    expect(resolvePostLoginRedirect(TENANT, requested)).toBe(TENANT);
  });

  it('refuse l etablissement d un autre et les consoles plateforme', () => {
    expect(resolvePostLoginRedirect(TENANT, '/sites/autre/admin/orders')).toBe(TENANT);
    expect(resolvePostLoginRedirect(TENANT, '/sites/lepicurien/administration')).toBe(TENANT);
    expect(resolvePostLoginRedirect(TENANT, '/admin/platform')).toBe(TENANT);
    expect(resolvePostLoginRedirect(TENANT, '/admin/tenants')).toBe(TENANT);
    expect(resolvePostLoginRedirect(TENANT, '/sites/lepicurien/admin/../../autre/admin')).toBe(
      TENANT,
    );
  });

  it('un compte renvoye a l onboarding y reste', () => {
    expect(resolvePostLoginRedirect('/onboarding', '/checkout?plan=pro')).toBe('/onboarding');
  });
});
