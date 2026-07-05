'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ImportResult } from './menu-import-pdf.types';

interface MenuImportPDFDoneStepProps {
  importResult: ImportResult;
  onCancel: () => void;
}

export function MenuImportPDFDoneStep({ importResult, onCancel }: MenuImportPDFDoneStepProps) {
  const t = useTranslations('menus');

  return (
    <>
      <div className="rounded-xl border border-app-border bg-app-elevated p-4 space-y-2">
        {importResult.categoriesCreated > 0 && (
          <div className="flex items-center gap-2 text-sm text-status-success">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {t('categoriesCreated', { count: importResult.categoriesCreated })}
          </div>
        )}
        {importResult.itemsCreated > 0 && (
          <div className="flex items-center gap-2 text-sm text-status-success">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {t('itemsCreated', { count: importResult.itemsCreated })}
          </div>
        )}
        {importResult.itemsSkipped > 0 && (
          <div className="flex items-center gap-2 text-sm text-status-warning">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {t('itemsSkipped', { count: importResult.itemsSkipped })}
          </div>
        )}
        {importResult.errors.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-status-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {t('errorsFound', { count: importResult.errors.length })}
            </div>
            <ul className="ml-6 space-y-0.5">
              {importResult.errors.map((err, i) => (
                <li key={i} className="text-xs text-status-error">
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Close button */}
      <div className="flex justify-end pt-4 border-t border-app-border">
        <Button variant="default" onClick={onCancel} className="rounded-xl">
          {t('cancel')}
        </Button>
      </div>
    </>
  );
}
