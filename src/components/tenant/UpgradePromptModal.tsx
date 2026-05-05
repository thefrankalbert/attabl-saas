'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { GatedFeature } from '@/contexts/SubscriptionContext';

interface UpgradePromptModalProps {
  feature: GatedFeature;
  checkoutUrl: string;
  onClose: () => void;
}

export function UpgradePromptModal({ feature, checkoutUrl, onClose }: UpgradePromptModalProps) {
  const t = useTranslations('admin.upgradeWall');

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted shrink-0">
              <Lock className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">
                {t('planRequired')}
              </p>
              <DialogTitle className="text-lg font-bold leading-tight">
                {t(`${feature}.title`)}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>
        <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
          {t(`${feature}.desc`)}
        </DialogDescription>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild size="lg" className="w-full">
            <Link href={checkoutUrl} onClick={onClose}>
              {t('upgradeCta')}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="w-full" onClick={onClose}>
            Plus tard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
