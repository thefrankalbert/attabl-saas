'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  formatPrice,
  type PdfExtractedItem,
  type PdfNotImportedItem,
} from './menu-import-pdf.types';

interface MenuImportPDFPreviewStepProps {
  extractedItems: PdfExtractedItem[];
  /** B72: plats au prix refuse, qui ne seront PAS importes. */
  notImported: PdfNotImportedItem[];
  removeItem: (index: number) => void;
  handleImport: () => void;
  handleBackToUpload: () => void;
}

export function MenuImportPDFPreviewStep({
  extractedItems,
  notImported,
  removeItem,
  handleImport,
  handleBackToUpload,
}: MenuImportPDFPreviewStepProps) {
  const t = useTranslations('menus');
  const tc = useTranslations('common');

  return (
    <>
      <div className="space-y-2">
        <p className="text-sm font-medium text-app-text">{t('pdfPreview')}</p>
        <p className="text-xs text-app-text-secondary">{t('pdfPreviewDesc')}</p>
        <p className="text-xs text-accent font-medium">
          {t('pdfExtracted', { count: extractedItems.length })}
        </p>
      </div>

      {/* Scrollable item list */}
      <div className="max-h-80 overflow-y-auto rounded-xl border border-app-border divide-y divide-app-border">
        {extractedItems.map((item, index) => (
          <div
            key={`${item.category}-${item.name}-${index}`}
            className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-app-hover transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-accent bg-accent/5 px-1.5 py-0.5 rounded">
                  {item.category}
                </span>
              </div>
              <p className="text-sm font-medium text-app-text mt-1 break-words">{item.name}</p>
              {item.description && (
                <p className="text-xs text-app-text-secondary mt-0.5">{item.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm font-semibold text-app-text tabular-nums">
                {formatPrice(item.price)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeItem(index)}
                className="p-1 h-auto w-auto text-app-text-muted hover:text-status-error hover:bg-status-error/10"
                title={tc('delete')}
                aria-label={tc('delete')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {extractedItems.length === 0 && (
        <p className="text-sm text-app-text-secondary text-center py-4">{t('pdfNoData')}</p>
      )}

      {/* B72: plats au prix refuse, jamais importes (ils seraient en vente a 0). */}
      {notImported.length > 0 && (
        <div className="rounded-xl border border-app-border bg-status-warning-bg px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-status-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t('pdfNotImportedTitle', { count: notImported.length })}
          </p>
          <p className="mt-1 text-xs text-app-text-secondary">{t('pdfNotImportedHelp')}</p>
          <ul className="mt-2 space-y-1">
            {notImported.map((item, index) => (
              <li key={`${item.name}-${index}`} className="text-xs text-app-text break-words">
                <span className="font-medium">{item.name}</span>
                {' : '}
                {t(`pdfNotImportedReason.${item.reason}`, { price: item.price || '-' })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
        <Button type="button" variant="ghost" onClick={handleBackToUpload}>
          {t('cancel')}
        </Button>
        <Button
          variant="default"
          disabled={extractedItems.length === 0}
          onClick={handleImport}
          className="gap-2 rounded-xl"
        >
          <CheckCircle2 className="w-4 h-4" />
          {t('pdfConfirmImport')}
        </Button>
      </div>
    </>
  );
}
