'use client';

import { Loader2, ChefHat, Wine, Shuffle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AdminModal from '@/components/admin/AdminModal';
import { CategoryIconPicker } from '@/components/admin/CategoryIconPicker';
import { cn } from '@/lib/utils';
import { suggestIconForName, getLucideIcon } from '@/lib/config/lucide-food-icons';
import { useSegmentTerms } from '@/hooks/useSegmentTerms';
import type { Menu, PreparationZone } from '@/types/admin.types';
import type { CategoryWithCount } from './types';

const FEATURED_LIMIT = 8;

interface CategoryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingCategory: CategoryWithCount | null;
  categories: CategoryWithCount[];
  menus: Pick<Menu, 'id' | 'name'>[];
  saving: boolean;
  name: string;
  setName: (value: string) => void;
  nameEn: string;
  setNameEn: (value: string) => void;
  displayOrder: number | string;
  setDisplayOrder: (value: number | string) => void;
  preparationZone: PreparationZone;
  setPreparationZone: (value: PreparationZone) => void;
  isFeaturedOnHome: boolean;
  setIsFeaturedOnHome: (value: boolean) => void;
  menuId: string;
  setMenuId: (value: string) => void;
  isActive: boolean;
  setIsActive: (value: boolean) => void;
  iconName: string | null;
  setIconName: (value: string | null) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function CategoryFormModal({
  isOpen,
  onClose,
  editingCategory,
  categories,
  menus,
  saving,
  name,
  setName,
  nameEn,
  setNameEn,
  displayOrder,
  setDisplayOrder,
  preparationZone,
  setPreparationZone,
  isFeaturedOnHome,
  setIsFeaturedOnHome,
  menuId,
  setMenuId,
  isActive,
  setIsActive,
  iconName,
  setIconName,
  onSubmit,
}: CategoryFormModalProps) {
  const t = useTranslations('categories');
  const tc = useTranslations('common');
  const seg = useSegmentTerms();

  const featuredCount = categories.filter((c) => c.is_featured_on_home === true).length;

  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingCategory ? t('editCategoryTitle') : t('newCategoryTitle')}
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-5 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name" className="text-app-text">
              {t('nameFr')}
            </Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!iconName) {
                  const suggested = suggestIconForName(e.target.value);
                  if (suggested) setIconName(suggested);
                }
              }}
              placeholder={t('nameFrPlaceholder')}
              className="rounded-lg border border-app-border text-app-text focus-visible:ring-accent"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-name-en" className="text-app-text">
              {t('nameEn')}
            </Label>
            <Input
              id="cat-name-en"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder={t('nameEnPlaceholder')}
              className="rounded-lg border border-app-border text-app-text focus-visible:ring-accent"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-order" className="text-app-text">
            {t('displayOrder')}
          </Label>
          <Input
            id="cat-order"
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value === '' ? '' : Number(e.target.value))}
            min={0}
            className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
          />
        </div>
        {/* Menu selector */}
        {menus.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="cat-menu" className="text-app-text">
              {t('menu')}
            </Label>
            <Select value={menuId} onValueChange={setMenuId}>
              <SelectTrigger id="cat-menu" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {menus.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {/* Featured on home toggle */}
        <div className="space-y-1.5 rounded-lg border border-app-border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label htmlFor="cat-featured" className="text-app-text">
                {t('featuredOnHome')}
              </Label>
              <p className="text-xs text-app-text-muted mt-1">{t('featuredOnHomeDesc')}</p>
            </div>
            <Switch
              id="cat-featured"
              checked={isFeaturedOnHome}
              onCheckedChange={setIsFeaturedOnHome}
            />
          </div>
          {isFeaturedOnHome &&
            featuredCount >= FEATURED_LIMIT &&
            !(editingCategory && editingCategory.is_featured_on_home === true) && (
              <p className="text-xs text-[var(--warning)] font-medium mt-2">
                {t('featuredOnHomeLimit', { count: FEATURED_LIMIT })}
              </p>
            )}
        </div>

        {/* Active toggle */}
        <div className="space-y-1.5 rounded-lg border border-app-border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label htmlFor="cat-active" className="text-app-text">
                {t('isActive')}
              </Label>
              <p className="text-xs text-app-text-muted mt-1">{t('isActiveDesc')}</p>
            </div>
            <Switch id="cat-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        {/* Icon picker */}
        <div className="space-y-1.5 rounded-lg border border-app-border p-3">
          <div className="flex items-center gap-2 mb-2">
            {iconName &&
              (() => {
                const Icon = getLucideIcon(iconName);
                return <Icon className="w-4 h-4 text-accent shrink-0" />;
              })()}
            <Label className="text-app-text">{t('icon')}</Label>
          </div>
          <CategoryIconPicker
            value={iconName}
            usedIcons={categories
              .filter((c) => !editingCategory || c.id !== editingCategory.id)
              .map((c) => c.icon)
              .filter((i): i is string => !!i)}
            onChange={setIconName}
          />
        </div>

        {/* Preparation zone selector */}
        <div className="space-y-1.5">
          <Label className="text-app-text">{t('preparationZone')}</Label>
          <p className="text-xs text-app-text-muted">{t('preparationZoneDesc')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            {(
              [
                { value: 'kitchen', icon: ChefHat, label: seg.productionZone },
                { value: 'bar', icon: Wine, label: t('zoneBar') },
                { value: 'both', icon: Shuffle, label: t('zoneBoth') },
              ] as const
            ).map(({ value, icon: Icon, label }) => (
              <Button
                key={value}
                type="button"
                variant="outline"
                onClick={() => setPreparationZone(value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 p-3 h-auto rounded-lg border text-xs font-medium transition-all',
                  preparationZone === value
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-app-border text-app-text-muted hover:border-app-text-secondary hover:text-app-text-secondary',
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" disabled={saving} variant="default">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editingCategory ? t('update') : t('create')}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
