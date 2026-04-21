'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AdminModal from '@/components/admin/AdminModal';
import ImageUpload from '@/components/shared/ImageUpload';
import { cn } from '@/lib/utils';
import { ALLERGENS } from '@/lib/config/allergens';
import { useToast } from '@/components/ui/use-toast';
import type { Category, CurrencyCode, MenuItem } from '@/types/admin.types';

export type FormStep = 1 | 2 | 3;

export interface ItemFormState {
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  price: number | string;
  categoryId: string;
  imageUrl: string;
  isAvailable: boolean;
  isFeatured: boolean;
  allergens: string[];
  calories: number | '';
  prices: Record<string, number>;
  formStep: FormStep;
}

export interface ItemFormSetters {
  setName: (v: string) => void;
  setNameEn: (v: string) => void;
  setDescription: (v: string) => void;
  setDescriptionEn: (v: string) => void;
  setPrice: (v: number | string) => void;
  setCategoryId: (v: string) => void;
  setImageUrl: (v: string) => void;
  setIsAvailable: (v: boolean) => void;
  setIsFeatured: (v: boolean) => void;
  setAllergens: (updater: (prev: string[]) => string[]) => void;
  setCalories: (v: number | '') => void;
  setPrices: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
  setFormStep: (updater: (prev: FormStep) => FormStep) => void;
}

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingItem: MenuItem | null;
  categories: Category[];
  secondaryCurrencies: CurrencyCode[];
  saving: boolean;
  onSubmit: () => void;
  state: ItemFormState;
  setters: ItemFormSetters;
}

