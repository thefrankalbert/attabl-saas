'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ChefHat, Wine, Shuffle, Plus, Utensils } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { revalidateMenuCache } from '@/lib/revalidate';
import type { Menu, Category, PreparationZone } from '@/types/admin.types';
import { createCategoryService } from '@/services/category.service';

interface WizardStepCategoriesProps {
  menu: Menu;
  tenantId: string;
  categories: Category[];
  onCategoryCreated: (category: Category) => void;
  onAddItems: (category: Category) => void;
  onFinish: () => void;
}

export default function WizardStepCategories({
  menu,
  tenantId,
  categories,
  onCategoryCreated,
  onAddItems,
  onFinish,
}: WizardStepCategoriesProps) {
  const t = useTranslations('menus');
  const { toast } = useToast();
  const supabase = createClient();

  const [name, setName] = useState('');
  const [preparationZone, setPreparationZone] = useState<PreparationZone>('kitchen');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        preparation_zone: preparationZone,
        tenant_id: tenantId,
        menu_id: menu.id,
        display_order: categories.length,
      };
      const categoryService = createCategoryService(supabase);
      const data = await categoryService.createCategory(payload, { returning: true });
      toast({ title: t('categoryCreated') });
      onCategoryCreated(data as Category);
      setName('');
      setPreparationZone('kitchen');
      revalidateMenuCache();
    } catch {
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pt-2">
      {/* Context badge */}
      <div className="flex items-center gap-2 text-xs text-app-text-secondary">
        <span className="px-2 py-0.5 rounded bg-accent/10 text-accent font-normal">
          {menu.name}
        </span>
      </div>

      {/* List of added categories */}
      {categories.length > 0 && (
        <div className="border border-app-border rounded-lg divide-y divide-app-border">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-normal text-app-text">{cat.name}</p>
              </div>
              {cat.preparation_zone && cat.preparation_zone !== 'kitchen' && (
                <span
                  className={cn(
                    'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide',
                    cat.preparation_zone === 'bar'
                      ? 'bg-purple-500/10 text-purple-400'
                      : 'bg-blue-500/10 text-blue-400',
                  )}
                >
                  {cat.preparation_zone === 'bar' ? (
                    <Wine className="w-3 h-3" />
                  ) : (
                    <Shuffle className="w-3 h-3" />
                  )}
                  {cat.preparation_zone}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAddItems(cat)}
                className="h-8 gap-1.5 text-xs text-accent hover:text-accent hover:bg-accent/10"
              >
                <Utensils className="w-3.5 h-3.5" />
                {t('wizardAddItemsButton')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Quick-add form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="wizard-cat-name" className="text-app-text">
            {t('categoryNameFr')}
          </Label>
          <Input
            id="wizard-cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('wizardCategoryPlaceholder')}
            className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
            required
            autoFocus
          />
        </div>

        {/* Preparation zone */}
        <div className="space-y-1.5">
          <Label className="text-app-text">{t('wizardPreparationZone')}</Label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: 'kitchen', icon: ChefHat, labelKey: 'wizardZoneKitchen' as const },
                { value: 'bar', icon: Wine, labelKey: 'wizardZoneBar' as const },
                { value: 'both', icon: Shuffle, labelKey: 'wizardZoneBoth' as const },
              ] as const
            ).map(({ value, icon: Icon, labelKey }) => (
              <Button
                key={value}
                type="button"
                variant="outline"
                onClick={() => setPreparationZone(value)}
                className={cn(
                  'flex flex-col items-center gap-1 p-2.5 rounded-lg text-xs font-normal h-auto',
                  preparationZone === value
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-app-border text-app-text-muted hover:border-app-text-secondary hover:text-app-text-secondary',
                )}
              >
                <Icon className="w-4 h-4" />
                {t(labelKey)}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex justify-between gap-3 pt-4 border-t border-app-border">
          <Button type="button" variant="ghost" onClick={onFinish}>
            {t('wizardFinish')}
          </Button>
          <Button type="submit" disabled={saving} variant="default" className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t('wizardAddCategory')}
          </Button>
        </div>
      </form>
    </div>
  );
}
