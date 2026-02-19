'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Building2,
  Coffee,
  Flame,
  Hotel,
  MapPin,
  Minus,
  Phone,
  Plus,
  UtensilsCrossed,
  Wine,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OnboardingData } from '@/app/onboarding/page';

const establishmentTypes = [
  {
    id: 'restaurant',
    icon: UtensilsCrossed,
    titleKey: 'typeRestaurant',
    descKey: 'typeRestaurantDesc',
  },
  { id: 'hotel', icon: Hotel, titleKey: 'typeHotel', descKey: 'typeHotelDesc' },
  { id: 'bar', icon: Wine, titleKey: 'typeBar', descKey: 'typeBarDesc' },
  { id: 'cafe', icon: Coffee, titleKey: 'typeCafe', descKey: 'typeCafeDesc' },
  { id: 'fastfood', icon: Flame, titleKey: 'typeFastfood', descKey: 'typeFastfoodDesc' },
  { id: 'other', icon: Building2, titleKey: 'typeOther', descKey: 'typeOtherDesc' },
] as const;

interface EstablishmentStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

export function EstablishmentStep({ data, updateData }: EstablishmentStepProps) {
  const t = useTranslations('onboarding');

  const handleDecrement = () => {
    if (data.tableCount > 1) {
      updateData({ tableCount: data.tableCount - 1 });
    }
  };

  const handleIncrement = () => {
    if (data.tableCount < 500) {
      updateData({ tableCount: data.tableCount + 1 });
    }
  };

  return (
    <div>
      {/* Title & Subtitle */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">{t('establishmentTitle')}</h1>
        <p className="text-neutral-500 text-sm">{t('establishmentSubtitle')}</p>
      </div>

      {/* Tenant Name */}
      <div className="mb-4">
        <Label htmlFor="tenantName" className="text-sm font-medium text-neutral-700">
          {t('nameLabel')}
        </Label>
        <Input
          id="tenantName"
          type="text"
          placeholder={t('namePlaceholder')}
          value={data.tenantName}
          onChange={(e) => updateData({ tenantName: e.target.value })}
          className="mt-1.5 h-10 rounded-xl border-neutral-200 text-sm"
        />
      </div>

      {/* Establishment Type */}
      <div className="mb-4">
        <Label className="text-sm font-medium text-neutral-700 mb-2 block">
          {t('stepEstablishment')}
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {establishmentTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = data.establishmentType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => updateData({ establishmentType: type.id })}
                className={`rounded-xl p-4 border text-left transition-all ${
                  isSelected
                    ? 'border-[#CCFF00] bg-[#CCFF00]/5'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <Icon className="h-5 w-5 mb-2 text-neutral-700" />
                <span className="font-medium text-neutral-900 text-sm block">
                  {t(type.titleKey)}
                </span>
                <span className="text-neutral-500 text-xs block">{t(type.descKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Address */}
      <div className="space-y-3 mb-4">
        <div>
          <Label
            htmlFor="address"
            className="text-sm font-medium text-neutral-700 flex items-center gap-2"
          >
            <MapPin className="h-3.5 w-3.5" />
            {t('addressLabel')}
          </Label>
          <Input
            id="address"
            type="text"
            placeholder={t('addressPlaceholder')}
            value={data.address}
            onChange={(e) => updateData({ address: e.target.value })}
            className="mt-1.5 h-10 rounded-xl border-neutral-200 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="city" className="text-sm font-medium text-neutral-700">
              {t('cityLabel')}
            </Label>
            <Input
              id="city"
              type="text"
              placeholder={t('cityPlaceholder')}
              value={data.city}
              onChange={(e) => updateData({ city: e.target.value })}
              className="mt-1.5 h-10 rounded-xl border-neutral-200 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="country" className="text-sm font-medium text-neutral-700">
              {t('countryLabel')}
            </Label>
            <Input
              id="country"
              type="text"
              placeholder={t('countryLabel')}
              value={data.country}
              onChange={(e) => updateData({ country: e.target.value })}
              className="mt-1.5 h-10 rounded-xl border-neutral-200 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Phone & Table/Room Count */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label
            htmlFor="phone"
            className="text-sm font-medium text-neutral-700 flex items-center gap-2"
          >
            <Phone className="h-3.5 w-3.5" />
            {t('phoneLabel')}
          </Label>
          <Input
            id="phone"
            type="tel"
            placeholder={t('phonePlaceholder')}
            value={data.phone}
            onChange={(e) => updateData({ phone: e.target.value })}
            className="mt-1.5 h-10 rounded-xl border-neutral-200 text-sm"
          />
        </div>
        <div>
          <Label className="text-sm font-medium text-neutral-700 mb-1.5 block">
            {data.establishmentType === 'hotel' ? t('roomCountLabel') : t('tableCountLabel')}
          </Label>
          <div className="rounded-xl border border-neutral-200 inline-flex items-center h-10">
            <button
              type="button"
              onClick={handleDecrement}
              disabled={data.tableCount <= 1}
              className="px-3 h-full flex items-center justify-center text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="px-4 text-sm font-medium text-neutral-900 min-w-[3rem] text-center">
              {data.tableCount}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={data.tableCount >= 500}
              className="px-3 h-full flex items-center justify-center text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
