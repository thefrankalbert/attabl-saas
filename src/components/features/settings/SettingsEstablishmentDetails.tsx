'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LabeledSwitch, NumberStepper } from '@/components/onboarding/establishment/controls';
import type { UseFormReturn } from 'react-hook-form';
import type { SettingsFormValues } from '@/hooks/useSettingsData';
import type { EstablishmentDetails } from '@/lib/validations/establishment-details.schema';
import { DEFAULT_CAPACITY } from '@/services/table-config.types';

/**
 * The type-specific details asked during the onboarding (stars, restaurant,
 * terrace, wifi, registers, delivery, capacity), editable here so the owner
 * never has to redo the onboarding to change them. Same controls, same
 * bounds and same labels as the onboarding screen.
 */
export default function SettingsEstablishmentDetails({
  form,
}: {
  form: UseFormReturn<SettingsFormValues>;
}) {
  const t = useTranslations('onboarding');
  const type = form.watch('establishmentType') || 'restaurant';
  const details: EstablishmentDetails = form.watch('establishmentDetails') ?? {};

  const update = (patch: Partial<EstablishmentDetails>) => {
    form.setValue(
      'establishmentDetails',
      { ...details, ...patch },
      { shouldDirty: true, shouldValidate: true },
    );
  };

  let fields: React.ReactNode = null;
  if (type === 'restaurant') {
    fields = (
      <NumberStepper
        label={t('totalCapacity')}
        // C-079: sans saisie, "1" s'affichait pour 10 tables. On affiche
        // l'estimation des tables (2 places chacune).
        value={
          details.totalCapacity ?? Math.max(1, (form.watch('tableCount') ?? 0) * DEFAULT_CAPACITY)
        }
        min={1}
        max={9999}
        onChange={(val) => update({ totalCapacity: val })}
      />
    );
  } else if (type === 'hotel') {
    fields = (
      <>
        <div>
          <Label className="mb-2 block text-sm font-medium text-app-text-secondary">
            {t('starRating')}
          </Label>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <Button
                key={star}
                type="button"
                variant="outline"
                aria-label={`${t('starRating')} ${star}`}
                aria-pressed={(details.starRating || 0) >= star}
                onClick={() => update({ starRating: star })}
                className={`h-11 w-11 p-0 text-lg ${
                  (details.starRating || 0) >= star
                    ? 'bg-app-hover text-app-text ring-1 ring-accent'
                    : 'text-app-text-muted'
                }`}
              >
                ★
              </Button>
            ))}
          </div>
        </div>
        <LabeledSwitch
          label={t('hasRestaurant')}
          checked={!!details.hasRestaurant}
          onCheckedChange={(checked) => update({ hasRestaurant: checked })}
        />
      </>
    );
  } else if (type === 'bar') {
    fields = (
      <LabeledSwitch
        label={t('hasTerrace')}
        checked={!!details.hasTerrace}
        onCheckedChange={(checked) => update({ hasTerrace: checked })}
      />
    );
  } else if (type === 'cafe') {
    fields = (
      <LabeledSwitch
        label={t('hasWifi')}
        checked={!!details.hasWifi}
        onCheckedChange={(checked) => update({ hasWifi: checked })}
      />
    );
  } else if (type === 'fastfood') {
    fields = (
      <>
        <NumberStepper
          label={t('registerCount')}
          value={details.registerCount ?? 1}
          min={1}
          max={100}
          onChange={(val) => update({ registerCount: val })}
        />
        <LabeledSwitch
          label={t('hasDelivery')}
          checked={!!details.hasDelivery}
          onCheckedChange={(checked) => update({ hasDelivery: checked })}
        />
      </>
    );
  }

  if (!fields) return null;

  return (
    <div className="space-y-3 rounded-lg border border-app-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
        {t('typeSpecificLabel')}
      </p>
      {fields}
    </div>
  );
}
