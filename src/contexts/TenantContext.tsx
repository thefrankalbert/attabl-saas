'use client';

import { createContext, useContext, ReactNode } from 'react';

interface TenantContextType {
  slug: string | null;
  tenantId: string | null;
}

const TenantContext = createContext<TenantContextType>({
  slug: null,
  tenantId: null,
});

export function TenantProvider({
  children,
  slug,
  tenantId,
}: {
  children: ReactNode;
  slug: string | null;
  tenantId: string | null;
}) {
  return (
    <TenantContext.Provider value={{ slug, tenantId }}>
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
