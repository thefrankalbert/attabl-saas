'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Rocket } from 'lucide-react';

const DISMISS_KEY = 'attabl_onboarding_dismissed';

export function OnboardingResumeDialog() {
  const t = useTranslations('admin');
  const router = useRouter();
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return sessionStorage.getItem(DISMISS_KEY) !== 'true';
  });

  const handleResume = () => {
    router.push('/onboarding');
  };

  const handleSkip = () => {
    sessionStorage.setItem(DISMISS_KEY, 'true');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleSkip()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Rocket className="h-6 w-6 text-text-primary" />
          </div>
          <DialogTitle className="text-center">{t('onboardingResumeTitle')}</DialogTitle>
          <DialogDescription className="text-center">{t('onboardingResumeDesc')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleResume} className="w-full">
            {t('onboardingResumeCta')}
          </Button>
          <Button variant="ghost" onClick={handleSkip} className="w-full text-text-secondary">
            {t('onboardingResumeSkip')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
