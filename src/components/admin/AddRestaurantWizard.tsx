'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowLeft, ArrowRight, Check, X, Building2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { logger } from '@/lib/logger';
import { createRestaurantSchema, ESTABLISHMENT_TYPES } from '@/lib/validations/restaurant.schema';
import type { CreateRestaurantInput } from '@/lib/validations/restaurant.schema';

// --- Slug generator -----------------------------------------
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// --- Type keys (mapped to translation keys) ----------------
const TYPE_KEYS: Record<string, string> = {
  restaurant: 'addRestaurant.typeRestaurant',
  hotel: 'addRestaurant.typeHotel',
  'bar-cafe': 'addRestaurant.typeBarCafe',
  boulangerie: 'addRestaurant.typeBoulangerie',
  'dark-kitchen': 'addRestaurant.typeDarkKitchen',
  'food-truck': 'addRestaurant.typeFoodTruck',
  'quick-service': 'addRestaurant.typeQuickService',
};

interface AddRestaurantWizardProps {
  onClose: () => void;
  onSuccess: (slug: string) => void;
}

export function AddRestaurantWizard({ onClose, onSuccess }: AddRestaurantWizardProps) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Slug d'un etablissement cree SANS essai: il demande un abonnement des le depart.
  const [needsSubscriptionSlug, setNeedsSubscriptionSlug] = useState<string | null>(null);

  // Step 1 data
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  // --- Validation ------------------------------------------
  const step1Data: CreateRestaurantInput = {
    name,
    type: type as CreateRestaurantInput['type'],
    slug,
  };
  const step1Valid = createRestaurantSchema.safeParse(step1Data).success;

  // --- Auto-slug -------------------------------------------
  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugEdited) {
      setSlug(nameToSlug(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugEdited(true);
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  };

  // --- Submit ----------------------------------------------
  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/restaurants/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, slug }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'RESTAURANT_NAME_TAKEN') {
          throw new Error(t('addRestaurant.nameTaken'));
        }
        throw new Error(data.error || t('addRestaurant.creationError'));
      }

      if (data.trialMode === 'none') {
        setNeedsSubscriptionSlug(data.slug);
        setLoading(false);
        return;
      }
      onSuccess(data.slug);
    } catch (err) {
      logger.error('Restaurant creation failed', err);
      setError(err instanceof Error ? err.message : t('addRestaurant.unknownError'));
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-lg rounded-xl border border-app-border bg-app-card">
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={tc('aria.close')}
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg text-app-text-muted hover:bg-app-elevated hover:text-app-text-secondary"
        >
          <X className="h-5 w-5" />
        </Button>

        {/* Header */}
        <div className="border-b border-app-border px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-accent p-2">
              <Building2 className="h-5 w-5 text-accent-text" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-app-text">{t('addRestaurant.title')}</h2>
              <p className="text-xs text-app-text-muted">
                {t('addRestaurant.stepOf', { step, total: 2 })}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 flex gap-2">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-accent' : 'bg-app-elevated'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        {needsSubscriptionSlug ? (
          <div className="space-y-4 px-6 py-6">
            <h3 className="text-base font-semibold text-app-text">
              {t('addRestaurant.subscriptionNeededTitle')}
            </h3>
            <p className="text-sm text-app-text-secondary">
              {t('addRestaurant.subscriptionNeededDesc')}
            </p>
            <Button onClick={() => onSuccess(needsSubscriptionSlug)} className="w-full">
              {t('addRestaurant.subscriptionNeededCta')}
            </Button>
          </div>
        ) : null}
        <div className={needsSubscriptionSlug ? 'hidden' : 'px-6 py-6'}>
          {/* --- STEP 1: Info ------------------------------ */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium text-app-text">
                  {t('addRestaurant.nameLabel')}
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={t('addRestaurant.namePlaceholder')}
                  className="h-11 rounded-lg border-app-border focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-restaurant-type" className="text-sm font-medium text-app-text">
                  {t('addRestaurant.typeLabel')}
                </Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger
                    id="add-restaurant-type"
                    className="h-11 rounded-lg border-app-border"
                  >
                    <SelectValue placeholder={t('addRestaurant.typePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTABLISHMENT_TYPES.map((estType) => (
                      <SelectItem key={estType} value={estType}>
                        {TYPE_KEYS[estType] ? t(TYPE_KEYS[estType]) : estType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slug" className="text-sm font-medium text-app-text">
                  {t('addRestaurant.slugLabel')}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder={t('addRestaurant.slugPlaceholder')}
                    className="h-11 rounded-lg border-app-border focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                  <span className="shrink-0 text-xs text-app-text-muted">.attabl.com</span>
                </div>
              </div>
            </div>
          )}

          {/* --- STEP 2: Summary -------------------------- */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl bg-app-bg p-4">
                <div className="mb-4 flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-accent" />
                  <p className="text-sm font-bold text-app-text">{t('addRestaurant.summary')}</p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-xs text-app-text-secondary">
                      {t('addRestaurant.summaryName')}
                    </span>
                    <span className="text-sm font-medium text-app-text">{name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-app-text-secondary">
                      {t('addRestaurant.summaryType')}
                    </span>
                    <span className="text-sm font-medium text-app-text">
                      {TYPE_KEYS[type] ? t(TYPE_KEYS[type]) : type}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-app-text-secondary">
                      {t('addRestaurant.summaryAddress')}
                    </span>
                    <span className="text-sm font-medium text-app-text">{slug}.attabl.com</span>
                  </div>
                  <div className="space-y-1 border-t border-app-border pt-3">
                    <p className="text-xs text-app-text-secondary">
                      {t('addRestaurant.summaryBilling')}
                    </p>
                    <p className="text-sm text-app-text">
                      {t('addRestaurant.summaryBillingValue')}
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-[var(--border)] p-3">
                  <p className="text-sm text-[var(--destructive)]">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={
            needsSubscriptionSlug
              ? 'hidden'
              : 'flex items-center justify-between border-t border-app-border px-6 py-4'
          }
        >
          <Button
            variant="outline"
            onClick={step === 1 ? onClose : () => setStep(step - 1)}
            className="gap-2 rounded-lg border-app-border text-sm text-app-text-secondary"
            disabled={loading}
          >
            {step === 1 ? (
              t('addRestaurant.cancel')
            ) : (
              <>
                <ArrowLeft className="h-4 w-4" />
                {t('addRestaurant.back')}
              </>
            )}
          </Button>

          {step < 2 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!step1Valid}
              className="gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-text hover:bg-accent-hover disabled:opacity-50"
            >
              {t('addRestaurant.next')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-text hover:bg-accent-hover"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('addRestaurant.creating')}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {t('addRestaurant.create')}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
