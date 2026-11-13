import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// La table des prix repond SELON L'IDENTIFIANT: c'est le chemin utilise en
// production (nos six prix). Un prix inconnu rend `null` (repli sur la duree).
vi.mock('@/lib/stripe/server', () => ({
  getIntervalFromPriceId: (id: string) => {
    if (id === 'price_illisible') throw new Error('variable de prix manquante');
    return id.endsWith('_y') ? 'yearly' : id.endsWith('_m') ? 'monthly' : null;
  },
}));

import { handleChargeRefunded } from '../refund';
import { doublureBase, doublureStripe, introuvable } from './banc-doublures';

/**
 * Lot Stripe du 13 novembre 2026, M-08 gel sur remboursement.
 *
 * Chaque garde est mesuree dans les deux sens: le cas a refuser ET le cas
 * legitime qui doit continuer de passer.
 */

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// M-08 - gel sur remboursement
// ---------------------------------------------------------------------------

describe('M-08 - charge.refunded', () => {
  const tenant = {
    id: 'tenant-1',
    subscription_status: 'active',
    stripe_subscription_id: 'sub_courant',
    freeze_reason: null,
  };
  const charge = {
    id: 'ch_1',
    customer: 'cus_1',
    amount: 5000,
    amount_refunded: 5000,
    payment_intent: 'pi_rembourse',
  } as unknown as Stripe.Charge;

  const dansUnMois = Math.floor(Date.now() / 1000) + 30 * 86400;
  const ilYaUnMois = Math.floor(Date.now() / 1000) - 30 * 86400;

  /**
   * Facture telle que Stripe la rend (mesure en mode test): une ligne creditee
   * pour le temps non utilise de l'ancien prix, une ligne payee pour le nouveau.
   */
  function factureDuPaiement(
    stripeDouble: ReturnType<typeof doublureStripe>,
    facture: {
      abonnement: string;
      raison: string;
      finDePeriode: number;
      /** Duree couverte par la ligne creditee, en jours (absente a la creation). */
      joursCredites?: number;
      /** Duree couverte par la ligne payee, en jours. */
      joursPayes?: number;
      /** Fin de la periode COURANTE de l'abonnement (defaut: celle de la facture). */
      finPeriodeCourante?: number;
      /** Prix de la ligne payee et de la ligne creditee (absents: prix inconnus). */
      prixPaye?: string;
      prixCredite?: string;
    },
  ) {
    const jour = 86400;
    const prix = (id?: string) => (id ? { pricing: { price_details: { price: id } } } : {});
    const payee = {
      amount: 5000,
      ...prix(facture.prixPaye),
      period: {
        start: facture.finDePeriode - (facture.joursPayes ?? 30) * jour,
        end: facture.finDePeriode,
      },
    };
    const creditee = facture.joursCredites
      ? [
          {
            amount: -3900,
            ...prix(facture.prixCredite),
            period: {
              start: facture.finDePeriode - facture.joursCredites * jour,
              end: facture.finDePeriode,
            },
          },
        ]
      : [];
    // La periode courante de l'abonnement, telle que Stripe la rend, et
    // seulement pour CET abonnement.
    const finCourante = facture.finPeriodeCourante ?? facture.finDePeriode;
    stripeDouble.retrieve.mockImplementation((id: string) =>
      id === 'sub_courant'
        ? Promise.resolve({ id, items: { data: [{ current_period_end: finCourante }] } })
        : Promise.reject(introuvable),
    );
    stripeDouble.invoicePaymentsList.mockResolvedValue({ data: [{ invoice: 'in_1' }] });
    stripeDouble.invoicesRetrieve.mockResolvedValue({
      id: 'in_1',
      billing_reason: facture.raison,
      parent: { subscription_details: { subscription: facture.abonnement } },
      lines: { data: [...creditee, payee] },
    });
  }
  const GEL = [{ subscription_status: 'frozen', is_active: false, freeze_reason: 'refund' }];

  it('gele quand le paiement de la periode en cours est rembourse (temoin)', async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const d = doublureStripe();
    factureDuPaiement(d, {
      abonnement: 'sub_courant',
      raison: 'subscription_cycle',
      finDePeriode: dansUnMois,
    });

    await handleChargeRefunded({ supabase, stripe: d.stripe }, charge);

    // Les lectures portent bien sur CE paiement, CETTE facture, CET abonnement.
    expect(d.invoicePaymentsList).toHaveBeenCalledWith({
      payment: { type: 'payment_intent', payment_intent: 'pi_rembourse' },
      limit: 1,
    });
    expect(d.invoicesRetrieve).toHaveBeenCalledWith('in_1');
    expect(d.retrieve).toHaveBeenCalledWith('sub_courant');
    expect(ecritures).toEqual(GEL);
  });

  it("ne gele PAS sur le remboursement de l'ancienne mensualite apres un passage a l'annuel (troisieme relecture)", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const d = doublureStripe();
    // La mensualite de creation court encore 20 jours, mais c'est la facture
    // annuelle qui finance la periode: elle finit dans 355 jours.
    const jour = 86400;
    const maintenant = Math.floor(Date.now() / 1000);
    factureDuPaiement(d, {
      abonnement: 'sub_courant',
      raison: 'subscription_create',
      finDePeriode: maintenant + 20 * jour,
      finPeriodeCourante: maintenant + 355 * jour,
    });

    await handleChargeRefunded({ supabase, stripe: d.stripe }, charge);

    expect(ecritures).toEqual([]);
  });

  it("gele comme avant quand l'abonnement est introuvable chez Stripe", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const d = doublureStripe();
    factureDuPaiement(d, {
      abonnement: 'sub_courant',
      raison: 'subscription_cycle',
      finDePeriode: dansUnMois,
    });
    d.retrieve.mockRejectedValue(introuvable);

    await handleChargeRefunded({ supabase, stripe: d.stripe }, charge);

    expect(ecritures).toEqual(GEL);
  });

  it("ne gele PAS sur le remboursement d'une periode deja ecoulee", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const d = doublureStripe();
    factureDuPaiement(d, {
      abonnement: 'sub_courant',
      raison: 'subscription_cycle',
      finDePeriode: ilYaUnMois,
      finPeriodeCourante: dansUnMois,
    });

    await handleChargeRefunded({ supabase, stripe: d.stripe }, charge);

    expect(ecritures).toEqual([]);
  });

  it("ne gele PAS sur le remboursement de la difference d'une montee en gamme", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const d = doublureStripe();
    // Meme intervalle: la ligne creditee et la ligne payee couvrent la meme
    // duree (le reste de la periode).
    factureDuPaiement(d, {
      abonnement: 'sub_courant',
      raison: 'subscription_update',
      finDePeriode: dansUnMois,
      joursCredites: 30,
      joursPayes: 30,
    });

    await handleChargeRefunded({ supabase, stripe: d.stripe }, charge);

    expect(ecritures).toEqual([]);
  });

  it("gele sur le remboursement d'un passage mensuel vers annuel (relecture, second passage)", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const d = doublureStripe();
    // Changement d'intervalle: la ligne creditee couvre l'ancien intervalle
    // (30 jours), la ligne payee le nouveau (365 jours).
    factureDuPaiement(d, {
      abonnement: 'sub_courant',
      raison: 'subscription_update',
      finDePeriode: dansUnMois,
      joursCredites: 30,
      joursPayes: 365,
    });

    await handleChargeRefunded({ supabase, stripe: d.stripe }, charge);

    expect(ecritures).toEqual(GEL);
  });

  it("ne gele PAS sur le remboursement du paiement d'un AUTRE abonnement (doublon)", async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const d = doublureStripe();
    factureDuPaiement(d, {
      abonnement: 'sub_doublon',
      raison: 'subscription_create',
      finDePeriode: dansUnMois,
    });

    await handleChargeRefunded({ supabase, stripe: d.stripe }, charge);

    expect(ecritures).toEqual([]);
  });

  it("gele comme avant quand le restaurant n'a pas d'abonnement enregistre", async () => {
    const { supabase, ecritures } = doublureBase({ ...tenant, stripe_subscription_id: null });
    const d = doublureStripe();

    await handleChargeRefunded({ supabase, stripe: d.stripe }, charge);

    expect(d.invoicePaymentsList).not.toHaveBeenCalled();
    expect(ecritures).toEqual(GEL);
  });

  it('gele comme avant, sans rejeu, quand la facture est introuvable (relecture m6)', async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const d = doublureStripe();
    d.invoicePaymentsList.mockRejectedValue(introuvable);

    await expect(
      handleChargeRefunded({ supabase, stripe: d.stripe }, charge),
    ).resolves.toBeUndefined();
    expect(ecritures).toEqual(GEL);
  });

  it('laisse Stripe rejouer sur une panne de lecture', async () => {
    const { supabase, ecritures } = doublureBase(tenant);
    const d = doublureStripe();
    d.invoicePaymentsList.mockRejectedValue(new Error('timeout'));

    await expect(handleChargeRefunded({ supabase, stripe: d.stripe }, charge)).rejects.toThrow();
    expect(ecritures).toEqual([]);
  });

  // Le chemin utilise en PRODUCTION: nos prix sont connus, c'est leur
  // intervalle qui decide. Les durees sont volontairement trompeuses dans ces
  // cas, pour prouver que c'est bien le prix qui tranche.
  describe('changement de formule, prix connus (quatrieme relecture)', () => {
    it('ne gele PAS sur une montee en gamme mensuelle, meme si les durees different', async () => {
      const { supabase, ecritures } = doublureBase(tenant);
      const d = doublureStripe();
      factureDuPaiement(d, {
        abonnement: 'sub_courant',
        raison: 'subscription_update',
        finDePeriode: dansUnMois,
        joursCredites: 30,
        joursPayes: 365,
        prixPaye: 'price_pro_m',
        prixCredite: 'price_starter_m',
      });

      await handleChargeRefunded({ supabase, stripe: d.stripe }, charge);

      expect(ecritures).toEqual([]);
    });

    it('gele sur un passage mensuel vers annuel, meme si les durees sont egales', async () => {
      const { supabase, ecritures } = doublureBase(tenant);
      const d = doublureStripe();
      factureDuPaiement(d, {
        abonnement: 'sub_courant',
        raison: 'subscription_update',
        finDePeriode: dansUnMois,
        joursCredites: 30,
        joursPayes: 30,
        prixPaye: 'price_pro_y',
        prixCredite: 'price_pro_m',
      });

      await handleChargeRefunded({ supabase, stripe: d.stripe }, charge);

      expect(ecritures).toEqual(GEL);
    });

    // Cas REEL: un client annuel passe au mensuel 10 jours avant le terme. Il
    // lui reste 10 jours credites, il paie 30 jours de mensuel.
    it('ne gele PAS sur un passage annuel vers mensuel pres du terme (par prix)', async () => {
      const { supabase, ecritures } = doublureBase(tenant);
      const d = doublureStripe();
      factureDuPaiement(d, {
        abonnement: 'sub_courant',
        raison: 'subscription_update',
        finDePeriode: dansUnMois,
        joursCredites: 10,
        joursPayes: 30,
        prixPaye: 'price_business_m',
        prixCredite: 'price_business_y',
      });

      await handleChargeRefunded({ supabase, stripe: d.stripe }, charge);

      expect(ecritures).toEqual([]);
    });

    it('rend le MEME verdict par les durees quand les prix sont inconnus (cinquieme relecture)', async () => {
      const { supabase, ecritures } = doublureBase(tenant);
      const d = doublureStripe();
      factureDuPaiement(d, {
        abonnement: 'sub_courant',
        raison: 'subscription_update',
        finDePeriode: dansUnMois,
        joursCredites: 10,
        joursPayes: 30,
      });

      await handleChargeRefunded({ supabase, stripe: d.stripe }, charge);

      expect(ecritures).toEqual([]);
    });

    it('se replie sur les durees quand la table des prix est illisible, sans rejeu', async () => {
      const { supabase, ecritures } = doublureBase(tenant);
      const d = doublureStripe();
      factureDuPaiement(d, {
        abonnement: 'sub_courant',
        raison: 'subscription_update',
        finDePeriode: dansUnMois,
        joursCredites: 30,
        joursPayes: 365,
        prixPaye: 'price_illisible',
        prixCredite: 'price_illisible',
      });

      await expect(
        handleChargeRefunded({ supabase, stripe: d.stripe }, charge),
      ).resolves.toBeUndefined();
      expect(ecritures).toEqual(GEL);
    });
  });
});
