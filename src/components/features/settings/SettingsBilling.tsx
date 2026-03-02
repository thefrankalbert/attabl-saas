'use client';

import { Receipt } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import type { UseFormReturn } from 'react-hook-form';
import type { SettingsFormValues } from '@/hooks/useSettingsData';

// ─── Types ─────────────────────────────────────────────────

interface SettingsBillingProps {
  form: UseFormReturn<SettingsFormValues>;
  t: (key: string) => string;
}

// ─── Component ─────────────────────────────────────────────

export default function SettingsBilling({ form, t }: SettingsBillingProps) {
  const {
    register,
    watch,
    formState: { errors },
  } = form;

  const watchEnableTax = watch('enableTax');
  const watchEnableServiceCharge = watch('enableServiceCharge');

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
              className="flex h-10 min-h-[44px] w-full sm:max-w-xs rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="XAF">{t('currencyXAF')}</option>
              <option value="EUR">{t('currencyEUR')}</option>
              <option value="USD">{t('currencyUSD')}</option>
            </select>
            <p className="text-xs text-app-text-secondary">{t('currencyUsedForPriceDisplay')}</p>
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
