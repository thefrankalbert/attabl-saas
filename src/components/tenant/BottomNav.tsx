'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, Search, ShoppingBag, ScrollText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/contexts/CartContext';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  tenantSlug: string;
  primaryColor?: string;
  onSearchClick?: () => void;
}

export default function BottomNav({ tenantSlug, primaryColor, onSearchClick }: BottomNavProps) {
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
      isActive: pathname === basePath || pathname === `${basePath}/`,
    },
    {
      label: t('navSearch'),
      icon: Search,
      onClick: onSearchClick || (() => {}),
      isActive: false,
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
      icon: ScrollText,
      onClick: () => router.push(`${basePath}/orders`),
      isActive: pathname?.includes('/orders'),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
      style={{ paddingBottom: `max(env(safe-area-inset-bottom, 8px), 8px)` }}
    >
      {/* Frosted glass background */}
      <div className="absolute inset-0 bg-white/80 backdrop-blur-xl border-t border-neutral-100 shadow-[0_-1px_3px_rgba(0,0,0,0.05)]" />

      <div className="relative flex items-center justify-around px-4 pt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={item.onClick}
              className={cn(
                'flex flex-col items-center gap-0.5 p-2.5 rounded-xl min-w-[48px] min-h-[44px] transition-colors',
                item.isActive ? 'font-semibold' : 'text-neutral-400',
              )}
              style={item.isActive ? { color: primaryColor || '#000' } : undefined}
            >
              <div className="relative">
                <Icon className="w-6 h-6" strokeWidth={item.isActive ? 2.5 : 1.8} />
                {/* Animated cart badge */}
                <AnimatePresence>
                  {'badge' in item && item.badge && (
                    <motion.div
                      key={item.badge}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-white text-white text-[10px] font-bold px-1"
                      style={{ backgroundColor: primaryColor || '#000' }}
                    >
                      {item.badge}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <span className={cn('text-[10px]', item.isActive ? 'font-semibold' : 'font-medium')}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
