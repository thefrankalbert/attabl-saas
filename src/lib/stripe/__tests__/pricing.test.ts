/**
 * Invariants de la grille tarifaire.
 *
 * Ces tables sont de simples constantes, donc "elles ne peuvent pas planter" -
 * c'est justement ce qui les rend dangereuses. Une faute de frappe sur un
 * chiffre ne casse rien: elle facture le mauvais montant, en silence, a tous
 * les clients d'un plan, jusqu'a ce qu'un client s'en apercoive.
 *
 * On ne re-ecrit donc pas les valeurs (ce qui ne prouverait rien, une copie
 * du meme typo passerait): on verifie les REGLES commerciales dont elles
 * decoulent. Un chiffre faux viole forcement une regle.
 */
import { describe, it, expect } from 'vitest';
import { PLAN_AMOUNTS, PLAN_TOTALS } from '../pricing';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';

type Plan = Exclude<SubscriptionPlan, 'enterprise'>;

const PLANS: Plan[] = ['starter', 'pro', 'business'];
const INTERVALLES: BillingInterval[] = ['monthly', 'semiannual', 'yearly'];

/** Nombre de mois factures d'un coup, par periodicite. */
const MOIS_PAR_INTERVALLE: Record<BillingInterval, number> = {
  monthly: 1,
  semiannual: 6,
  yearly: 12,
};

/** Remise annoncee sur la page de tarifs, par periodicite. */
const REMISE: Record<BillingInterval, number> = {
  monthly: 0,
  semiannual: 0.15,
  yearly: 0.2,
};

describe('grille tarifaire', () => {
  it('couvre les trois plans et les trois periodicites', () => {
    for (const plan of PLANS) {
      for (const intervalle of INTERVALLES) {
        expect(PLAN_AMOUNTS[plan][intervalle]).toBeTypeOf('number');
        expect(PLAN_TOTALS[plan][intervalle]).toBeTypeOf('number');
      }
    }
  });

  it.each(PLANS)('%s : le total facture = mensuel affiche x nombre de mois', (plan) => {
    // Le client voit un prix "par mois" et paie un total. Si les deux ne
    // concordent pas, la page de tarifs ment - le genre d'ecart qui finit en
    // litige de paiement.
    for (const intervalle of INTERVALLES) {
      expect(PLAN_TOTALS[plan][intervalle]).toBe(
        PLAN_AMOUNTS[plan][intervalle] * MOIS_PAR_INTERVALLE[intervalle],
      );
    }
  });

  it.each(PLANS)('%s : les remises annoncees sont respectees', (plan) => {
    const mensuel = PLAN_AMOUNTS[plan].monthly;
    for (const intervalle of INTERVALLES) {
      expect(PLAN_AMOUNTS[plan][intervalle]).toBe(mensuel * (1 - REMISE[intervalle]));
    }
  });

  it.each(PLANS)('%s : engager plus longtemps ne coute jamais plus cher au mois', (plan) => {
    const { monthly, semiannual, yearly } = PLAN_AMOUNTS[plan];
    expect(semiannual).toBeLessThan(monthly);
    expect(yearly).toBeLessThan(semiannual);
  });

  it('un plan superieur coute plus cher, a periodicite egale', () => {
    // Une inversion ici rendrait le plan du dessus moins cher que celui du
    // dessous: les clients migreraient "vers le haut" en payant moins.
    for (const intervalle of INTERVALLES) {
      expect(PLAN_AMOUNTS.starter[intervalle]).toBeLessThan(PLAN_AMOUNTS.pro[intervalle]);
      expect(PLAN_AMOUNTS.pro[intervalle]).toBeLessThan(PLAN_AMOUNTS.business[intervalle]);
    }
  });

  it('tous les montants sont des entiers positifs', () => {
    // Le XAF n'a pas de sous-unite: un montant a virgule serait arrondi par
    // Stripe, et le total facture ne collerait plus a l'affichage.
    for (const plan of PLANS) {
      for (const intervalle of INTERVALLES) {
        for (const montant of [PLAN_AMOUNTS[plan][intervalle], PLAN_TOTALS[plan][intervalle]]) {
          expect(Number.isInteger(montant)).toBe(true);
          expect(montant).toBeGreaterThan(0);
        }
      }
    }
  });
});
