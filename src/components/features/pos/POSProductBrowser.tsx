'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Search, Utensils, SearchX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils/currency';
import type { MenuItem, Category, CurrencyCode } from '@/types/admin.types';
import type { CartItem } from '@/hooks/usePOSData';

interface POSProductBrowserProps {
  items: MenuItem[];
  categories: Category[];
  cart: CartItem[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  onAddToCart: (item: MenuItem) => void;
  currency: CurrencyCode;
}

export default function POSProductBrowser({
  items,
  categories,
  cart,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  onAddToCart,
  currency,
}: POSProductBrowserProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');

  return (
    <>
      {/* Header Filters */}
      <div className="p-3 sm:p-4 border-b border-app-border space-y-3 sm:space-y-4">
        <div className="flex flex-col @sm:flex-row gap-3 sm:gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
            <Input
              data-search-input
              placeholder={t('searchProduct')}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <Button
            variant={selectedCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory('all')}
            className="rounded-full min-h-[44px]"
          >
            {tc('all')}
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat.id)}
              className="rounded-full whitespace-nowrap min-h-[44px]"
            >
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar">
        {items.length > 0 ? (
          <div className="grid grid-cols-2 @sm:grid-cols-3 @md:grid-cols-2 @lg:grid-cols-3 @xl:grid-cols-3 @2xl:grid-cols-4 gap-3">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => onAddToCart(item)}
                className="text-left group bg-app-elevated hover:bg-app-hover border border-app-border hover:border-accent/30 rounded-xl p-3 transition-all active:scale-95 flex flex-col h-full"
              >
                <div className="aspect-square bg-app-card rounded-lg mb-3 flex items-center justify-center relative overflow-hidden">
                  {item.image_url ? (
                    <Image src={item.image_url} alt="" fill className="object-cover" />
                  ) : (
                    <Utensils className="w-8 h-8 text-app-text-muted/40" />
                  )}
                  {cart.find((c) => c.id === item.id) && (
                    <div className="absolute top-2 right-2 bg-accent text-accent-text w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                      {cart.find((c) => c.id === item.id)?.quantity}
                    </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col">
                  <h3 className="font-semibold text-sm text-app-text leading-tight mb-1">
                    {item.name}
                  </h3>
                  <p className="text-xs font-bold text-app-text-secondary mt-auto">
                    {formatCurrency(item.price, currency)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-app-text-muted">
            <SearchX className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">{t('noResults')}</p>
          </div>
        )}
      </div>
    </>
  );
}
