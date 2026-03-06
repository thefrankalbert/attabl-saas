'use client';

import { Receipt } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import type { UseFormReturn } from 'react-hook-form';
import type { SettingsFormValues } from '@/hooks/useSettingsData';
import type { CurrencyCode } from '@/types/admin.types';

// ─── Types ─────────────────────────────────────────────────

interface SettingsBillingProps {
  form: UseFormReturn<SettingsFormValues>;
  t: (key: string) => string;
}

const ALL_CURRENCIES: { code: CurrencyCode; labelKey: string }[] = [
  { code: 'XAF', labelKey: 'currencyXAF' },
  { code: 'EUR', labelKey: 'currencyEUR' },
  { code: 'USD', labelKey: 'currencyUSD' },
];

// ─── Component ─────────────────────────────────────────────

export default function SettingsBilling({ form, t }: SettingsBillingProps) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const watchEnableTax = watch('enableTax');
  const watchEnableServiceCharge = watch('enableServiceCharge');
  const watchCurrency = watch('currency') || 'XAF';
  const watchSupportedCurrencies = watch('supportedCurrencies') || [watchCurrency];

  const handleSupportedCurrencyToggle = (code: CurrencyCode) => {
    if (code === watchCurrency) return; // Base currency cannot be removed
    const current = watchSupportedCurrencies as CurrencyCode[];
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    setValue('supportedCurrencies', next, { shouldDirty: true });
  };

  return (
    <TabsContent value="billing" className="mt-0">
      <div className="bg-app-card rounded-xl border border-app-border p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Receipt className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-app-text">{t('billing')}</h2>
            <p className="text-sm text-app-text-secondary">{t('currencyTaxesAndFees')}</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Currency Selector */}
          <div className="space-y-2">
            <Label htmlFor="currency">{t('currency')}</Label>
            <select
              id="currency"
              {...register('currency')}
              className="flex h-10 min-h-[44px] w-full sm:max-w-xs rounded-lg border border-app-border bg-app-elevated text-app-text px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="XAF">{t('currencyXAF')}</option>
              <option value="EUR">{t('currencyEUR')}</option>
              <option value="USD">{t('currencyUSD')}</option>
            </select>
            <p className="text-xs text-app-text-secondary">{t('currencyUsedForPriceDisplay')}</p>
          </div>

          {/* Supported Currencies */}
          <div className="space-y-2">
            <Label>{t('supportedCurrencies')}</Label>
            <p className="text-xs text-app-text-secondary">{t('supportedCurrenciesDesc')}</p>
            <div className="flex flex-wrap gap-3 pt-1">
              {ALL_CURRENCIES.map(({ code, labelKey }) => {
                const isBase = code === watchCurrency;
                const isChecked = (watchSupportedCurrencies as string[]).includes(code);
                return (
                  <label
                    key={code}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700'
                        : 'border-app-border bg-app-elevated text-app-text-secondary'
                    } ${isBase ? 'opacity-80 cursor-default' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isBase}
                      onChange={() => handleSupportedCurrencyToggle(code)}
                      className="sr-only"
                    />
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border ${
                        isChecked ? 'bg-emerald-500 border-emerald-500' : 'border-app-border'
                      }`}
                    >
                      {isChecked && (
                        <svg
                          className="h-3 w-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    {t(labelKey)}
                    {isBase && (
                      <span className="text-xs text-app-text-muted">
                        ({t('baseCurrencyAlwaysIncluded')})
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Tax Toggle + Rate */}
          <div className="space-y-3 p-4 rounded-lg border border-app-border bg-app-elevated">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="enableTax" className="text-sm font-medium text-app-text">
                  {t('enableVat')}
                </Label>
                <p className="text-xs text-app-text-secondary mt-0.5">{t('applyTaxOnOrders')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  id="enableTax"
                  {...register('enableTax')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-app-elevated peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-app-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500/100"></div>
              </label>
            </div>

            {watchEnableTax && (
              <div className="flex flex-wrap items-center gap-3 pt-2 animate-in fade-in slide-in-from-top-2">
                <Label
                  htmlFor="taxRate"
                  className="text-sm text-app-text-secondary whitespace-nowrap"
                >
                  {t('vatRate')}
                </Label>
                <div className="relative w-32">
                  <Input
                    id="taxRate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    {...register('taxRate', { valueAsNumber: true })}
                    className="pr-8 min-h-[44px]"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-app-text-muted">
                    %
                  </span>
                </div>
                {errors.taxRate && <p className="text-xs text-red-500">{errors.taxRate.message}</p>}
              </div>
            )}
          </div>

          {/* Service Charge Toggle + Rate */}
          <div className="space-y-3 p-4 rounded-lg border border-app-border bg-app-elevated">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="enableServiceCharge" className="text-sm font-medium text-app-text">
                  {t('enableServiceFee')}
                </Label>
                <p className="text-xs text-app-text-secondary mt-0.5">
                  {t('addServiceFeeToOrders')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  id="enableServiceCharge"
                  {...register('enableServiceCharge')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-app-elevated peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-app-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500/100"></div>
              </label>
            </div>

            {watchEnableServiceCharge && (
              <div className="flex flex-wrap items-center gap-3 pt-2 animate-in fade-in slide-in-from-top-2">
                <Label
                  htmlFor="serviceChargeRate"
                  className="text-sm text-app-text-secondary whitespace-nowrap"
                >
                  {t('serviceFeeRate')}
                </Label>
                <div className="relative w-32">
                  <Input
                    id="serviceChargeRate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    {...register('serviceChargeRate', { valueAsNumber: true })}
                    className="pr-8 min-h-[44px]"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-app-text-muted">
                    %
                  </span>
                </div>
                {errors.serviceChargeRate && (
                  <p className="text-xs text-red-500">{errors.serviceChargeRate.message}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </TabsContent>
  );
}
