'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils/currency';
import { revalidateMenuCache } from '@/lib/revalidate';
import type { Menu, Category, CurrencyCode } from '@/types/admin.types';

export interface WizardItem {
  id: string;
  name: string;
  price: number;
}

interface WizardStepItemsProps {
  menu: Menu;
  category: Category;
  tenantId: string;
  currency: CurrencyCode;
  items: WizardItem[];
  onItemCreated: (item: WizardItem) => void;
  onBack: () => void;
  onFinish: () => void;
}

export default function WizardStepItems({
  menu,
  category,
  tenantId,
  currency,
  items,
  onItemCreated,
  onBack,
  onFinish,
}: WizardStepItemsProps) {
  const t = useTranslations('menus');
  const { toast } = useToast();
  const supabase = createClient();

  const [name, setName] = useState('');
  const [price, setPrice] = useState<number | string>('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const numericPrice = Number(price) || 0;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        price: numericPrice,
        description: description.trim() || null,
        category_id: category.id,
        tenant_id: tenantId,
        is_available: true,
        is_featured: false,
        display_order: items.length,
      };
      const { data, error } = await supabase
        .from('menu_items')
        .insert([payload])
        .select('id, name, price')
        .single();
      if (error) throw error;
      toast({ title: t('wizardItemAdded', { name: data.name }) });
      onItemCreated({ id: data.id, name: data.name, price: data.price });
      setName('');
      setPrice('');
      setDescription('');
      revalidateMenuCache();
    } catch {
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 pt-2">
      {/* Breadcrumb context */}
      <div className="flex items-center gap-1.5 text-xs text-app-text-secondary">
        <span className="px-2 py-0.5 rounded bg-accent/10 text-accent font-medium">
          {menu.name}
        </span>
        <span className="text-app-text-muted">/</span>
        <span className="px-2 py-0.5 rounded bg-app-elevated text-app-text font-medium">
          {category.name}
        </span>
      </div>

      {/* List of added items */}
      {items.length > 0 && (
        <div className="border border-app-border rounded-lg divide-y divide-app-border">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-app-text">{item.name}</p>
              </div>
              <span className="text-sm font-medium text-app-text-secondary tabular-nums">
                {formatCurrency(item.price, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Quick-add form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="wizard-item-name" className="text-app-text">
              {t('wizardItemName')}
            </Label>
            <Input
              id="wizard-item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('wizardItemNamePlaceholder')}
              className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wizard-item-price" className="text-app-text">
              {t('wizardItemPrice', { currency })}
            </Label>
            <Input
              id="wizard-item-price"
              type="number"
              min={0}
              step="any"
              value={price}
              onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wizard-item-desc" className="text-app-text">
            {t('wizardItemDescription')}
          </Label>
          <Input
            id="wizard-item-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('wizardItemDescPlaceholder')}
            className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
          />
        </div>

        <div className="flex justify-between gap-3 pt-4 border-t border-app-border">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onBack} className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              {t('wizardBackToCategories')}
            </Button>
            <Button type="button" variant="ghost" onClick={onFinish}>
              {t('wizardFinish')}
            </Button>
          </div>
          <Button type="submit" disabled={saving} variant="default" className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t('wizardAddItem')}
          </Button>
        </div>
      </form>
    </div>
  );
}
