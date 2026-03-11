'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import type { UseFormReturn } from 'react-hook-form';
import type { SettingsFormValues } from '@/hooks/useSettingsData';

// ─── Types ─────────────────────────────────────────────────

interface SettingsContactProps {
  form: UseFormReturn<SettingsFormValues>;
  t: (key: string) => string;
}

// ─── Component ─────────────────────────────────────────────

export default function SettingsContact({ form, t }: SettingsContactProps) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <TabsContent value="contact" className="mt-0">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="space-y-2">
          <Label htmlFor="address">{t('fullAddress')}</Label>
          <Input
            id="address"
            {...register('address')}
            placeholder={t('addressPlaceholder')}
            className="min-h-[44px]"
          />
          {errors.address && <p className="text-xs text-status-error">{errors.address.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">{t('city') ?? 'Ville'}</Label>
          <Input
            id="city"
            {...register('city')}
            placeholder={t('cityPlaceholder') ?? 'ex: Douala'}
            className="min-h-[44px]"
          />
          {errors.city && <p className="text-xs text-status-error">{errors.city.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">{t('country') ?? 'Pays'}</Label>
          <Input
            id="country"
            {...register('country')}
            placeholder={t('countryPlaceholder') ?? 'ex: Cameroun'}
            className="min-h-[44px]"
          />
          {errors.country && <p className="text-xs text-status-error">{errors.country.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">{t('phone')}</Label>
          <Input
            id="phone"
            {...register('phone')}
            placeholder={t('phonePlaceholder')}
            className="min-h-[44px]"
          />
          {errors.phone && <p className="text-xs text-status-error">{errors.phone.message}</p>}
        </div>
      </div>
    </TabsContent>
  );
}
