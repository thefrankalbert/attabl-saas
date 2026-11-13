import { vi } from 'vitest';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Doublures partagees par les bancs du lot Stripe du 13 novembre 2026 (suite
 * du test d'intrusion). Les doublures de liste et de lecture repondent SELON
 * LE FILTRE OU L'IDENTIFIANT recu: une doublure qui rend tout quel que soit le
 * filtre validait sa propre doublure (relecture adverse, M1).
 */

export type Ligne = Record<string, unknown> | null;

/** Doublure Supabase minimale: une ligne `tenants`, et la liste des ecritures. */
export function doublureBase(tenant: Ligne, options: { lignesEcrites?: number } = {}) {
  const ecritures: Record<string, unknown>[] = [];
  const filtresEcriture: [string, string, unknown][] = [];
  const lecture = { data: tenant, error: tenant ? null : { code: 'PGRST116' } };
  const chaineLecture = {
    eq: () => chaineLecture,
    is: () => chaineLecture,
    single: () => Promise.resolve(lecture),
    maybeSingle: () => Promise.resolve({ data: tenant, error: null }),
    then: (ok: (v: typeof lecture) => unknown) => Promise.resolve(lecture).then(ok),
  };
  const resultatEcriture = { error: null, count: options.lignesEcrites ?? 1 };
  const chaineEcriture = {
    eq: (colonne: string, valeur: unknown) => {
      filtresEcriture.push(['eq', colonne, valeur]);
      return chaineEcriture;
    },
    is: (colonne: string, valeur: unknown) => {
      filtresEcriture.push(['is', colonne, valeur]);
      return chaineEcriture;
    },
    then: (ok: (v: typeof resultatEcriture) => unknown) =>
      Promise.resolve(resultatEcriture).then(ok),
  };
  const supabase = {
    from: () => ({
      select: () => chaineLecture,
      update: (payload: Record<string, unknown>) => {
        ecritures.push(payload);
        return chaineEcriture;
      },
    }),
  } as unknown as SupabaseClient;
  return { supabase, ecritures, filtresEcriture };
}

export function doublureStripe() {
  const retrieve = vi.fn();
  const cancel = vi.fn().mockResolvedValue({});
  const list = vi.fn().mockResolvedValue({ data: [] });
  const expire = vi.fn().mockResolvedValue({});
  const invoicePaymentsList = vi.fn().mockResolvedValue({ data: [] });
  const invoicesRetrieve = vi.fn();
  const voidInvoice = vi.fn().mockResolvedValue({});
  const invoicesList = vi.fn().mockResolvedValue({ data: [] });
  const stripe = {
    subscriptions: { retrieve, cancel },
    checkout: { sessions: { list, expire } },
    charges: { list: vi.fn().mockResolvedValue({ data: [] }) },
    disputes: { list: vi.fn().mockResolvedValue({ data: [] }) },
    invoicePayments: { list: invoicePaymentsList },
    invoices: { retrieve: invoicesRetrieve, voidInvoice, list: invoicesList },
  } as unknown as Stripe;
  return {
    stripe,
    retrieve,
    cancel,
    list,
    expire,
    invoicePaymentsList,
    invoicesRetrieve,
    voidInvoice,
    invoicesList,
  };
}

export const introuvable = Object.assign(new Error('No such subscription'), {
  code: 'resource_missing',
});
