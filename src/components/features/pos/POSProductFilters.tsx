'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Category } from '@/types/admin.types';

interface POSProductFiltersProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  selectedCategory: string;
  categories: Category[];
  pillBarRef: RefObject<HTMLDivElement | null>;
  setPillRef: (id: string, el: HTMLButtonElement | null) => void;
  onCategoryClick: (id: string) => void;
}

/** Search field and category pills above the product grid of the till. */
export function POSProductFilters({
  searchQuery,
  setSearchQuery,
  selectedCategory,
  categories,
  pillBarRef,
  setPillRef,
  onCategoryClick,
}: POSProductFiltersProps) {
  const t = useTranslations('pos');
  const tc = useTranslations('common');

  return (
    <div className="p-3 sm:p-4 border-b border-app-border space-y-3 sm:space-y-4">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
        <Input
          data-search-input
          placeholder={t('searchProduct')}
          aria-label={t('searchProduct')}
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div ref={pillBarRef} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <Button
          ref={(el) => setPillRef('all', el)}
          variant={selectedCategory === 'all' ? 'default' : 'outline'}
          size="sm"
          aria-pressed={selectedCategory === 'all'}
          onClick={() => onCategoryClick('all')}
          className="rounded-full min-h-[44px]"
        >
          {tc('all')}
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat.id}
            ref={(el) => setPillRef(cat.id, el)}
            variant={selectedCategory === cat.id ? 'default' : 'outline'}
            size="sm"
            aria-pressed={selectedCategory === cat.id}
            onClick={() => onCategoryClick(cat.id)}
            className="rounded-full whitespace-nowrap min-h-[44px]"
          >
            {cat.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
