'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ShoppingBag, Home, Clock, User } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';

/* Design tokens from DESIGN.md */
const C = {
  primary: '#06C167',
  background: '#FFFFFF',
  divider: '#EEEEEE',
  textMuted: '#B0B0B0',
} as const;

interface BottomNavProps {
  tenantSlug: string;
}

export default function BottomNav({ tenantSlug }: BottomNavProps) {
  const pathname = usePathname();
  const { totalItems } = useCart();
  const router = useRouter();
  const t = useTranslations('tenant');

  const basePath = `/sites/${tenantSlug}`;

  const tabs = [
    {
      label: t('navHome'),
      path: basePath,
      isActive:
        pathname === basePath ||
        pathname === `${basePath}/` ||
        pathname === `${basePath}/menu` ||
        pathname === `${basePath}/menu/`,
      /* Home icon (Lucide) */
      icon: (active: boolean) => (
        <Home size={24} strokeWidth={2} color={active ? C.primary : C.textMuted} />
      ),
    },
    {
      label: t('navCart'),
      path: `${basePath}/cart`,
      isActive: pathname?.includes('/cart'),
      badge: totalItems > 0,
      /* Shopping bag icon (Lucide) */
      icon: (active: boolean) => (
        <ShoppingBag size={24} strokeWidth={2} color={active ? C.primary : C.textMuted} />
      ),
    },
    {
      label: t('navOrders'),
      path: `${basePath}/orders`,
      isActive: pathname?.includes('/orders'),
      /* Clock / orders icon (Lucide) */
      icon: (active: boolean) => (
        <Clock size={24} strokeWidth={2} color={active ? C.primary : C.textMuted} />
      ),
    },
    {
      label: t('navAccount'),
      path: `${basePath}/settings`,
      isActive: pathname?.includes('/settings'),
      /* User icon (Lucide) */
      icon: (active: boolean) => (
        <User size={24} strokeWidth={2} color={active ? C.primary : C.textMuted} />
      ),
    },
  ];

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: C.background,
        borderTop: `1px solid ${C.divider}`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          height: 60,
          maxWidth: 430,
          margin: '0 auto',
          padding: '0 8px',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.label}
            onClick={() => router.push(tab.path)}
            aria-label={tab.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              flex: 1,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 0',
              position: 'relative',
            }}
          >
            <div style={{ position: 'relative' }}>
              {tab.icon(!!tab.isActive)}
              {/* Green dot badge for cart */}
              {'badge' in tab && tab.badge && (
                <div
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -4,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: C.primary,
                    border: `2px solid ${C.background}`,
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: tab.isActive ? C.primary : C.textMuted,
              }}
            >
              {tab.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
