'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { MENU_COLORS as C } from '@/lib/tenant/menu-tokens';

interface FloatingCartBarProps {
  totalItems: number;
  totalPrice: string;
  href: string;
  viewCartLabel: string;
}

export function FloatingCartBar({
  totalItems,
  totalPrice,
  href,
  viewCartLabel,
}: FloatingCartBarProps) {
  if (totalItems <= 0) return null;

  return (
    <div
      className="fixed left-0 right-0 z-40 flex justify-center px-4"
      style={{ bottom: 'calc(60px + env(safe-area-inset-bottom, 0px) + 16px)' }}
    >
      <Link
        href={href}
        className="inline-flex items-center gap-2.5 px-4 no-underline rounded-full h-12 max-w-[calc(100%-32px)]"
        style={{
          backgroundColor: C.cartBg,
          color: C.textOnPrimary,
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        }}
      >
        <ShoppingBag size={20} strokeWidth={2} color={C.textOnPrimary} />
        <span
          className="text-sm font-semibold whitespace-nowrap"
          style={{ color: C.textOnPrimary }}
        >
          {viewCartLabel}
        </span>
        <span className="text-sm font-bold whitespace-nowrap" style={{ color: C.textOnPrimary }}>
          {totalItems}
        </span>
        <span
          aria-hidden="true"
          className="inline-block rounded-full w-[5px] h-[5px]"
          style={{ backgroundColor: C.textOnPrimary }}
        />
        <span className="text-sm font-bold whitespace-nowrap" style={{ color: C.textOnPrimary }}>
          {totalPrice}
        </span>
      </Link>
    </div>
  );
}
