import { describe, it, expect } from 'vitest';

import {
  TENANT_LOCK_COLUMNS,
  isTenantServing,
  tenantLockReason,
  type TenantLockRow,
} from '../tenant-lock';

/**
 * La regle de coupure d'un restaurant etait ecrite quatre fois dans le depot,
 * et deux de ces copies ne disaient pas la meme chose. Surtout, la caisse
 * (`/api/orders/pos`) n'en portait AUCUNE: un restaurant gele, suspendu ou
 * desactive continuait d'encaisser.
 *
 * Ces tests figent la regle elle-meme. Les tests de route verifient qu'elle est
 * bien appelee, et au bon endroit.
 */

const servant: TenantLockRow = {
  is_active: true,
  suspended_at: null,
  subscription_status: 'active',
};

describe('tenantLockReason', () => {
  it('laisse servir un restaurant actif et a jour', () => {
    expect(tenantLockReason(servant)).toBeNull();
    expect(isTenantServing(servant)).toBe(true);
  });

  it('coupe un restaurant desactive', () => {
    expect(tenantLockReason({ ...servant, is_active: false })).toBe('inactive');
  });

  it('coupe un restaurant suspendu par le super-admin, meme is_active a true', () => {
    // CTR7-1: `suspended_at` etait ecrit et affiche dans la console plateforme,
    // mais applique nulle part - et le webhook Stripe reecrit `is_active` a
    // chaque evenement d'abonnement. Les deux verrous sont independants.
    expect(tenantLockReason({ ...servant, suspended_at: '2026-11-01T00:00:00Z' })).toBe(
      'suspended',
    );
  });

  it('coupe un restaurant gele, meme is_active a true', () => {
    // C'est l'etat que `unsuspendTenant` produisait avant la contrainte du
    // 2026-11-05: une ligne peut porter is_active=true ET frozen.
    expect(tenantLockReason({ ...servant, subscription_status: 'frozen' })).toBe('subscription');
  });

  it.each(['cancelled', 'pending', 'paused', 'unpaid', 'incomplete', null])(
    'coupe un restaurant au statut %s',
    (status) => {
      expect(tenantLockReason({ ...servant, subscription_status: status })).toBe('subscription');
    },
  );

  it('laisse servir un restaurant en essai ou en retard de paiement', () => {
    // `past_due` reste servant: la relance Stripe est en cours et le cron de gel
    // le borne dans le temps. Couper ici couperait un client qui va payer.
    expect(tenantLockReason({ ...servant, subscription_status: 'trial' })).toBeNull();
    expect(tenantLockReason({ ...servant, subscription_status: 'past_due' })).toBeNull();
  });

  it('priorise la cause la plus specifique quand plusieurs verrous sont poses', () => {
    // L'ordre fixe le code HTTP renvoye: is_active -> 400, les deux autres -> 403.
    expect(
      tenantLockReason({
        is_active: false,
        suspended_at: '2026-11-01T00:00:00Z',
        subscription_status: 'frozen',
      }),
    ).toBe('inactive');
  });

  it('traite une colonne absente comme une coupure, jamais comme un feu vert', () => {
    // Un `.select()` qui oublie une colonne doit refuser, pas ouvrir.
    expect(tenantLockReason({})).toBe('inactive');
    expect(tenantLockReason({ is_active: true, suspended_at: null })).toBe('subscription');
  });

  it('expose les colonnes que tout appelant doit selectionner', () => {
    for (const column of ['is_active', 'suspended_at', 'subscription_status']) {
      expect(TENANT_LOCK_COLUMNS).toContain(column);
    }
  });
});
