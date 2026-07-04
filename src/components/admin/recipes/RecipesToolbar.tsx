'use client';

import { Search, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { RecipeFilter } from './types';

interface RecipesToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filterRecipe: RecipeFilter;
  onFilterChange: (value: RecipeFilter) => void;
  canEdit: boolean;
  onImportClick: () => void;
}

export default function RecipesToolbar({
  searchQuery,
  onSearchChange,
  filterRecipe,
  onFilterChange,
  canEdit,
  onImportClick,
}: RecipesToolbarProps) {
  const t = useTranslations('inventory');
  const tc = useTranslations('common');

  return (
    /* Toolbar on its own row (never crushes the title, like StockHistory) */
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="relative w-full md:w-64">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-text-muted" />
        <Input
          data-search-input
          placeholder={t('searchDish')}
          className="pl-9"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="flex shrink-0 gap-2 overflow-x-auto scrollbar-hide">
        {(['all', 'with', 'without'] as const).map((f) => (
          <Button
            key={f}
            variant={filterRecipe === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => onFilterChange(f)}
            className="rounded-full whitespace-nowrap"
          >
            {f === 'all' ? tc('all') : f === 'with' ? t('hasRecipe') : t('noRecipe')}
          </Button>
        ))}
      </div>

      {canEdit && (
        <Button
          variant="outline"
          size="sm"
          onClick={onImportClick}
          className="gap-2 shrink-0 whitespace-nowrap lg:ml-auto"
        >
          <Upload className="w-4 h-4" />
          {t('importTechnicalSheets')}
        </Button>
      )}
    </div>
  );
}
