'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice, type PdfExtractedItem } from './menu-import-pdf.types';

interface MenuImportPDFPreviewStepProps {
  extractedItems: PdfExtractedItem[];
  removeItem: (index: number) => void;
  handleImport: () => void;
  handleBackToUpload: () => void;
}

export function MenuImportPDFPreviewStep({
  extractedItems,
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
