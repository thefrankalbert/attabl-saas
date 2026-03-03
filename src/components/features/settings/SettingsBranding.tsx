'use client';

import { Palette } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import type { UseFormReturn } from 'react-hook-form';
import type { SettingsFormValues } from '@/hooks/useSettingsData';

// ─── Types ─────────────────────────────────────────────────

interface SettingsBrandingProps {
  form: UseFormReturn<SettingsFormValues>;
  t: (key: string) => string;
}

// ─── Component ─────────────────────────────────────────────

export default function SettingsBranding({ form, t }: SettingsBrandingProps) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const watchedPrimaryColor = watch('primaryColor');
  const watchedSecondaryColor = watch('secondaryColor');

  return (
    <TabsContent value="branding" className="mt-0">
      <div className="bg-app-card rounded-xl border border-app-border p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Palette className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-app-text">{t('customization')}</h2>
            <p className="text-sm text-app-text-secondary">{t('digitalMenuColors')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">{t('primaryColor')}</Label>
              <div className="flex gap-3">
                <input
                  type="color"
                  value={watchedPrimaryColor}
                  onChange={(e) => setValue('primaryColor', e.target.value)}
                  className="w-10 h-10 min-h-[44px] p-1 rounded-lg cursor-pointer flex-shrink-0 border border-app-border"
                />
                <Input
                  id="primaryColor"
                  {...register('primaryColor')}
                  className="font-mono min-h-[44px]"
                />
              </div>
              {errors.primaryColor && (
                <p className="text-xs text-red-500">{errors.primaryColor.message}</p>
              )}
              <p className="text-xs text-app-text-secondary">{t('usedForButtonsAndTitles')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondaryColor">{t('secondaryColor')}</Label>
              <div className="flex gap-3">
                <input
                  type="color"
                  value={watchedSecondaryColor}
                  onChange={(e) => setValue('secondaryColor', e.target.value)}
                  className="w-10 h-10 min-h-[44px] p-1 rounded-lg cursor-pointer flex-shrink-0 border border-app-border"
                />
                <Input
                  id="secondaryColor"
                  {...register('secondaryColor')}
                  className="font-mono flex-1 min-h-[44px]"
                />
              </div>
              {errors.secondaryColor && (
                <p className="text-xs text-red-500">{errors.secondaryColor.message}</p>
              )}
              <p className="text-xs text-app-text-secondary">{t('usedForTextOnColoredBg')}</p>
            </div>
          </div>

          {/* Preview Card */}
          <div className="p-4 rounded-xl border border-app-border bg-app-elevated">
            <h3 className="text-xs font-semibold text-app-text-secondary mb-3 uppercase tracking-wider">
              {t('buttonPreview')}
            </h3>
            <div className="flex items-center justify-center h-24 bg-app-card rounded-lg border border-app-border">
              <button
                type="button"
                className="px-6 py-2.5 rounded-lg font-medium transition-transform active:scale-95"
                style={{
                  backgroundColor: watchedPrimaryColor,
                  color: watchedSecondaryColor,
                }}
              >
                {t('orderButtonPreview')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </TabsContent>
  );
}
