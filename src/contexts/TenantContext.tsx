'use client';

import { createContext, useContext, ReactNode } from 'react';
import { Tenant } from '@/types/admin.types';

interface TenantContextType {
  slug: string | null;
  tenantId: string | null;
  tenant: Tenant | null;
  /**
   * Fin d'essai sans abonnement, dans les 7 jours de grace: la carte reste
   * visible mais aucune commande n'est possible (`storefrontAccess` ===
   * 'read_only'). Le serveur refuse de toute facon la commande: ce drapeau
   * n'est que l'explication a l'ecran.
   */
  orderingPaused: boolean;
}

const TenantContext = createContext<TenantContextType>({
  slug: null,
  tenantId: null,
  tenant: null,
  orderingPaused: false,
});

export function TenantProvider({
  children,
  slug,
  tenantId,
  tenant,
  orderingPaused = false,
}: {
  children: ReactNode;
  slug: string | null;
  tenantId: string | null;
  tenant: Tenant | null;
  orderingPaused?: boolean;
}) {
  return (
    <TenantContext.Provider value={{ slug, tenantId, tenant, orderingPaused }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
}
