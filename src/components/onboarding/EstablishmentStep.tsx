'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Minus, Plus } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import { LOCALE_LABELS } from '@/i18n/config';
import type { OnboardingData } from '@/app/onboarding/page';

const COUNTRY_CURRENCY: Record<string, string> = {
  'Burkina Faso': 'XOF',
  Cameroun: 'XAF',
  Congo: 'XAF',
  RDC: 'USD',
  "Cote d'Ivoire": 'XOF',
  Gabon: 'XAF',
  Mali: 'XOF',
  Niger: 'XOF',
  RCA: 'XAF',
  Senegal: 'XOF',
  Tchad: 'XAF',
  Togo: 'XOF',
  Benin: 'XOF',
};

const establishmentTypes = [
  { id: 'restaurant', titleKey: 'typeRestaurant' },
  { id: 'hotel', titleKey: 'typeHotel' },
  { id: 'bar', titleKey: 'typeBar' },
  { id: 'cafe', titleKey: 'typeCafe' },
  { id: 'fastfood', titleKey: 'typeFastfood' },
  { id: 'other', titleKey: 'typeOther' },
] as const;

interface EstablishmentStepProps {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
  variant?: 'identity' | 'details';
}

function LabeledSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <Label className="text-sm font-medium text-app-text-secondary">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

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
      <div className="inline-flex items-center h-9 rounded-xl border border-app-border bg-app-elevated overflow-hidden focus-within:ring-0">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Decrease"
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="h-full w-9 rounded-none border-r border-app-border hover:bg-app-border/30 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <Minus className="h-4 w-4 text-app-text-secondary" />
        </Button>
        <span className="w-14 text-center font-semibold text-base text-app-text tabular-nums select-none">
          {value}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Increase"
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="h-full w-11 rounded-none border-l border-app-border hover:bg-app-border/30 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <Plus className="h-4 w-4 text-app-text-secondary" />
        </Button>
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
        <div
          className={`px-4 sm:px-6 lg:px-8 ${showDetails ? 'py-3 sm:py-4' : 'py-4 sm:py-6 lg:py-8'}`}
        >
          {/* Header */}
          <div className={showDetails ? 'mb-4' : 'mb-7'}>
            <h1 className="text-xl font-bold text-app-text mb-1.5">
              {showDetails ? t('detailsStepTitle') : t('establishmentTitle')}
            </h1>
            <p className="text-app-text-secondary text-sm">
              {showDetails ? t('detailsStepSubtitle') : t('establishmentSubtitle')}
            </p>
          </div>

          {showIdentity && (
            <div className="mb-6">
              <Label
                htmlFor="tenantName"
                className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted mb-2 block"
              >
                {t('nameLabel')}
              </Label>
              <div className="max-w-sm">
                <Input
                  id="tenantName"
                  type="text"
                  placeholder={t('namePlaceholder')}
                  value={data.tenantName}
                  onChange={(e) => updateData({ tenantName: e.target.value })}
                  className="h-12 rounded-xl border-app-border bg-app-elevated/50 text-base px-4 focus-visible:border-app-border-hover"
                />
              </div>
            </div>
          )}

          {showIdentity && (
            <div className="mb-3">
              <Label className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted mb-3 block">
                {t('stepEstablishment')}
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {establishmentTypes.map((type) => {
                  const isSelected = data.establishmentType === type.id;
                  return (
                    <Button
                      key={type.id}
                      type="button"
                      variant="outline"
                      onClick={() => updateData({ establishmentType: type.id })}
                      className={`h-10 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        isSelected
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-app-border text-app-text-secondary hover:border-app-border-hover hover:text-app-text'
                      }`}
                    >
                      {t(type.titleKey)}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {showDetails && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: Localisation */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted mb-2 pb-1 border-b border-app-border/50">
                  {t('locationSection')}
                </p>

                <div className="space-y-2.5">
                  {/* Adresse compl\u00e8te */}
                  <div>
                    <Label
                      htmlFor="address"
                      className="text-xs font-medium text-app-text-secondary mb-1.5 block"
                    >
                      {t('addressLabel')}
                    </Label>
                    <Input
                      id="address"
                      type="text"
                      placeholder={t('addressPlaceholder')}
                      value={data.address}
                      onChange={(e) => updateData({ address: e.target.value })}
                      className="h-9 rounded-xl border-app-border bg-app-elevated/50 text-sm"
                    />
                  </div>

                  {/* Ville + Pays \u2014 2 colonnes */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label
                        htmlFor="city"
                        className="text-xs font-medium text-app-text-secondary mb-1.5 block"
                      >
                        {t('cityLabel')}
                      </Label>
                      <Input
                        id="city"
                        type="text"
                        placeholder={t('cityPlaceholder')}
                        value={data.city}
                        onChange={(e) => updateData({ city: e.target.value })}
                        className="h-9 rounded-xl border-app-border bg-app-elevated/50 text-sm"
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor="country"
                        className="text-xs font-medium text-app-text-secondary mb-1.5 block"
                      >
                        {t('countryLabel')}
                      </Label>
                      <Select
                        value={data.country}
                        onValueChange={(val) => {
                          const updates: Partial<OnboardingData> = { country: val };
                          if (COUNTRY_CURRENCY[val]) updates.currency = COUNTRY_CURRENCY[val];
                          updateData(updates);
                        }}
                      >
                        <SelectTrigger
                          id="country"
                          className="h-9 rounded-xl border-app-border bg-app-elevated/50 text-sm"
                        >
                          <SelectValue placeholder={t('countryLabel')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Burkina Faso">Burkina Faso</SelectItem>
                          <SelectItem value="Cameroun">Cameroun</SelectItem>
                          <SelectItem value="Congo">Congo</SelectItem>
                          <SelectItem value="RDC">RDC (Congo Kinshasa)</SelectItem>
                          <SelectItem value="Cote d'Ivoire">{"Cote d'Ivoire"}</SelectItem>
                          <SelectItem value="Gabon">Gabon</SelectItem>
                          <SelectItem value="Guinee">Guinee</SelectItem>
                          <SelectItem value="Mali">Mali</SelectItem>
                          <SelectItem value="Mauritanie">Mauritanie</SelectItem>
                          <SelectItem value="Niger">Niger</SelectItem>
                          <SelectItem value="RCA">Republique Centrafricaine</SelectItem>
                          <SelectItem value="Senegal">Senegal</SelectItem>
                          <SelectItem value="Tchad">Tchad</SelectItem>
                          <SelectItem value="Togo">Togo</SelectItem>
                          <SelectItem value="Benin">Benin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* T\u00e9l\u00e9phone \u2014 pleine largeur */}
                  <div>
                    <Label
                      htmlFor="phone"
                      className="text-xs font-medium text-app-text-secondary mb-1.5 block"
                    >
                      {t('phoneLabel')}
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder={t('phonePlaceholder')}
                      value={data.phone}
                      onChange={(e) => updateData({ phone: e.target.value })}
                      className="h-9 rounded-xl border-app-border bg-app-elevated/50 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Right: Pr\u00e9f\u00e9rences */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted mb-2 pb-1 border-b border-app-border/50">
                  {t('settingsSection')}
                </p>

                <div className="space-y-2.5">
                  {/* Language + Currency */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Language */}
                    <div>
                      <Label className="text-xs font-medium text-app-text-secondary mb-1.5 block">
                        {t('languageLabel')}
                      </Label>
                      <Select
                        value={data.language}
                        onValueChange={(val) => {
                          updateData({ language: val });
                          document.cookie = `NEXT_LOCALE=${val};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Strict;Secure`;
                          router.refresh();
                        }}
                      >
                        <SelectTrigger className="h-9 rounded-xl border-app-border bg-app-elevated/50 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(LOCALE_LABELS).map(([code, { label }]) => (
                            <SelectItem key={code} value={code}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Currency */}
                    <div>
                      <Label className="text-xs font-medium text-app-text-secondary mb-1.5 block">
                        {t('currencyLabel')}
                      </Label>
                      <Select
                        value={data.currency}
                        onValueChange={(val) => updateData({ currency: val })}
                      >
                        <SelectTrigger className="h-9 rounded-xl border-app-border bg-app-elevated/50 text-sm">
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

                  {/* Type-specific fields */}
                  {data.establishmentType && (
                    <div className="pt-2 border-t border-app-border/50">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted mb-2">
                        {t('typeSpecificLabel')}
                      </p>

                      {data.establishmentType === 'restaurant' && (
                        <div className="grid grid-cols-2 gap-4">
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
                                <Button
                                  key={star}
                                  type="button"
                                  variant="outline"
                                  onClick={() => updateData({ starRating: star })}
                                  className={`w-10 h-10 rounded-xl border text-lg flex items-center justify-center transition-all p-0 ${
                                    (data.starRating || 0) >= star
                                      ? 'border-amber-400 bg-amber-400/10 text-amber-400'
                                      : 'border-app-border text-app-text-muted hover:border-app-border-hover'
                                  }`}
                                >
                                  ★
                                </Button>
                              ))}
                            </div>
                          </div>
                          <LabeledSwitch
                            label={t('hasRestaurant')}
                            checked={!!data.hasRestaurant}
                            onCheckedChange={() =>
                              updateData({ hasRestaurant: !data.hasRestaurant })
                            }
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
                          <LabeledSwitch
                            label={t('hasTerrace')}
                            checked={!!data.hasTerrace}
                            onCheckedChange={() => updateData({ hasTerrace: !data.hasTerrace })}
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
                          <LabeledSwitch
                            label={t('hasWifi')}
                            checked={!!data.hasWifi}
                            onCheckedChange={() => updateData({ hasWifi: !data.hasWifi })}
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
                          <LabeledSwitch
                            label={t('hasDelivery')}
                            checked={!!data.hasDelivery}
                            onCheckedChange={() => updateData({ hasDelivery: !data.hasDelivery })}
                          />
                        </div>
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
