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
      className="fixed bottom-0 left-0 right-0 z-50 bg-app-card border-t border-app-border"
      style={{
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
              className={`relative flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[72px] bg-transparent border-none cursor-pointer ${
                item.isActive ? 'text-app-text' : 'text-app-text-muted'
              }`}
            >
              {/* Active indicator top bar */}
              {item.isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-app-text rounded-b-sm" />
              )}

              <div style={{ position: 'relative' }}>
                <Icon
                  style={{ width: '24px', height: '24px', position: 'relative', zIndex: 10 }}
                  strokeWidth={item.isActive ? 2.5 : 2}
                />
                {/* Badge for cart */}
                {'badge' in item && item.badge && (
                  <span className="absolute -top-2 -right-2 z-20 bg-red-500 text-white text-[9px] font-bold h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full border-2 border-app-card">
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
