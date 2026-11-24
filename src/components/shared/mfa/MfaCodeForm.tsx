'use client';

import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { mfaCodeSchema } from '@/lib/validations/mfa.schema';

const formSchema = z.object({ code: mfaCodeSchema });

interface MfaCodeFormProps {
  /** Rend un message d'erreur deja traduit, ou `null` si le code est accepte. */
  onSubmitCode: (code: string) => Promise<string | null>;
  submitLabel: string;
  autoFocus?: boolean;
  /** Bouton secondaire (Annuler), a gauche du bouton principal. */
  secondary?: React.ReactNode;
  inputClassName?: string;
  labelClassName?: string;
  buttonClassName?: string;
}

/**
 * Champ du code a 6 chiffres, partage par l'activation, la desactivation et
 * la page de connexion /auth/mfa. Le code est valide par le meme schema Zod
 * que cote serveur; le serveur revalide de toute facon.
 */
export function MfaCodeForm({
  onSubmitCode,
  submitLabel,
  autoFocus,
  secondary,
  inputClassName,
  labelClassName,
  buttonClassName,
}: MfaCodeFormProps) {
  const t = useTranslations('mfa');
  const inputId = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof formSchema>, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { code: '' },
  });

  const onSubmit = handleSubmit(async ({ code }) => {
    setServerError(null);
    const error = await onSubmitCode(code);
    if (error) {
      setServerError(error);
      reset({ code: '' });
    }
  });

  const message = serverError ?? (errors.code ? t('errors.invalidInput') : null);
  const errorId = `${inputId}-error`;

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={inputId} className={labelClassName}>
          {t('codeLabel')}
        </Label>
        <Input
          id={inputId}
          {...register('code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="123456"
          autoFocus={autoFocus}
          disabled={isSubmitting}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
          className={cn('h-11 font-mono text-base tracking-[0.3em] md:text-sm', inputClassName)}
        />
        {message && (
          <p id={errorId} role="alert" className="text-sm text-status-error">
            {message}
          </p>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {secondary}
        <Button
          type="submit"
          disabled={isSubmitting}
          className={cn('min-h-[44px]', buttonClassName)}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? t('checking') : submitLabel}
        </Button>
      </div>
    </form>
  );
}
