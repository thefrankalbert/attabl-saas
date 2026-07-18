'use client';

import { useTranslations } from 'next-intl';
import { HelpCircle, MousePointerClick, Palette, Layers, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/**
 * In-app help for the QR codes screen. A "Guide" button opens a dialog that walks
 * a restaurateur through the four tabs (choose, customize, assign, download) plus
 * a print-and-place tip. Read-only content, no data or props.
 */
export function QRGuideDialog() {
  const t = useTranslations('qrCodes');

  const steps = [
    { icon: MousePointerClick, title: t('guideStep1Title'), body: t('guideStep1Body') },
    { icon: Palette, title: t('guideStep2Title'), body: t('guideStep2Body') },
    { icon: Layers, title: t('guideStep3Title'), body: t('guideStep3Body') },
    { icon: Printer, title: t('guideStep4Title'), body: t('guideStep4Body') },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-[44px] shrink-0">
          <HelpCircle className="mr-2 h-4 w-4" />
          {t('guideButton')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('guideTitle')}</DialogTitle>
          <DialogDescription>{t('guideIntro')}</DialogDescription>
        </DialogHeader>

        <ol className="space-y-4">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-info-bg text-status-info">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-app-text">
                  {i + 1}. {title}
                </p>
                <p className="text-sm text-app-text-secondary">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="rounded-lg border border-app-border p-3">
          <p className="text-sm font-medium text-app-text">{t('guideTipTitle')}</p>
          <p className="text-sm text-app-text-secondary">{t('guideTipBody')}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
