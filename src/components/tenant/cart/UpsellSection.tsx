'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Utensils, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslatedContent } from '@/lib/utils/translate';
import type { CurrencyCode } from '@/types/admin.types';
import type { UpsellItem } from '@/hooks/useCartSuggestions';

const UPSELL_PLUS_SHADOW =
  'shadow-[0_4px_6px_-1px_rgba(26,26,26,0.06),0_2px_4px_-2px_rgba(26,26,26,0.04)]';

interface UpsellSectionProps {
  upsellItems: UpsellItem[];
  isLoadingUpsell: boolean;
  menuPath: string;
  language: 'fr' | 'en';
  currencyCode: CurrencyCode;
  resolveAndFormatPrice: (
    amount: number,
    prices: Record<string, number> | null | undefined,
    currency: CurrencyCode,
  ) => string;
  onAdd: (item: UpsellItem) => void;
  labels: {
    title: string;
    subtitle: string;
    seeAll: string;
    ariaAdd: (name: string) => string;
  };
}

export function UpsellSection({
  upsellItems,
  isLoadingUpsell,
  menuPath,
  language,
  currencyCode,
  resolveAndFormatPrice,
  onAdd,
  labels,
}: UpsellSectionProps) {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  if (upsellItems.length === 0 && !isLoadingUpsell) return null;

  return (
    <section className="overflow-hidden">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-[18.5px] font-semibold leading-[1.15] tracking-[-0.6px] text-[var(--color-ink)]">
            {labels.title}
          </h2>
          <p className="mt-[3px] text-[12.5px] tracking-[-0.1px] text-[var(--color-ink-muted)]">
            {labels.subtitle}
          </p>
        </div>
        <Link
          href={menuPath}
          className="flex items-center gap-0.5 text-[13px] font-medium text-[var(--color-accent)]"
        >
          {labels.seeAll}
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>

      <div className="-mx-4 overflow-x-auto scrollbar-hide px-4">
        <div className="flex min-w-max gap-3.5">
          {isLoadingUpsell && upsellItems.length === 0
            ? [1, 2, 3].map((i) => (
                <div key={i} className="w-[200px] shrink-0">
                  <div className="h-[140px] w-full animate-pulse rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)]" />
                  <div className="px-0.5 pt-2.5">
                    <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-[var(--color-surface-alt)]" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-surface-alt)]" />
                  </div>
                </div>
              ))
            : upsellItems.map((item) => {
                const hasImage =
                  item.image_url &&
                  !item.image_url.includes('placeholder') &&
                  !imageErrors.has(item.id);

                return (
                  <div key={item.id} className="w-[200px] shrink-0">
                    <div className="relative h-[140px] w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)]">
                      {hasImage ? (
                        <Image
                          src={item.image_url!}
                          alt={item.name}
                          fill
                          sizes="200px"
                          className="object-cover"
                          onError={() => setImageErrors((prev) => new Set(prev).add(item.id))}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Utensils className="h-7 w-7 text-[var(--color-ink-soft)]" />
                        </div>
                      )}
                      <Button
                        size="icon"
                        onClick={() => onAdd(item)}
                        className={`absolute bottom-2 right-2 z-10 h-[34px] w-[34px] rounded-full bg-white p-0 hover:bg-white active:scale-90 ${UPSELL_PLUS_SHADOW}`}
                        aria-label={labels.ariaAdd(item.name)}
                      >
                        <Plus
                          className="h-[18px] w-[18px] text-[var(--color-ink)]"
                          strokeWidth={2.6}
                        />
                      </Button>
                    </div>
                    <div className="px-0.5 pt-2.5">
                      <h3 className="truncate text-[13.5px] font-semibold leading-[1.3] tracking-[-0.2px] text-[var(--color-ink)]">
                        {getTranslatedContent(language, item.name, item.name_en)}
                      </h3>
                      <span className="mt-[5px] block text-[13.5px] font-bold tabular-nums text-[var(--color-ink)]">
                        {resolveAndFormatPrice(item.price, item.prices, currencyCode)}
                      </span>
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </section>
  );
}
