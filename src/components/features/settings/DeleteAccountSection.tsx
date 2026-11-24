'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { actionDeleteOwnerAccount, actionDeleteStaffAccount } from '@/app/actions/account-deletion';
import { logger } from '@/lib/logger';

interface DeleteAccountSectionProps {
  /**
   * `owner`: ferme le restaurant courant (confirmation = nom du restaurant).
   * `staff`: supprime le compte du membre (confirmation = le mot SUPPRIMER,
   * traduit; jamais impossible, meme pour un compte sans adresse e-mail).
   */
  variant: 'owner' | 'staff';
  /** Nom du restaurant a recopier (proprietaire seulement). */
  restaurantName?: string;
}

function normaliser(valeur: string): string {
  return valeur.trim().replace(/\s+/g, ' ').toLowerCase();
}

export default function DeleteAccountSection({
  variant,
  restaurantName = '',
}: DeleteAccountSectionProps) {
  const t = useTranslations('accountDeletion');
  const expected = variant === 'owner' ? restaurantName : t('staff_confirmWord');
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmed = expected !== '' && normaliser(confirmText) === normaliser(expected);

  const close = () => {
    if (loading) return;
    setOpen(false);
    setConfirmText('');
    setError(null);
  };

  const handleDelete = async () => {
    if (!isConfirmed || loading) return;
    setLoading(true);
    setError(null);
    const action = variant === 'owner' ? actionDeleteOwnerAccount : actionDeleteStaffAccount;
    try {
      // Succes: l'action redirige elle-meme vers /login?deleted=true (la page de
      // connexion nettoie l'appareil). Seul un echec revient ici.
      const result = await action({ confirmation: confirmText });
      if (result && !result.success) {
        setError(t(`error_${result.error}`));
        setLoading(false);
      }
    } catch (err) {
      logger.error('Account deletion request failed', err);
      setError(t('error_failed'));
      setLoading(false);
    }
  };

  return (
    <>
      {/* Le volet "Mon compte" a une hauteur fixe: le detail passe dans la
          fenetre de confirmation, lue avant tout geste. */}
      <div className="mt-2 border-t border-status-error/20 pt-4">
        <h3 className="text-sm font-semibold text-status-error mb-1">{t(`${variant}_title`)}</h3>
        <p className="text-xs text-app-text-muted mb-3">{t(`${variant}_line1`)}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className="min-h-[44px] w-full sm:w-auto border-status-error/40 text-status-error hover:bg-app-status-error-bg/30 hover:text-status-error"
        >
          {t('openButton')}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-status-error">{t(`${variant}_dialogTitle`)}</DialogTitle>
            <DialogDescription className="text-app-text-secondary">
              {t(`${variant}_dialogWarning`)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2 text-sm text-app-text-secondary">
              <p>{t(`${variant}_line2`)}</p>
              <p>{t(`${variant}_line3`)}</p>
            </div>
            {error && (
              <Alert
                variant="destructive"
                className="bg-app-status-error-bg text-status-error border-status-error/20"
              >
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="confirm-account-deletion" className="text-xs text-app-text-secondary">
                {t(`${variant}_confirmLabel`)}{' '}
                <span className="font-mono font-bold text-status-error break-all">{expected}</span>
              </Label>
              <Input
                id="confirm-account-deletion"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={expected}
                className="h-11 text-base md:text-sm"
                autoComplete="off"
                disabled={loading}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={loading}
              className="min-h-[44px]"
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={!isConfirmed || loading}
              className="min-h-[44px] bg-status-error-solid hover:bg-status-error-solid/90 text-white"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? t('inProgress') : t(`${variant}_confirmButton`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
