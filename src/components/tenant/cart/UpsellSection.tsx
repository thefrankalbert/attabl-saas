'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getTranslatedContent } from '@/lib/utils/translate';
import type { CurrencyCode } from '@/types/admin.types';
import type { UpsellItem } from '@/hooks/useCartSuggestions';

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
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Utensils className="w-5 h-5 text-[#1A1A1A]" />
          <h2 className="text-[20px] font-bold text-[#1A1A1A]">{labels.title}</h2>
        </div>
        <Link href={menuPath} className="text-[14px] font-semibold text-[#1A1A1A]">
          {labels.seeAll}
        </Link>
      </div>

      <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
        <div className="flex gap-3 min-w-max">
          {isLoadingUpsell && upsellItems.length === 0
            ? [1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-[160px] flex-shrink-0 bg-white rounded-xl border border-[#EEEEEE] animate-pulse overflow-hidden"
                >
                  <div className="w-full h-[110px] bg-[#F6F6F6]" />
                  <div className="p-2.5">
                    <div className="h-4 w-3/4 bg-[#F6F6F6] rounded mb-2" />
                    <div className="h-3 w-1/2 bg-[#F6F6F6] rounded" />
                  </div>
                </div>
              ))
            : upsellItems.map((item) => {
                const hasImage =
                  item.image_url &&
                  !item.image_url.includes('placeholder') &&
                  !imageErrors.has(item.id);

                return (
                  <div
                    key={item.id}
                    className="w-[160px] flex-shrink-0 bg-white rounded-xl border border-[#EEEEEE] overflow-hidden"
                  >
                    <div className="w-full h-[110px] overflow-hidden relative bg-[#F6F6F6] flex items-center justify-center">
                      {hasImage ? (
                        <Image
                          src={item.image_url!}
                          alt={item.name}
                          fill
                          sizes="160px"
                          className="object-cover"
                          onError={() => setImageErrors((prev) => new Set(prev).add(item.id))}
                        />
                      ) : (
                        <Utensils className="w-6 h-6 text-[#B0B0B0]" />
                      )}
                      <Button
                        size="icon"
                        onClick={() => onAdd(item)}
                        className="absolute bottom-2 right-2 z-10 w-7 h-7 rounded-full bg-[#1A1A1A] hover:bg-black active:scale-90"
                        aria-label={labels.ariaAdd(item.name)}
                      >
                        <Plus className="w-4 h-4 text-white" />
                      </Button>
                    </div>
                    <div className="p-2.5">
                      <h3 className="text-[15px] font-semibold text-[#1A1A1A] leading-tight line-clamp-2 mb-1.5">
                        {getTranslatedContent(language, item.name, item.name_en)}
                      </h3>
                      <span className="text-[14px] font-bold text-[#1A1A1A]">
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
