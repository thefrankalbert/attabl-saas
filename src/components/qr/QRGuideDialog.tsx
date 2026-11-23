'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const STEP_COUNT = 4;
/** -1 = the intro screen where the guide is accepted or skipped. */
const INTRO = -1;

function storageKey(tenantSlug: string): string {
  return `attabl:qr-guide-seen:${tenantSlug}`;
}

/**
 * Tutorial for the QR codes screen. It opens by itself on the first visit
 * (per restaurant and per browser), offers to follow or skip it, then shows
 * one step per screen. The "Guide" button reopens it at any time.
 */
export function QRGuideDialog({ tenantSlug }: { tenantSlug: string }) {
  const t = useTranslations('qrCodes');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(INTRO);

  // Read after mount: localStorage does not exist on the server (no hydration
  // mismatch), and a private window or blocked storage just skips the auto-open.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey(tenantSlug)) !== '1') {
        setStep(INTRO);
        setOpen(true);
      }
    } catch {
      // Storage unavailable: the Guide button still works.
    }
  }, [tenantSlug]);

  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(storageKey(tenantSlug), '1');
    } catch {
      // Storage unavailable: the guide may show again next time, nothing breaks.
    }
  };

  const reopen = () => {
    setStep(0);
    setOpen(true);
  };

  const isIntro = step === INTRO;
  const isLast = step === STEP_COUNT - 1;
  const n = step + 1;

  return (
    <>
      <Button variant="outline" size="sm" className="min-h-[44px] shrink-0" onClick={reopen}>
        {t('guideButton')}
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="max-w-sm sm:max-w-md">
          {isIntro ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('guideTitle')}</DialogTitle>
                <DialogDescription>{t('guideIntro')}</DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="ghost" className="min-h-[44px]" onClick={close}>
                  {t('guideSkip')}
                </Button>
                <Button className="min-h-[44px]" onClick={() => setStep(0)}>
                  {t('guideStart')}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="flex gap-1.5 pr-8" aria-hidden="true">
                {Array.from({ length: STEP_COUNT }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1 flex-1 rounded-full',
                      i <= step ? 'bg-app-text' : 'bg-app-border',
                    )}
                  />
                ))}
              </div>
              <DialogHeader>
                <p className="text-xs font-medium text-app-text-muted">
                  {t('guideStepOf', { current: n, total: STEP_COUNT })}
                </p>
                <DialogTitle>{t(`guideStep${n}Title`)}</DialogTitle>
                <DialogDescription>{t(`guideStep${n}Body`)}</DialogDescription>
              </DialogHeader>

              {isLast && (
                <div className="rounded-lg border border-app-border p-3">
                  <p className="text-sm font-medium text-app-text">{t('guideTipTitle')}</p>
                  <p className="text-sm text-app-text-secondary">{t('guideTipBody')}</p>
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-2">
                {step > 0 ? (
                  <Button
                    variant="ghost"
                    className="min-h-[44px]"
                    onClick={() => setStep(step - 1)}
                  >
                    {t('guidePrevious')}
                  </Button>
                ) : (
                  <Button variant="ghost" className="min-h-[44px]" onClick={close}>
                    {t('guideSkip')}
                  </Button>
                )}
                <Button
                  className="min-h-[44px]"
                  onClick={() => (isLast ? close() : setStep(step + 1))}
                >
                  {isLast ? t('guideDone') : t('guideNext')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
