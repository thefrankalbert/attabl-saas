'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ShoppingBag, Home, Clock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
        <Home
          size={24}
          strokeWidth={2}
          className={active ? 'text-app-text' : 'text-app-text-muted'}
        />
      ),
    },
    {
      label: t('navCart'),
      path: `${basePath}/cart`,
      isActive: pathname?.includes('/cart'),
      badge: totalItems > 0,
      /* Shopping bag icon (Lucide) */
      icon: (active: boolean) => (
        <ShoppingBag
          size={24}
          strokeWidth={2}
          className={active ? 'text-app-text' : 'text-app-text-muted'}
        />
      ),
    },
    {
      label: t('navOrders'),
      path: `${basePath}/orders`,
      isActive: pathname?.includes('/orders'),
      /* Clock / orders icon (Lucide) */
      icon: (active: boolean) => (
        <Clock
          size={24}
          strokeWidth={2}
          className={active ? 'text-app-text' : 'text-app-text-muted'}
        />
      ),
    },
    {
      label: t('navAccount'),
      path: `${basePath}/settings`,
      isActive: pathname?.includes('/settings'),
      /* User icon (Lucide) */
      icon: (active: boolean) => (
        <User
          size={24}
          strokeWidth={2}
          className={active ? 'text-app-text' : 'text-app-text-muted'}
        />
      ),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-app-bg border-t border-app-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex justify-around items-center h-[60px] max-w-[430px] mx-auto px-2">
        {tabs.map((tab) => (
          <Button
            key={tab.label}
            variant="ghost"
            onClick={() => router.push(tab.path)}
            aria-label={tab.label}
            className="flex flex-col items-center justify-center gap-1 flex-1 px-0 py-2 relative h-auto"
          >
            <div className="relative">
              {tab.icon(!!tab.isActive)}
              {/* Green dot badge for cart */}
              {'badge' in tab && tab.badge && (
                <div className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-app-text border-2 border-app-bg" />
              )}
            </div>
            <span
              className={`text-[11px] font-normal ${tab.isActive ? 'text-app-text' : 'text-app-text-muted'}`}
            >
              {tab.label}
            </span>
          </Button>
        ))}
      </div>
    </nav>
  );
}
