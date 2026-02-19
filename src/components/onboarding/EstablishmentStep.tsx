'use client';

import { useState } from 'react';
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
  Globe,
  Banknote,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const localeLabels: Record<string, { label: string; flag: string }> = {
  'fr-FR': { label: 'Français (France)', flag: '🇫🇷' },
  'fr-CA': { label: 'Français (Canada)', flag: '🇨🇦' },
  'en-US': { label: 'English (US)', flag: '🇺🇸' },
  'en-GB': { label: 'English (UK)', flag: '🇬🇧' },
  'en-AU': { label: 'English (Australia)', flag: '🇦🇺' },
  'en-CA': { label: 'English (Canada)', flag: '🇨🇦' },
  'en-IE': { label: 'English (Ireland)', flag: '🇮🇪' },
  'es-ES': { label: 'Español (España)', flag: '🇪🇸' },
};

type EstablishmentTab = 'location' | 'details' | 'preferences';

interface EstablishmentStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

export function EstablishmentStep({ data, updateData }: EstablishmentStepProps) {
  const t = useTranslations('onboarding');
  const [activeTab, setActiveTab] = useState<EstablishmentTab>('location');

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

  const tabs: { id: EstablishmentTab; icon: typeof MapPin; label: string }[] = [
    { id: 'location', icon: MapPin, label: 'Localisation' },
    { id: 'details', icon: SlidersHorizontal, label: 'Détails' },
    { id: 'preferences', icon: Globe, label: 'Préférences' },
  ];

  return (
    <div>
      {/* Title & Subtitle */}
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">{t('establishmentTitle')}</h1>
        <p className="text-neutral-500 text-sm">{t('establishmentSubtitle')}</p>
      </div>

      {/* Tenant Name */}
      <div className="mb-3">
        <Label htmlFor="tenantName" className="text-sm font-medium text-neutral-700">
          {t('nameLabel')}
        </Label>
        <Input
          id="tenantName"
          type="text"
          placeholder={t('namePlaceholder')}
          value={data.tenantName}
          onChange={(e) => updateData({ tenantName: e.target.value })}
          className="mt-1 h-10 rounded-xl border-neutral-200 text-sm"
        />
      </div>

      {/* Establishment Type — compact grid */}
      <div className="mb-3">
        <Label className="text-sm font-medium text-neutral-700 mb-1.5 block">
          {t('stepEstablishment')}
        </Label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {establishmentTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = data.establishmentType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => updateData({ establishmentType: type.id })}
                className={`rounded-xl p-2.5 border text-center transition-all ${
                  isSelected
                    ? 'border-[#CCFF00] bg-[#CCFF00]/5'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <Icon className="h-4 w-4 mx-auto mb-1 text-neutral-700" />
                <span className="font-medium text-neutral-900 text-xs block truncate">
                  {t(type.titleKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-3 border-b border-neutral-100 pb-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                isActive
                  ? 'border-[#CCFF00] text-neutral-900 bg-neutral-50'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'location' && (
        <div className="space-y-3">
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
      )}

      {activeTab === 'details' && (
        <div className="space-y-3">
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
              <input
                type="number"
                min={1}
                max={500}
                value={data.tableCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= 500) {
                    updateData({ tableCount: val });
                  }
                }}
                className="w-14 text-center text-sm font-medium text-neutral-900 border-0 bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
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
      )}

      {activeTab === 'preferences' && (
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium text-neutral-700 flex items-center gap-2">
              <Globe className="h-3.5 w-3.5" />
              {t('languageLabel')}
            </Label>
            <Select value={data.language} onValueChange={(val) => updateData({ language: val })}>
              <SelectTrigger className="mt-1.5 h-10 rounded-xl border-neutral-200 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(localeLabels).map(([code, { label, flag }]) => (
                  <SelectItem key={code} value={code}>
                    <span className="inline-flex items-center gap-2">
                      <span>{flag}</span>
                      <span>{label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm font-medium text-neutral-700 flex items-center gap-2">
              <Banknote className="h-3.5 w-3.5" />
              {t('currencyLabel')}
            </Label>
            <Select value={data.currency} onValueChange={(val) => updateData({ currency: val })}>
              <SelectTrigger className="mt-1.5 h-10 rounded-xl border-neutral-200 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">EUR ({'\u20ac'})</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="GBP">GBP ({'\u00a3'})</SelectItem>
                <SelectItem value="XAF">XAF (FCFA)</SelectItem>
                <SelectItem value="XOF">XOF (FCFA)</SelectItem>
                <SelectItem value="MAD">
                  MAD ({'\u062f'}.{'\u0645'}.)
                </SelectItem>
                <SelectItem value="TND">
                  TND ({'\u062f'}.{'\u062a'})
                </SelectItem>
                <SelectItem value="CAD">CAD ($)</SelectItem>
                <SelectItem value="CHF">CHF (Fr.)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
