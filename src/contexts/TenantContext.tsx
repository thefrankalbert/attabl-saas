'use client';

import { createContext, useContext, ReactNode } from 'react';
import { Tenant } from '@/types/admin.types';

interface TenantContextType {
  slug: string | null;
  tenantId: string | null;
  tenant: Tenant | null;
}

const TenantContext = createContext<TenantContextType>({
  slug: null,
  tenantId: null,
  tenant: null,
});

export function TenantProvider({
  children,
  slug,
  tenantId,
  tenant,
}: {
  children: ReactNode;
  slug: string | null;
  tenantId: string | null;
  tenant: Tenant | null;
}) {
  return (
    <TenantContext.Provider value={{ slug, tenantId, tenant }}>
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

