'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Coffee, Flame, Hotel, Building2, UtensilsCrossed, Wine } from 'lucide-react';
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
    <>
      <div className="mb-3">
        <Label htmlFor="tenantName" className="text-xs font-semibold text-app-text mb-1.5 block">
          {t('nameLabel')}
        </Label>
        <Input
          id="tenantName"
          type="text"
          placeholder={t('namePlaceholder')}
          value={data.tenantName}
          onChange={(e) => updateData({ tenantName: e.target.value })}
          className="h-10 rounded-xl border-app-border bg-app-elevated/50 text-sm px-4 focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/30"
        />
      </div>

      <div className="mb-3">
        <Label className="text-xs font-semibold text-app-text mb-2 block">
          {t('stepEstablishment')}
        </Label>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
          {establishmentTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = data.establishmentType === type.id;
            return (
              <Button
                key={type.id}
                type="button"
                variant="outline"
                onClick={() => updateData({ establishmentType: type.id })}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all duration-200 h-auto ${
                  isSelected
                    ? 'border-accent bg-accent/5'
                    : 'border-app-border hover:border-app-border-hover'
                }`}
              >
                <div
                  className={`p-2 rounded-xl transition-colors ${
                    isSelected ? 'bg-accent/10' : 'bg-app-elevated'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${isSelected ? 'text-accent' : 'text-app-text-muted'}`}
                  />
                </div>
                <span
                  className={`font-medium text-[10px] text-center leading-tight ${
                    isSelected ? 'text-app-text' : 'text-app-text-secondary'
                  }`}
                >
                  {t(type.titleKey)}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    </>
  );
}
