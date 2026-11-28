'use client';

import { useState } from 'react';
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
import { Loader2 } from 'lucide-react';
import RoleGuard from '@/components/admin/RoleGuard';
import { useTranslations } from 'next-intl';
import { logger } from '@/lib/logger';
import { SecurityRow } from './SecuritySection';

// --- Types ----------------------------------------------

type ResetType = 'orders' | 'statistics' | 'all';

const CONFIRMATION_PHRASE = 'CONFIRMER SUPPRESSION';

/** Least to most destructive, the order the owner reads them in. */
const RESET_TYPES: ResetType[] = ['statistics', 'orders', 'all'];

// --- Component ------------------------------------------

export default function SettingsDataReset({ tenantSlug }: { tenantSlug: string }) {
  const t = useTranslations('settings');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ResetType | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const openDialog = (type: ResetType) => {
    setSelectedType(type);
    setConfirmText('');
    setResult(null);
    setDialogOpen(true);
  };

  const handleReset = async () => {
    if (!selectedType || confirmText.trim() !== CONFIRMATION_PHRASE) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': tenantSlug,
        },
        body: JSON.stringify({
          resetType: selectedType,
          confirmationText: confirmText.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult({ success: false, message: data.error || t('resetError') });
        return;
      }

      setResult({ success: true, message: data.message });
      setConfirmText('');
    } catch (err) {
      logger.error('Reset request failed', err);
      setResult({ success: false, message: t('resetError') });
    } finally {
      setLoading(false);
    }
  };

  const closeDialog = () => {
    if (!loading) {
      setDialogOpen(false);
      setSelectedType(null);
      setConfirmText('');
      setResult(null);
    }
  };

  const isConfirmed = confirmText.trim() === CONFIRMATION_PHRASE;

  return (
    <RoleGuard ownerOnly fallback={null}>
      {RESET_TYPES.map((type) => (
        <SecurityRow
          key={type}
          title={t(`reset_${type}_title`)}
          description={t(`reset_${type}_description`)}
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => openDialog(type)}
            className="min-h-[44px] text-status-error hover:text-status-error"
          >
            {t('resetAction')}
          </Button>
        </SecurityRow>
      ))}

      {/* Confirmation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-status-error">
              {selectedType && t(`reset_${selectedType}_title`)}
            </DialogTitle>
            <DialogDescription className="text-app-text-secondary">
              {selectedType && t(`reset_${selectedType}_warning`)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {result && (
              <Alert
                variant={result.success ? 'default' : 'destructive'}
                className={
                  result.success
                    ? 'bg-app-status-success-bg text-status-success border-status-success/20'
                    : 'bg-app-status-error-bg text-status-error border-status-error/20'
                }
              >
                <AlertDescription className="text-sm">{result.message}</AlertDescription>
              </Alert>
            )}

            {!result?.success && (
              <>
                <div className="p-3 rounded-xl bg-app-status-error-bg/50 border border-status-error/10">
                  <p className="text-xs text-app-text-secondary">
                    {t('resetConfirmInstruction')}{' '}
                    <span className="font-mono font-bold text-status-error">
                      {CONFIRMATION_PHRASE}
                    </span>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="confirm-reset"
                    className="text-xs uppercase tracking-widest text-app-text-secondary font-medium"
                  >
                    {t('resetConfirmLabel')}
                  </Label>
                  <Input
                    id="confirm-reset"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={CONFIRMATION_PHRASE}
                    className="h-11 bg-app-elevated border-app-border text-app-text font-mono text-base md:text-sm rounded-xl focus:ring-2 focus:ring-status-error/20 focus:border-status-error/40"
                    autoComplete="off"
                    disabled={loading}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={closeDialog}
              disabled={loading}
              className="min-h-[44px]"
            >
              {result?.success ? t('resetClose') : t('resetCancel')}
            </Button>
            {!result?.success && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleReset}
                disabled={!isConfirmed || loading}
                className="min-h-[44px] bg-status-error-solid hover:bg-status-error-solid/90 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('resetInProgress')}
                  </>
                ) : (
                  t('resetConfirmButton')
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RoleGuard>
  );
}
