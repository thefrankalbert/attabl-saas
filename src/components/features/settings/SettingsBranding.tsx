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
      <div className="bg-white rounded-xl border border-neutral-100 p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-50 rounded-lg">
            <Palette className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{t('customization')}</h2>
            <p className="text-sm text-neutral-500">{t('digitalMenuColors')}</p>
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
                  className="w-10 h-10 min-h-[44px] p-1 rounded-lg cursor-pointer flex-shrink-0 border border-neutral-200"
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
              <p className="text-xs text-neutral-500">{t('usedForButtonsAndTitles')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondaryColor">{t('secondaryColor')}</Label>
              <div className="flex gap-3">
                <input
                  type="color"
                  value={watchedSecondaryColor}
                  onChange={(e) => setValue('secondaryColor', e.target.value)}
                  className="w-10 h-10 min-h-[44px] p-1 rounded-lg cursor-pointer flex-shrink-0 border border-neutral-200"
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
              <p className="text-xs text-neutral-500">{t('usedForTextOnColoredBg')}</p>
            </div>
          </div>

          {/* Preview Card */}
          <div className="p-4 rounded-xl border border-neutral-100 bg-neutral-50">
            <h3 className="text-xs font-semibold text-neutral-500 mb-3 uppercase tracking-wider">
              {t('buttonPreview')}
            </h3>
            <div className="flex items-center justify-center h-24 bg-white rounded-lg border border-neutral-200">
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
