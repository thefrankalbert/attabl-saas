'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  ClipboardList,
  Settings2,
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
  'fr-FR': { label: 'Fran\u00e7ais (France)', flag: '\ud83c\uddeb\ud83c\uddf7' },
  'fr-CA': { label: 'Fran\u00e7ais (Canada)', flag: '\ud83c\udde8\ud83c\udde6' },
  'en-US': { label: 'English (US)', flag: '\ud83c\uddfa\ud83c\uddf8' },
  'en-GB': { label: 'English (UK)', flag: '\ud83c\uddec\ud83c\udde7' },
  'en-AU': { label: 'English (Australia)', flag: '\ud83c\udde6\ud83c\uddfa' },
  'en-CA': { label: 'English (Canada)', flag: '\ud83c\udde8\ud83c\udde6' },
  'en-IE': { label: 'English (Ireland)', flag: '\ud83c\uddee\ud83c\uddea' },
  'es-ES': { label: 'Espa\u00f1ol (Espa\u00f1a)', flag: '\ud83c\uddea\ud83c\uddf8' },
};

type EstablishmentTab = 'details' | 'preferences';

interface EstablishmentStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}

/** Compact toggle switch component */
function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm font-medium text-neutral-700">{label}</Label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked ? 'bg-[#CCFF00]' : 'bg-neutral-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

/** Compact stepper for numeric values */
function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
}) {
  return (
    <div>
      <Label className="text-sm font-medium text-neutral-700 mb-1.5 block">{label}</Label>
      <div className="rounded-xl border border-neutral-200 inline-flex items-center h-10">
        <button
          type="button"
          onClick={() => value > min && onChange(value - 1)}
          disabled={value <= min}
          className="px-3 h-full flex items-center justify-center text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= min && val <= max) {
              onChange(val);
            }
          }}
          className="w-14 text-center text-sm font-medium text-neutral-900 border-0 bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => value < max && onChange(value + 1)}
          disabled={value >= max}
          className="px-3 h-full flex items-center justify-center text-neutral-600 hover:text-neutral-900 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function EstablishmentStep({ data, updateData }: EstablishmentStepProps) {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<EstablishmentTab>('details');

  const tabs: { id: EstablishmentTab; icon: typeof MapPin; label: string }[] = [
    { id: 'details', icon: ClipboardList, label: t('detailsTab') },
    { id: 'preferences', icon: Settings2, label: t('preferencesTab') },
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

      {/* Sub-tabs: Details | Preferences */}
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

      {/* ─── Details Tab ─── */}
      {/* Address, city, country, phone */}
      {activeTab === 'details' && (
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
        </div>
      )}

      {/* ─── Preferences Tab ─── */}
      {/* Language, currency + type-specific fields (counts, toggles) */}
      {activeTab === 'preferences' && (
        <div className="space-y-3">
          {/* Language */}
          <div>
            <Label className="text-sm font-medium text-neutral-700">{t('languageLabel')}</Label>
            <Select
              value={data.language}
              onValueChange={(val) => {
                updateData({ language: val });
                document.cookie = `NEXT_LOCALE=${val};path=/;max-age=${60 * 60 * 24 * 365}`;
                router.refresh();
              }}
            >
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

          {/* Currency */}
          <div>
            <Label className="text-sm font-medium text-neutral-700">{t('currencyLabel')}</Label>
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

          {/* Divider — type-specific section */}
          {data.establishmentType && (
            <div className="pt-1 border-t border-neutral-100">
              <p className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium mb-2">
                {t('typeSpecificLabel')}
              </p>
            </div>
          )}

          {/* restaurant: table count + total capacity */}
          {data.establishmentType === 'restaurant' && (
            <>
              <NumberStepper
                label={t('tableCountLabel')}
                value={data.tableCount}
                min={1}
                max={500}
                onChange={(val) => updateData({ tableCount: val })}
              />
              <NumberStepper
                label={t('totalCapacity')}
                value={data.totalCapacity ?? 1}
                min={1}
                max={9999}
                onChange={(val) => updateData({ totalCapacity: val })}
              />
            </>
          )}

          {/* hotel: room count + star rating + has restaurant */}
          {data.establishmentType === 'hotel' && (
            <>
              <NumberStepper
                label={t('roomCountLabel')}
                value={data.tableCount}
                min={1}
                max={500}
                onChange={(val) => updateData({ tableCount: val })}
              />
              <div>
                <Label className="text-sm font-medium text-neutral-700 mb-1.5 block">
                  {t('starRating')}
                </Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => updateData({ starRating: star })}
                      className={`text-lg ${(data.starRating || 0) >= star ? 'text-yellow-400' : 'text-neutral-200'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <ToggleSwitch
                label={t('hasRestaurant')}
                checked={!!data.hasRestaurant}
                onChange={() => updateData({ hasRestaurant: !data.hasRestaurant })}
              />
            </>
          )}

          {/* bar: table count + terrace toggle */}
          {data.establishmentType === 'bar' && (
            <>
              <NumberStepper
                label={t('tableCountLabel')}
                value={data.tableCount}
                min={1}
                max={500}
                onChange={(val) => updateData({ tableCount: val })}
              />
              <ToggleSwitch
                label={t('hasTerrace')}
                checked={!!data.hasTerrace}
                onChange={() => updateData({ hasTerrace: !data.hasTerrace })}
              />
            </>
          )}

          {/* cafe: seat count + wifi toggle */}
          {data.establishmentType === 'cafe' && (
            <>
              <NumberStepper
                label={t('seatCount')}
                value={data.tableCount}
                min={1}
                max={500}
                onChange={(val) => updateData({ tableCount: val })}
              />
              <ToggleSwitch
                label={t('hasWifi')}
                checked={!!data.hasWifi}
                onChange={() => updateData({ hasWifi: !data.hasWifi })}
              />
            </>
          )}

          {/* fastfood: register count + delivery toggle */}
          {data.establishmentType === 'fastfood' && (
            <>
              <NumberStepper
                label={t('registerCount')}
                value={data.registerCount ?? 1}
                min={1}
                max={100}
                onChange={(val) => updateData({ registerCount: val })}
              />
              <ToggleSwitch
                label={t('hasDelivery')}
                checked={!!data.hasDelivery}
                onChange={() => updateData({ hasDelivery: !data.hasDelivery })}
              />
            </>
          )}

          {/* other: generic table count */}
          {data.establishmentType === 'other' && (
            <NumberStepper
              label={t('tableCountLabel')}
              value={data.tableCount}
              min={1}
              max={500}
              onChange={(val) => updateData({ tableCount: val })}
            />
          )}
        </div>
      )}
    </div>
  );
}
