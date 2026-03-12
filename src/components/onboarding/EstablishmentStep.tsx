'use client';

import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Building2,
  Coffee,
  Flame,
  Heart,
  Hotel,
  MapPin,
  Minus,
  Phone,
  Plus,
  Scissors,
  ShoppingCart,
  Store,
  UtensilsCrossed,
  Wine,
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
  { id: 'retail', icon: ShoppingCart, titleKey: 'typeRetail' },
  { id: 'boutique', icon: Store, titleKey: 'typeBoutique' },
  { id: 'pharmacy', icon: Heart, titleKey: 'typePharmacy' },
  { id: 'salon', icon: Scissors, titleKey: 'typeSalon' },
  { id: 'other', icon: Building2, titleKey: 'typeOther' },
] as const;

const localeLabels: Record<string, { label: string; flag: string }> = {
  'fr-FR': { label: 'Fran\u00e7ais (France)', flag: '\ud83c\uddeb\ud83c\uddf7' },
  'en-US': { label: 'English (US)', flag: '\ud83c\uddfa\ud83c\uddf8' },
};

interface EstablishmentStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
  variant?: 'identity' | 'details';
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
    <div className="flex items-center justify-between py-2">
      <Label className="text-sm font-medium text-app-text-secondary">{label}</Label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked ? 'bg-accent' : 'bg-app-elevated'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-app-card border border-app-border/50 transition-transform duration-200 ease-in-out ${
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
    <div className="py-1">
      <Label className="text-sm font-medium text-app-text-secondary mb-2 block">{label}</Label>
      <div className="rounded-xl border border-app-border bg-app-elevated/50 inline-flex items-center h-11">
        <button
          type="button"
          onClick={() => value > min && onChange(value - 1)}
          disabled={value <= min}
          className="px-3.5 h-full flex items-center justify-center text-app-text-secondary hover:text-app-text disabled:opacity-30 disabled:cursor-not-allowed rounded-l-xl hover:bg-app-hover transition-colors"
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
          className="w-16 text-center text-sm font-semibold text-app-text border-x border-app-border bg-transparent focus:outline-none h-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => value < max && onChange(value + 1)}
          disabled={value >= max}
          className="px-3.5 h-full flex items-center justify-center text-app-text-secondary hover:text-app-text disabled:opacity-30 disabled:cursor-not-allowed rounded-r-xl hover:bg-app-hover transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function EstablishmentStep({
  data,
  updateData,
  variant = 'identity',
}: EstablishmentStepProps) {
  const t = useTranslations('onboarding');
  const router = useRouter();

  const showIdentity = variant === 'identity';
  const showDetails = variant === 'details';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto" data-onboarding-scroll>
        <div className="px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5">
          {/* Header */}
          <div className="mb-3">
            <h1 className="text-base font-bold text-app-text mb-0.5">
              {showDetails ? t('addressLabel') : t('establishmentTitle')}
            </h1>
            <p className="text-app-text-secondary text-xs">
              {showDetails ? t('phoneLabel') : t('establishmentSubtitle')}
            </p>
          </div>

          {showIdentity && (
            <div className="mb-3">
              <Label
                htmlFor="tenantName"
                className="text-xs font-semibold text-app-text mb-1.5 block"
              >
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
          )}

          {showIdentity && (
            <div className="mb-3">
              <Label className="text-xs font-semibold text-app-text mb-2 block">
                {t('stepEstablishment')}
              </Label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {establishmentTypes.map((type) => {
                  const Icon = type.icon;
                  const isSelected = data.establishmentType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => updateData({ establishmentType: type.id })}
                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all duration-200 ${
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
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showDetails && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Address */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-5">
                  {t('addressLabel')}
                </p>

                <div className="space-y-4">
                  <div>
                    <Label
                      htmlFor="address"
                      className="text-sm font-medium text-app-text-secondary flex items-center gap-2 mb-1.5"
                    >
                      <MapPin className="h-3.5 w-3.5 text-app-text-muted" />
                      {t('addressLabel')}
                    </Label>
                    <Input
                      id="address"
                      type="text"
                      placeholder={t('addressPlaceholder')}
                      value={data.address}
                      onChange={(e) => updateData({ address: e.target.value })}
                      className="h-11 rounded-xl border-app-border bg-app-elevated/50 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label
                        htmlFor="city"
                        className="text-sm font-medium text-app-text-secondary mb-1.5 block"
                      >
                        {t('cityLabel')}
                      </Label>
                      <Input
                        id="city"
                        type="text"
                        placeholder={t('cityPlaceholder')}
                        value={data.city}
                        onChange={(e) => updateData({ city: e.target.value })}
                        className="h-11 rounded-xl border-app-border bg-app-elevated/50 text-sm"
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor="country"
                        className="text-sm font-medium text-app-text-secondary mb-1.5 block"
                      >
                        {t('countryLabel')}
                      </Label>
                      <Input
                        id="country"
                        type="text"
                        placeholder={t('countryLabel')}
                        value={data.country}
                        onChange={(e) => updateData({ country: e.target.value })}
                        className="h-11 rounded-xl border-app-border bg-app-elevated/50 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <Label
                      htmlFor="phone"
                      className="text-sm font-medium text-app-text-secondary flex items-center gap-2 mb-1.5"
                    >
                      <Phone className="h-3.5 w-3.5 text-app-text-muted" />
                      {t('phoneLabel')}
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder={t('phonePlaceholder')}
                      value={data.phone}
                      onChange={(e) => updateData({ phone: e.target.value })}
                      className="h-11 rounded-xl border-app-border bg-app-elevated/50 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Right: Configuration */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-5">
                  Configuration
                </p>

                <div className="space-y-4">
                  {/* Language */}
                  <div>
                    <Label className="text-sm font-medium text-app-text-secondary mb-1.5 block">
                      {t('languageLabel')}
                    </Label>
                    <Select
                      value={data.language}
                      onValueChange={(val) => {
                        updateData({ language: val });
                        document.cookie = `NEXT_LOCALE=${val};path=/;max-age=${60 * 60 * 24 * 365}`;
                        router.refresh();
                      }}
                    >
                      <SelectTrigger className="h-11 rounded-xl border-app-border bg-app-elevated/50 text-sm">
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
                    <Label className="text-sm font-medium text-app-text-secondary mb-1.5 block">
                      {t('currencyLabel')}
                    </Label>
                    <Select
                      value={data.currency}
                      onValueChange={(val) => updateData({ currency: val })}
                    >
                      <SelectTrigger className="h-11 rounded-xl border-app-border bg-app-elevated/50 text-sm">
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

                  {/* Type-specific fields */}
                  {data.establishmentType && (
                    <div className="pt-2 border-t border-app-border">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-3">
                        {t('typeSpecificLabel')}
                      </p>

                      {data.establishmentType === 'restaurant' && (
                        <div className="space-y-3">
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
                        </div>
                      )}

                      {data.establishmentType === 'hotel' && (
                        <div className="space-y-3">
                          <NumberStepper
                            label={t('roomCountLabel')}
                            value={data.tableCount}
                            min={1}
                            max={500}
                            onChange={(val) => updateData({ tableCount: val })}
                          />
                          <div>
                            <Label className="text-sm font-medium text-app-text-secondary mb-2 block">
                              {t('starRating')}
                            </Label>
                            <div className="flex gap-1.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => updateData({ starRating: star })}
                                  className={`w-10 h-10 rounded-xl border text-lg flex items-center justify-center transition-all ${
                                    (data.starRating || 0) >= star
                                      ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                                      : 'border-app-border text-app-text-muted hover:border-app-border-hover'
                                  }`}
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
                        </div>
                      )}

                      {data.establishmentType === 'bar' && (
                        <div className="space-y-3">
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
                        </div>
                      )}

                      {data.establishmentType === 'cafe' && (
                        <div className="space-y-3">
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
                        </div>
                      )}

                      {data.establishmentType === 'fastfood' && (
                        <div className="space-y-3">
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
                        </div>
                      )}

                      {(data.establishmentType === 'retail' ||
                        data.establishmentType === 'boutique' ||
                        data.establishmentType === 'pharmacy') && (
                        <div className="space-y-3">
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
                        </div>
                      )}

                      {data.establishmentType === 'salon' && (
                        <NumberStepper
                          label={t('totalCapacity')}
                          value={data.totalCapacity ?? 1}
                          min={1}
                          max={100}
                          onChange={(val) => updateData({ totalCapacity: val })}
                        />
                      )}

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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
