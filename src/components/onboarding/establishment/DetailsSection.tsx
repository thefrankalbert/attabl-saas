'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Phone } from 'lucide-react';
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
import { LabeledSwitch, NumberStepper } from './controls';

export function DetailsSection({
  data,
  updateData,
}: {
  data: OnboardingData;
  updateData: (data: Partial<OnboardingData>) => void;
}) {
  const t = useTranslations('onboarding');
  const router = useRouter();

  return (
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
              className="mb-2 flex items-center gap-2 text-xs font-medium text-app-text-secondary"
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
              className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label
                htmlFor="city"
                className="mb-2 block text-xs font-medium text-app-text-secondary"
              >
                {t('cityLabel')}
              </Label>
              <Input
                id="city"
                type="text"
                placeholder={t('cityPlaceholder')}
                value={data.city}
                onChange={(e) => updateData({ city: e.target.value })}
                className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
              />
            </div>
            <div>
              <Label
                htmlFor="country"
                className="mb-2 block text-xs font-medium text-app-text-secondary"
              >
                {t('countryLabel')}
              </Label>
              <Input
                id="country"
                type="text"
                placeholder={t('countryLabel')}
                value={data.country}
                onChange={(e) => updateData({ country: e.target.value })}
                className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
              />
            </div>
          </div>

          <div>
            <Label
              htmlFor="phone"
              className="mb-2 flex items-center gap-2 text-xs font-medium text-app-text-secondary"
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
              className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15"
            />
          </div>
        </div>
      </div>

      {/* Right: Configuration */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-app-text-muted mb-5">
          {t('configurationLabel')}
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
                document.cookie = `NEXT_LOCALE=${val};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Strict;Secure`;
                router.refresh();
              }}
            >
              <SelectTrigger className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LOCALE_LABELS).map(([code, { label, flag }]) => (
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
            <Select value={data.currency} onValueChange={(val) => updateData({ currency: val })}>
              <SelectTrigger className="h-10 rounded-lg border-app-border bg-app-elevated px-3.5 text-sm shadow-sm focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/15">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">EUR ({'\u20ac'})</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="GBP">GBP ({'£'})</SelectItem>
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
                    <Label className="mb-2 block text-xs font-medium text-app-text-secondary">
                      {t('starRating')}
                    </Label>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Button
                          key={star}
                          type="button"
                          variant="outline"
                          onClick={() => updateData({ starRating: star })}
                          className={`flex h-10 w-10 items-center justify-center rounded-lg border p-0 text-lg transition-all ${
                            (data.starRating || 0) >= star
                              ? 'border-transparent bg-app-hover text-app-text shadow-sm ring-1 ring-accent'
                              : 'border-app-border bg-app-elevated text-app-text-muted hover:border-app-border-hover hover:bg-app-hover'
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
                    onCheckedChange={() => updateData({ hasRestaurant: !data.hasRestaurant })}
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
  );
}
