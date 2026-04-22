'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { QrCode, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
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

  // Derive basePath from the current pathname (e.g. /sites/slug/admin/settings -> /sites/slug/admin)
  const pathname = usePathname();
  const basePath = pathname.replace(/\/settings.*$/, '');

  return (
    <TabsContent value="branding" className="mt-0">
      <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 sm:gap-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="primaryColor">{t('primaryColor')}</Label>
            <div className="flex gap-3">
              {/* eslint-disable-next-line react/forbid-elements -- <input type="color"> is the CLAUDE.md-documented exception (no shadcn equivalent) */}
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
              <p className="text-xs text-status-error">{errors.primaryColor.message}</p>
            )}
            <p className="text-xs text-app-text-secondary">{t('usedForButtonsAndTitles')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="secondaryColor">{t('secondaryColor')}</Label>
            <div className="flex gap-3">
              {/* eslint-disable-next-line react/forbid-elements -- <input type="color"> is the CLAUDE.md-documented exception (no shadcn equivalent) */}
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
              <p className="text-xs text-status-error">{errors.secondaryColor.message}</p>
            )}
            <p className="text-xs text-app-text-secondary">{t('usedForTextOnColoredBg')}</p>
          </div>
        </div>

        {/* Preview */}
        <div>
          <p className="text-xs font-bold text-app-text-secondary mb-3 uppercase tracking-wider">
            {t('buttonPreview')}
          </p>
          <div className="flex items-center justify-center h-24 rounded-lg border border-app-border">
            <Button
              type="button"
              className="px-6 py-2.5 transition-transform active:scale-95"
              style={{
                backgroundColor: watchedPrimaryColor,
                color: watchedSecondaryColor,
              }}
            >
              {t('orderButtonPreview')}
            </Button>
          </div>
        </div>
      </div>

      {/* QR Codes link */}
      <div className="mt-6 pt-6 border-t border-app-border">
        <Link
          href={`${basePath}/qr-codes`}
          className="flex items-center gap-3 p-4 rounded-[10px] border border-app-border bg-app-elevated/50 hover:bg-app-hover transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-accent-muted flex items-center justify-center shrink-0">
            <QrCode className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-app-text">{t('qrCodesTitle')}</p>
            <p className="text-xs text-app-text-secondary">{t('qrCodesDescription')}</p>
          </div>
          <ExternalLink className="w-4 h-4 text-app-text-muted group-hover:text-app-text transition-colors shrink-0" />
        </Link>
      </div>
    </TabsContent>
  );
}
