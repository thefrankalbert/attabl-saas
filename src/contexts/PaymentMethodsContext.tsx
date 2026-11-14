'use client';

import { createContext, useContext } from 'react';

/**
 * Moyens de paiement actives par le restaurant (`tenants.enabled_payment_methods`),
 * lus cote serveur par le layout admin. `null` = aucun reglage fourni (hors
 * layout admin, tests): l'appelant retombe sur le defaut du registre.
 */
const PaymentMethodsContext = createContext<readonly string[] | null>(null);

export function PaymentMethodsProvider({
  methods,
  children,
}: {
  methods: readonly string[] | null;
  children: React.ReactNode;
}) {
  return (
    <PaymentMethodsContext.Provider value={methods}>{children}</PaymentMethodsContext.Provider>
  );
}

export function useEnabledPaymentMethods(): readonly string[] | null {
  return useContext(PaymentMethodsContext);
}
