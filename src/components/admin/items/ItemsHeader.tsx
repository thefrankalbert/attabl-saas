'use client';

import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import type { Category } from '@/types/admin.types';

interface ItemsHeaderProps {
  categories: Category[];
  categoryFilterValue: string;
  availableFilterValue: string;
  onCategoryChange: (value: string) => void;
  onAvailableChange: (value: string) => void;
  onAddItem: () => void;
}

export function ItemsHeader({
  categories,
  categoryFilterValue,
  availableFilterValue,
  onCategoryChange,
  onAvailableChange,
  onAddItem,
}: ItemsHeaderProps) {
  const t = useTranslations('items');
  const seg = useSegmentTerms();

  return (
    <AdminPageHeader
      title={t('title')}
      actions={
        <>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Select value={categoryFilterValue} onValueChange={onCategoryChange}>
              <SelectTrigger className="h-9 w-full sm:w-44 text-xs rounded-lg border border-app-border text-app-text focus:ring-accent/30">
                <SelectValue placeholder={t('allCategories')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allCategories')}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={availableFilterValue} onValueChange={onAvailableChange}>
              <SelectTrigger className="h-9 w-full sm:w-36 text-xs rounded-lg border border-app-border text-app-text focus:ring-accent/30">
                <SelectValue placeholder={t('all')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all')}</SelectItem>
                <SelectItem value="available">{t('inStock')}</SelectItem>
                <SelectItem value="unavailable">{t('outOfStock')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={onAddItem} variant="default" className="gap-2 h-9 shrink-0">
            <Plus className="w-4 h-4" /> {seg.addItem}
          </Button>
        </>
      }
    />
  );
}
