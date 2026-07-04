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
    <div className="flex items-center gap-2.5 p-2 rounded-xl bg-app-elevated hover:bg-app-elevated transition-colors">
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
          <div className="w-9 h-9 rounded-xl border border-app-border flex items-center justify-center">
            <Loader2 className="h-3.5 w-3.5 text-app-text-muted animate-spin" />
          </div>
        ) : item.imageUrl ? (
          <div className="relative w-9 h-9">
            <img src={item.imageUrl} alt="" className="w-9 h-9 rounded-xl object-cover" />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              aria-label="Remove image"
              onClick={() => updateArticle(categoryId, item.id, 'imageUrl', '')}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full p-0 min-w-0 min-h-0"
            >
              <X className="h-2.5 w-2.5 text-white" />
            </Button>
          </div>
        ) : (
          <Label
            htmlFor={`photo-${item.id}`}
            className="w-9 h-9 rounded-xl border border-dashed border-app-border flex items-center justify-center cursor-pointer hover:border-accent/40 transition-colors"
          >
            <Camera className="h-3.5 w-3.5 text-app-text-muted" />
          </Label>
        )}
      </div>
      <Input
        placeholder={t('articleNamePlaceholder')}
        value={item.name}
        onChange={(e) => updateArticle(categoryId, item.id, 'name', e.target.value)}
        className="flex-1 h-9 bg-app-bg border-app-border rounded-xl text-sm"
      />
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder={t('articlePrice')}
          value={item.price}
          onChange={(e) => updateArticle(categoryId, item.id, 'price', e.target.value)}
          className="w-28 h-9 bg-app-bg border-app-border rounded-xl text-sm"
        />
        <span className="text-xs text-app-text-muted font-medium">{currency || 'EUR'}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => deleteArticle(categoryId, item.id)}
        className="p-1.5 rounded-lg text-app-text-muted hover:text-status-error hover:bg-status-error-bg transition-colors shrink-0 h-7 w-7"
        aria-label={t('deleteArticle')}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
