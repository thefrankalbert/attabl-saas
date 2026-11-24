'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { actionDisableMfa, actionGetMfaStatus } from '@/app/actions/mfa';
import { MfaCodeForm } from './MfaCodeForm';
import { MfaEnrollPanel } from './MfaEnrollPanel';

const STATUS_KEY = ['mfa-status'] as const;

/**
 * Volet "Double authentification" des reglages du compte: etat, activation
 * (QR code + premier code), desactivation (un code valide est exige).
 * Optionnelle pour les restaurateurs; obligatoire seulement pour le super
 * administrateur, qui y est conduit par la console elle-meme.
 */
export function MfaSettingsSection() {
  const t = useTranslations('mfa');
  const queryClient = useQueryClient();
  const [disableOpen, setDisableOpen] = useState(false);

  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: async () => {
      const result = await actionGetMfaStatus();
      if (!result.success) throw new Error(result.error);
      return result.enabled;
    },
    staleTime: 60_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: STATUS_KEY });

  const disable = async (code: string): Promise<string | null> => {
    const result = await actionDisableMfa({ code });
    if (!result.success) return t(`errors.${result.error}`);
    setDisableOpen(false);
    toast.success(t('disabledToast'));
    await refresh();
    return null;
  };

  return (
    <div className="mt-2 space-y-3 border-t border-[var(--border)] pt-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]">
          <ShieldCheck className="size-4" />
          {t('settingsTitle')}
        </h3>
        <p className="text-xs text-[var(--muted-foreground)]">{t('settingsSub')}</p>
      </div>

      {status.isPending ? (
        <p className="text-xs text-[var(--muted-foreground)]">{t('loading')}</p>
      ) : status.isError ? (
        <p role="alert" className="text-sm text-status-error">
          {t('errors.failed')}
        </p>
      ) : status.data ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-status-success">{t('statusOn')}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDisableOpen(true)}
            className="min-h-[44px] w-full sm:w-auto"
          >
            {t('disable')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted-foreground)]">{t('statusOff')}</p>
          <MfaEnrollPanel
            startLabel={t('enable')}
            onEnrolled={() => {
              // Le serveur vient de verifier le code: le facteur est actif. On
              // l'affiche tout de suite, la relecture confirme ensuite (sur un
              // reseau lent, l'ancien etat "pas encore activee" restait visible).
              queryClient.setQueryData(STATUS_KEY, true);
              void refresh();
            }}
            onCancel={() => undefined}
            textClassName="text-[var(--muted-foreground)]"
          />
        </div>
      )}

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('disableTitle')}</DialogTitle>
            <DialogDescription>{t('disableSub')}</DialogDescription>
          </DialogHeader>
          <MfaCodeForm
            onSubmitCode={disable}
            submitLabel={t('confirmDisable')}
            autoFocus
            secondary={
              <Button
                type="button"
                variant="outline"
                onClick={() => setDisableOpen(false)}
                className="min-h-[44px]"
              >
                {t('cancel')}
              </Button>
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
