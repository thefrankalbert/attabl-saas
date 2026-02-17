'use client';

import { Home, Search, ShoppingBag, ScrollText } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCart } from '@/contexts/CartContext';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  tenantSlug: string;
  primaryColor?: string;
  onSearchClick?: () => void;
}

export default function BottomNav({
  tenantSlug,
  primaryColor = '#000000',
  onSearchClick,
}: BottomNavProps) {
  const pathname = usePathname();
  const { totalItems } = useCart();
  const router = useRouter();
  const t = useTranslations('tenant');

  const navItems = [
    {
      label: t('navMenu'),
      icon: Home,
      onClick: () => router.push(`/sites/${tenantSlug}`),
      isActive: pathname === `/sites/${tenantSlug}`,
    },
    {
      label: t('navSearch'),
      icon: Search,
      onClick: onSearchClick,
      isActive: false,
    },
    {
      label: t('navCart'),
      icon: ShoppingBag,
      onClick: () => router.push(`/sites/${tenantSlug}/cart`),
      isActive: pathname === `/sites/${tenantSlug}/cart`,
      badge: totalItems > 0 ? totalItems : null,
    },
    {
      label: t('navOrders'),
      icon: ScrollText,
      onClick: () => router.push(`/sites/${tenantSlug}/orders`),
      isActive: pathname === `/sites/${tenantSlug}/orders`,
    },
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 pt-2 pb-safe z-50 md:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: `max(env(safe-area-inset-bottom, 8px), 8px)` }}
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item, index) => (
          <button
            key={index}
            onClick={item.onClick}
            className={cn(
              'flex flex-col items-center gap-0.5 p-2 relative transition-colors min-w-[56px]',
              !item.isActive && 'text-gray-400',
            )}
            style={item.isActive ? { color: primaryColor } : {}}
          >
            <div className="relative">
              <item.icon className="w-6 h-6" strokeWidth={item.isActive ? 2.5 : 1.8} />
              {item.badge && (
                <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center border-2 border-white px-0.5">
                  {item.badge}
                </span>
              )}
            </div>
            <span className={cn('text-[10px]', item.isActive ? 'font-semibold' : 'font-medium')}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
