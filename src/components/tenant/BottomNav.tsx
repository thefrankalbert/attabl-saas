'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, ShoppingBag, Clock, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCart } from '@/contexts/CartContext';

interface BottomNavProps {
  tenantSlug: string;
}

export default function BottomNav({ tenantSlug }: BottomNavProps) {
  const pathname = usePathname();
  const { totalItems } = useCart();
  const router = useRouter();
  const t = useTranslations('tenant');

  const basePath = `/sites/${tenantSlug}`;

  const navItems = [
    {
      label: t('navMenu'),
      icon: Home,
      onClick: () => router.push(basePath),
      isActive:
        pathname === basePath ||
        pathname === `${basePath}/` ||
        pathname === `${basePath}/menu` ||
        pathname === `${basePath}/menu/`,
    },
    {
      label: t('navCart'),
      icon: ShoppingBag,
      onClick: () => router.push(`${basePath}/cart`),
      isActive: pathname?.includes('/cart'),
      badge: totalItems > 0 ? totalItems : null,
    },
    {
      label: t('navOrders'),
      icon: Clock,
      onClick: () => router.push(`${basePath}/orders`),
      isActive: pathname?.includes('/orders'),
    },
    {
      label: t('navProfile'),
      icon: User,
      onClick: () => router.push(`${basePath}/settings`),
      isActive: pathname?.includes('/settings'),
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
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e5e7eb',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          height: '64px',
          maxWidth: '512px',
          margin: '0 auto',
          padding: '0 8px',
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={item.onClick}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '8px 12px',
                minWidth: '72px',
                color: item.isActive ? '#000000' : '#9ca3af',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {/* Active indicator top bar */}
              {item.isActive && (
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '32px',
                    height: '2px',
                    backgroundColor: '#000000',
                    borderRadius: '0 0 2px 2px',
                  }}
                />
              )}

              <div style={{ position: 'relative' }}>
                <Icon
                  style={{ width: '24px', height: '24px', position: 'relative', zIndex: 10 }}
                  strokeWidth={item.isActive ? 2.5 : 2}
                />
                {/* Badge for cart */}
                {'badge' in item && item.badge && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-8px',
                      right: '-8px',
                      zIndex: 20,
                      backgroundColor: '#ef4444',
                      color: '#ffffff',
                      fontSize: '9px',
                      fontWeight: 700,
                      height: '16px',
                      minWidth: '16px',
                      padding: '0 4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '9999px',
                      border: '2px solid #ffffff',
                    }}
                  >
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: item.isActive ? 600 : 500,
                  letterSpacing: '0.02em',
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