export function ItemFormModal({
  isOpen,
  onClose,
  editingItem,
  categories,
  secondaryCurrencies,
  saving,
  onSubmit,
  state,
  setters,
}: ItemFormModalProps) {
  const t = useTranslations('items');
  const ta = useTranslations('allergens');
  const { toast } = useToast();

  const {
    name,
    nameEn,
    description,
    descriptionEn,
    price,
    categoryId,
    imageUrl,
    isAvailable,
    isFeatured,
    allergens,
    calories,
    prices,
    formStep,
  } = state;

  return (
    <AdminModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingItem ? t('editItemTitle') : t('newItemTitle')}
      size="lg"
    >
      <div className="pt-2">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {([1, 2, 3] as const).map((step) => {
            const isActive = formStep === step;
            const isCompleted = formStep > step;
            const labels = [t('stepBasicInfo'), t('stepPricing'), t('stepPhotoDetails')];
            return (
              <Button
                key={step}
                type="button"
                variant="outline"
                onClick={() => {
                  if (step < formStep) setters.setFormStep(() => step as FormStep);
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium h-auto',
                  isActive
                    ? 'bg-accent/10 text-accent border-accent/30'
                    : isCompleted
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 cursor-pointer'
                      : 'bg-app-bg text-app-text-muted border-app-border cursor-default',
                )}
              >
                {isCompleted ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <span
                    className={cn(
                      'w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold',
                      isActive ? 'bg-accent text-white' : 'bg-app-border text-app-text-muted',
                    )}
                  >
                    {step}
                  </span>
                )}
                <span className="hidden sm:inline">{labels[step - 1]}</span>
              </Button>
            );
          })}
        </div>

        {/* Step 1 - Basic Info */}
        {formStep === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-app-text">{t('nameFr')}</Label>
                <Input
                  value={name}
                  onChange={(e) => setters.setName(e.target.value)}
                  placeholder={t('nameFrPlaceholder')}
                  className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-app-text">{t('nameEn')}</Label>
                <Input
                  value={nameEn}
                  onChange={(e) => setters.setNameEn(e.target.value)}
                  placeholder={t('nameEnPlaceholder')}
                  className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-app-text">{t('descriptionFr')}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setters.setDescription(e.target.value)}
                  placeholder={t('descriptionFrPlaceholder')}
                  rows={3}
                  className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-app-text">{t('descriptionEn')}</Label>
                <Textarea
                  value={descriptionEn}
                  onChange={(e) => setters.setDescriptionEn(e.target.value)}
                  placeholder={t('descriptionEnPlaceholder')}
                  rows={3}
                  className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-app-text">{t('category')}</Label>
              <Select value={categoryId} onValueChange={setters.setCategoryId}>
                <SelectTrigger className="rounded-lg border border-app-border text-app-text focus:ring-accent/30 w-full sm:w-64">
                  <SelectValue placeholder={t('selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step 2 - Pricing & Availability */}
        {formStep === 2 && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-app-text">{t('price')}</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) =>
                  setters.setPrice(e.target.value === '' ? '' : Number(e.target.value))
                }
                min={0}
                className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30 w-full sm:w-48"
              />
            </div>
            {secondaryCurrencies.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-app-text-muted">{t('optionalPriceHint')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {secondaryCurrencies.map((cur) => (
                    <div key={cur} className="space-y-1">
                      <Label className="text-app-text text-xs">
                        {t('priceInCurrency', { currency: cur })}
                      </Label>
                      <Input
                        type="number"
                        value={prices[cur] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setters.setPrices((prev) => {
                            if (val === '' || Number(val) === 0) {
                              const next = { ...prev };
                              delete next[cur];
                              return next;
                            }
                            return { ...prev, [cur]: Number(val) };
                          });
                        }}
                        min={0}
                        step={cur === 'XAF' ? 1 : 0.01}
                        placeholder="0"
                        className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Switch checked={isAvailable} onCheckedChange={setters.setIsAvailable} />
                <Label className="text-sm text-app-text">{t('available')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isFeatured} onCheckedChange={setters.setIsFeatured} />
                <Label className="text-sm text-app-text">{t('featured')}</Label>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 - Photo & Details */}
        {formStep === 3 && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-app-text">{t('imageUrl')}</Label>
              <ImageUpload
                value={imageUrl}
                onChange={(url) => setters.setImageUrl(url)}
                onRemove={() => setters.setImageUrl('')}
                bucket="menu-items"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-app-text flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                {ta('title')}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {ALLERGENS.map((a) => {
                  const selected = allergens.includes(a);
                  return (
                    <Button
                      key={a}
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setters.setAllergens((prev) =>
                          selected ? prev.filter((x) => x !== a) : [...prev, a],
                        )
                      }
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium h-auto',
                        selected
                          ? 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                          : 'bg-app-bg text-app-text-secondary border-app-border hover:border-app-border-hover',
                      )}
                    >
                      {ta(a)}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-app-text">{ta('calories')}</Label>
              <Input
                type="number"
                value={calories}
                onChange={(e) =>
                  setters.setCalories(e.target.value === '' ? '' : Number(e.target.value))
                }
                min={0}
                placeholder={ta('caloriesPlaceholder')}
                className="rounded-lg border border-app-border text-app-text focus-visible:ring-1 focus-visible:ring-accent/30 w-full sm:w-48"
              />
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between gap-3 pt-5 mt-5 border-t border-app-border">
          <div>
            {formStep > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setters.setFormStep((s) => (s - 1) as FormStep)}
              >
                {t('previous')}
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            {formStep < 3 ? (
              <Button
                type="button"
                variant="default"
                onClick={() => {
                  if (formStep === 1) {
                    if (!name.trim()) {
                      toast({ title: t('validationNameRequired'), variant: 'destructive' });
                      return;
                    }
                    if (!categoryId) {
                      toast({ title: t('validationCategoryRequired'), variant: 'destructive' });
                      return;
                    }
                  }
                  if (formStep === 2) {
                    if (!price || Number(price) <= 0) {
                      toast({ title: t('validationPriceRequired'), variant: 'destructive' });
                      return;
                    }
                  }
                  setters.setFormStep((s) => (s + 1) as FormStep);
                }}
              >
                {t('next')}
              </Button>
            ) : (
              <Button type="button" disabled={saving} variant="default" onClick={onSubmit}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingItem ? t('update') : t('create')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </AdminModal>
  );
}
