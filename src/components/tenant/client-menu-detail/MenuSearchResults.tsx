'use client';

import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { MenuItem } from '@/types/admin.types';

interface MenuSearchResultsProps {
  searchQuery: string;
  searchResults: MenuItem[];
  lang: 'fr' | 'en';
  currency?: string;
  onSelectItem: (item: MenuItem) => void;
}

export default function MenuSearchResults({
  searchQuery,
  searchResults,
  lang,
  currency,
  onSelectItem,
}: MenuSearchResultsProps) {
  const t = useTranslations('tenant');
  const { resolveAndFormatPrice } = useDisplayCurrency();

  return (
    <div className="fixed inset-x-0 top-[63px] bottom-0 z-[35] bg-white overflow-y-auto">
      <div className="px-4 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
        {searchResults.length === 0 && (
          <p className="text-center text-sm py-8 text-[#B0B0B0]">
            {t('noSearchResults', { query: searchQuery })}
          </p>
        )}
        {searchResults.length > 0 && (
          <div className="rounded-xl overflow-hidden bg-white border border-[#EEEEEE] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
            <div className="p-2">
              <h3 className="px-3 py-2 text-[11px] font-medium text-[#B0B0B0] uppercase tracking-[1px]">
                {t('dishesFound')}
              </h3>
              {searchResults.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  onClick={() => onSelectItem(item)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left justify-start h-auto hover:bg-[#F6F6F6]"
                >
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="text-sm font-bold text-[#1A1A1A] truncate">
                      {lang === 'en' && item.name_en ? item.name_en : item.name}
                    </p>
                  </div>
                  <span className="text-sm font-bold flex-shrink-0 text-[#1A1A1A]">
                    {resolveAndFormatPrice(item.price, item.prices, currency)}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#B0B0B0]" />
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
