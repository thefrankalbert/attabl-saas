'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Timer, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Photo } from '@/components/tenant/client/Photo';
import { formatAmount } from '@/lib/utils/currency';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import type { MenuItem } from '@/types/admin.types';

// Home "plat du jour" hero. Tapping it opens the item detail sheet (same as the
// home item cards) instead of navigating to the menu - the convive wants to see
// the dish details in place.
export function HomeHero({
  item,
  name,
  price,
  photoUrl,
  restaurantId,
  currencyCode,
  currencyUnit,
}: {
  item: MenuItem;
  name: string;
  price: number;
  photoUrl?: string | null;
  restaurantId: string;
  currencyCode: string;
  currencyUnit: string;
}) {
  const t = useTranslations('homePage');
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="relative block h-[232px] cursor-pointer overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-ink)]"
        aria-label={name}
      >
        {photoUrl && (
          <div className="absolute inset-0">
            <Photo src={photoUrl} alt={name} kind="food" fill priority sizes="100vw" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[30%] to-black/85" />
          </div>
        )}
        <div className="relative flex h-full flex-col justify-between p-[18px]">
          <div className="flex items-start justify-between">
            <Badge className="rounded-[var(--radius-tag)] bg-[var(--color-brand)] px-2.5 py-1 text-[11px] font-bold tracking-[0.2px] text-white hover:bg-[var(--color-brand)]">
              {t('platDuJour')}
            </Badge>
            <span className="flex items-center gap-[5px] rounded-[var(--radius-tag)] bg-white/15 px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-[0.2px] text-white backdrop-blur-[10px]">
              <Timer className="h-[11px] w-[11px]" />
              {t('dispoHeure')}
            </span>
          </div>
          <div>
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.5px] text-white/70">
              {t('suggestionChef')}
            </div>
            <div className="mt-[5px] line-clamp-2 break-words text-[25px] font-semibold leading-[1.05] tracking-[-0.9px] text-white">
              {name}
            </div>
            <div className="mt-3.5 flex items-center gap-3.5">
              <span className="text-[18px] font-semibold leading-none tracking-[-0.3px] text-white">
                {formatAmount(price, currencyCode)}{' '}
                <span className="font-mono text-[13px] font-medium text-white/60">
                  {currencyUnit}
                </span>
              </span>
              <span className="inline-flex h-[38px] items-center gap-2 rounded-full bg-[var(--color-brand)] px-4 text-[12.5px] font-semibold leading-none tracking-[-0.2px] text-white">
                {t('commander')}
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
              </span>
            </div>
          </div>
        </div>
      </div>
      <ItemDetailSheet
        item={open ? item : null}
        isOpen={open}
        onClose={() => setOpen(false)}
        restaurantId={restaurantId}
        currency={currencyCode}
      />
    </>
  );
}
