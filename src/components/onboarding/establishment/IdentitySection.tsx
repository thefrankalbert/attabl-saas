'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Coffee, Flame, Hotel, Building2, UtensilsCrossed, Wine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OnboardingData } from '@/app/onboarding/page';

const establishmentTypes = [
  { id: 'restaurant', icon: UtensilsCrossed, titleKey: 'typeRestaurant' },
  { id: 'hotel', icon: Hotel, titleKey: 'typeHotel' },
  { id: 'bar', icon: Wine, titleKey: 'typeBar' },
  { id: 'cafe', icon: Coffee, titleKey: 'typeCafe' },
  { id: 'fastfood', icon: Flame, titleKey: 'typeFastfood' },
  { id: 'other', icon: Building2, titleKey: 'typeOther' },
] as const;

export function IdentitySection({
  data,
  updateData,
}: {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}) {
  const t = useTranslations('onboarding');

  return (
    <div className="space-y-6">
      {/* Name */}
      <div>
        <Label
          htmlFor="tenantName"
          className="mb-2 block text-xs font-medium text-app-text-secondary"
        >
          {t('nameLabel')}
        </Label>
        <Input
          id="tenantName"
          type="text"
          placeholder={t('namePlaceholder')}
          value={data.tenantName}
          onChange={(e) => updateData({ tenantName: e.target.value })}
          className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
        />
      </div>

      {/* Establishment type */}
      <div>
        <Label className="mb-2 block text-xs font-medium text-app-text-secondary">
          {t('stepEstablishment')}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {establishmentTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = data.establishmentType === type.id;
            return (
              <Button
                key={type.id}
                type="button"
                variant="ghost"
                onClick={() => updateData({ establishmentType: type.id })}
                className={`group h-auto justify-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150 ${
                  isSelected
                    ? 'bg-app-hover shadow-sm ring-1 ring-accent hover:bg-app-hover'
                    : 'border border-app-border bg-app-elevated hover:border-app-border-hover hover:bg-app-hover'
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
                    isSelected ? 'bg-app-card' : 'bg-app-card'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${isSelected ? 'text-app-text' : 'text-app-text-muted'}`}
                  />
                </span>
                <span
                  className={`text-sm font-medium ${
                    isSelected ? 'text-app-text' : 'text-app-text-secondary'
                  }`}
                >
                  {t(type.titleKey)}
                </span>
                {isSelected && <Check className="ml-auto h-4 w-4 shrink-0 text-app-text" />}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
