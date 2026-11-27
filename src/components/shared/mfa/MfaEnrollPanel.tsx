'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { actionStartMfaEnrollment, actionVerifyMfaCode } from '@/app/actions/mfa';
import type { MfaEnrollment } from '@/services/mfa.service';
import { MfaCodeForm } from './MfaCodeForm';

interface MfaEnrollPanelProps {
  startLabel: string;
  onEnrolled: () => void;
  /** Affiche "Annuler" pendant l'activation (volet des reglages). */
  onCancel?: () => void;
  buttonClassName?: string;
  secondaryButtonClassName?: string;
  inputClassName?: string;
  labelClassName?: string;
  textClassName?: string;
}

/**
 * Activation de la double authentification: QR code (et cle a saisir a la
 * main), puis verification d'un premier code. Tant que ce code n'est pas
 * verifie, le facteur reste "non verifie" et ne protege rien: rien n'est
 * exige a la connexion suivante.
 *
 * La cle n'est gardee qu'en memoire de ce composant, jamais stockee ni
 * journalisee.
 */
export function MfaEnrollPanel({
  startLabel,
  onEnrolled,
  onCancel,
  buttonClassName,
  secondaryButtonClassName,
  inputClassName,
  labelClassName,
  textClassName,
}: MfaEnrollPanelProps) {
  const t = useTranslations('mfa');
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const start = async () => {
    setStarting(true);
    setStartError(null);
    const result = await actionStartMfaEnrollment();
    setStarting(false);
    if (!result.success) {
      setStartError(t(`errors.${result.error}`));
      return;
    }
    setEnrollment({ factorId: result.factorId, uri: result.uri, secret: result.secret });
  };

  const verify = async (code: string): Promise<string | null> => {
    if (!enrollment) return t('errors.failed');
    const result = await actionVerifyMfaCode({ code, factorId: enrollment.factorId });
    if (!result.success) return t(`errors.${result.error}`);
    setEnrollment(null);
    toast.success(t('enabledToast'));
    onEnrolled();
    return null;
  };

  const copySecret = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      toast.success(t('keyCopied'));
    } catch {
      // Presse-papiers refuse (navigateur ou contexte non securise): la cle
      // reste lisible a l'ecran, rien d'autre a faire.
    }
  };

  const cancel = () => {
    setEnrollment(null);
    onCancel?.();
  };

  if (!enrollment) {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          onClick={start}
          disabled={starting}
          className={cn('min-h-[44px] w-full sm:w-auto', buttonClassName)}
        >
          {starting && <Loader2 className="h-4 w-4 animate-spin" />}
          {starting ? t('loading') : startLabel}
        </Button>
        {startError && (
          <p role="alert" className="text-sm text-status-error">
            {startError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className={cn('text-sm', textClassName)}>{t('enrollStep1')}</p>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="grid shrink-0 place-items-center rounded-[10px] border bg-white p-2">
          <QRCodeSVG
            value={enrollment.uri}
            size={152}
            bgColor="#ffffff"
            fgColor="#000000"
            role="img"
            aria-label={t('qrAlt')}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <p className={cn('text-xs', textClassName)}>{t('enrollManual')}</p>
          <code className="block break-all rounded-md border px-2 py-1.5 font-mono text-sm">
            {enrollment.secret}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copySecret}
            className={cn('min-h-[44px] gap-1.5', secondaryButtonClassName)}
          >
            <Copy className="size-3.5" />
            {t('copyKey')}
          </Button>
        </div>
      </div>
      <p className={cn('text-sm', textClassName)}>{t('enrollStep2')}</p>
      <MfaCodeForm
        onSubmitCode={verify}
        submitLabel={t('confirmEnable')}
        autoFocus
        inputClassName={inputClassName}
        labelClassName={labelClassName}
        buttonClassName={buttonClassName}
        secondary={
          onCancel ? (
            <Button
              type="button"
              variant="outline"
              onClick={cancel}
              className={cn('min-h-[44px]', secondaryButtonClassName)}
            >
              {t('cancel')}
            </Button>
          ) : null
        }
      />
    </div>
  );
}
