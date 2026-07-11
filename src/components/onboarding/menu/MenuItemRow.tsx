/* eslint-disable @next/next/no-img-element */
'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Camera, X, Loader2 } from 'lucide-react';
import type { CategoryItem } from './menu-data';

interface MenuItemRowProps {
  categoryId: string;
  item: CategoryItem;
  currency?: string;
  uploadingItemId: string | null;
  updateArticle: (
    categoryId: string,
    itemId: string,
    field: 'name' | 'price' | 'imageUrl',
    value: string,
  ) => void;
  deleteArticle: (categoryId: string, itemId: string) => void;
  handleItemPhotoUpload: (categoryId: string, itemId: string, file: File) => void;
}

export function MenuItemRow({
  categoryId,
  item,
  currency,
  uploadingItemId,
  updateArticle,
  deleteArticle,
  handleItemPhotoUpload,
}: MenuItemRowProps) {
  const t = useTranslations('onboarding');

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-app-border bg-app-elevated p-2 shadow-sm transition-colors hover:bg-app-hover">
      {/* Photo upload */}
      <div className="relative shrink-0">
        {/* eslint-disable-next-line react/forbid-elements -- <input type="file"> is the CLAUDE.md-documented exception (no shadcn equivalent) */}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          id={`photo-${item.id}`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            handleItemPhotoUpload(categoryId, item.id, file);
            if (e.target) e.target.value = '';
          }}
        />
        {uploadingItemId === item.id ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-app-border">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-app-text-muted" />
          </div>
        ) : item.imageUrl ? (
          <div className="relative h-9 w-9">
            <img src={item.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              aria-label="Remove image"
              onClick={() => updateArticle(categoryId, item.id, 'imageUrl', '')}
              className="absolute -right-1 -top-1 h-4 w-4 min-h-0 min-w-0 rounded-full p-0"
            >
              <X className="h-2.5 w-2.5 text-white" />
            </Button>
          </div>
        ) : (
          <Label
            htmlFor={`photo-${item.id}`}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-dashed border-app-border transition-colors hover:border-accent/40 hover:bg-app-hover"
          >
            <Camera className="h-3.5 w-3.5 text-app-text-muted" />
          </Label>
        )}
      </div>
      <Input
        placeholder={t('articleNamePlaceholder')}
        value={item.name}
        onChange={(e) => updateArticle(categoryId, item.id, 'name', e.target.value)}
        className="h-10 flex-1 rounded-lg border-app-border bg-app-elevated px-3.5 text-base md:text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
      />
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder={t('articlePrice')}
          value={item.price}
          onChange={(e) => updateArticle(categoryId, item.id, 'price', e.target.value)}
          className="h-10 w-28 rounded-lg border-app-border bg-app-elevated px-3.5 text-base md:text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
        />
        <span className="text-xs font-medium text-app-text-muted">{currency || 'EUR'}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => deleteArticle(categoryId, item.id)}
        className="h-7 w-7 shrink-0 rounded-lg p-1.5 text-app-text-muted transition-colors hover:bg-status-error-bg hover:text-status-error"
        aria-label={t('deleteArticle')}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
