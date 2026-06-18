'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag } from 'lucide-react';
import { useCartData } from '@/contexts/CartContext';
import { formatAmount } from '@/lib/utils/currency';
import { formatCartCount } from '@/lib/utils/cart-display';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function ClientFloatingCart({ slug }: { slug: string }) {
  const { totalItems, subtotal, currencyCode, items } = useCartData();
  const t = useTranslations('tenant');
  const pathname = usePathname();
  if (totalItems === 0) return null;
  if (pathname?.includes('/cart')) return null;
  if (pathname?.endsWith('/welcome')) return null;

  const thumbItems = items.filter((i) => i.image_url).slice(0, 3);

  return (
    <Link
      href={`/sites/${slug}/cart`}
      className="fixed inset-x-3.5 bottom-[92px] z-20 flex items-center gap-3 rounded-[var(--radius-modal)] bg-[var(--color-ink)] px-3 py-2.5 text-white shadow-[0_10px_15px_-3px_rgba(0,0,0,0.10),0_4px_6px_-4px_rgba(0,0,0,0.06)]"
      aria-label={`${t('viewCart')} (${totalItems})`}
    >
      {thumbItems.length > 0 ? (
        <div className="flex">
          {thumbItems.map((item, i) => (
            <div
              key={item.id}
              className="h-[30px] w-[30px] overflow-hidden rounded-full border-2 border-[var(--color-ink)]"
              style={{ marginLeft: i === 0 ? 0 : -10 }}
            >
              <Image
                src={item.image_url!}
                alt=""
                width={30}
                height={30}
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
        <span className="rounded-[var(--radius-tag)] bg-white px-[7px] py-0.5 text-[11px] font-bold leading-none tabular-nums text-[var(--color-ink)] shrink-0">
          {formatCartCount(totalItems)}
        </span>
        <span className="text-[13.5px] font-medium truncate">{t('viewCart')}</span>
      </div>

      <span className="shrink-0 font-semibold text-[13.5px]">
        {formatAmount(subtotal, currencyCode)}
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
