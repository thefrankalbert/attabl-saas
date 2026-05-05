'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag } from 'lucide-react';
import { useCartData } from '@/contexts/CartContext';
import { formatCurrency } from '@/lib/utils/currency';
import { usePathname } from 'next/navigation';

export function ClientFloatingCart({ slug }: { slug: string }) {
  const { totalItems, subtotal, currencyCode, items } = useCartData();
  const pathname = usePathname();
  if (totalItems === 0) return null;
  if (pathname?.includes('/cart')) return null;

  const thumbItems = items.filter((i) => i.image_url).slice(0, 3);

  return (
    <Link
      href={`/sites/${slug}/cart`}
      className="fixed inset-x-3.5 bottom-[88px] z-20 flex items-center gap-3 rounded-[var(--radius-card)] bg-[var(--color-ink)] px-3.5 py-3 text-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.10),0_4px_6px_-4px_rgba(0,0,0,0.06)]"
      aria-label={`Voir le panier - ${totalItems} article${totalItems > 1 ? 's' : ''}`}
    >
      {thumbItems.length > 0 ? (
        <div className="flex">
          {thumbItems.map((item, i) => (
            <div
              key={item.id}
              className="h-7 w-7 overflow-hidden rounded-full border-2 border-[var(--color-ink)]"
              style={{ marginLeft: i === 0 ? 0 : -8 }}
            >
              <Image
                src={item.image_url!}
                alt=""
                width={28}
                height={28}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
          <ShoppingBag className="h-4 w-4 text-white" strokeWidth={2} />
        </div>
      )}

      <div className="flex flex-1 items-center gap-2 min-w-0">
        <span className="rounded-[4px] bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-[var(--color-ink)] shrink-0">
          {totalItems}
        </span>
        <span className="text-[13.5px] font-medium truncate">Voir le panier</span>
      </div>

      <span className="shrink-0 font-semibold text-[13.5px]">
        {formatCurrency(subtotal, currencyCode)}
        <span className="ml-1 font-mono text-[11px] font-medium opacity-55">
          {currencyCode === 'XAF' ? 'FCFA' : currencyCode}
        </span>
      </span>
    </Link>
  );
}

export function FloatingCartIcon() {
  return <ShoppingBag className="h-5 w-5" />;
}
