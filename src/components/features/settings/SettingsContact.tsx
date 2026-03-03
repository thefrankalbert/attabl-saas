'use client';

import { MapPin } from 'lucide-react';
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
      <div className="bg-app-card rounded-xl border border-app-border p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-green-500/10 rounded-lg">
            <MapPin className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-app-text">{t('contactInfo')}</h2>
            <p className="text-sm text-app-text-secondary">{t('addressAndContact')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-2">
            <Label htmlFor="address">{t('fullAddress')}</Label>
            <Input
              id="address"
              {...register('address')}
              placeholder={t('addressPlaceholder')}
              className="min-h-[44px]"
            />
            {errors.address && <p className="text-xs text-red-500">{errors.address.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{t('phone')}</Label>
            <Input
              id="phone"
              {...register('phone')}
              placeholder={t('phonePlaceholder')}
              className="min-h-[44px]"
            />
            {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
          </div>
        </div>
      </div>
    </TabsContent>
  );
}
