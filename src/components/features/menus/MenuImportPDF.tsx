'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import type { MenuImportPDFProps } from './menu-import-pdf.types';
import { useMenuImportPDF } from './useMenuImportPDF';
import { MenuImportPDFUploadStep } from './MenuImportPDFUploadStep';
import { MenuImportPDFPreviewStep } from './MenuImportPDFPreviewStep';
import { MenuImportPDFDoneStep } from './MenuImportPDFDoneStep';

// --- Component ------------------------------------------

export default function MenuImportPDF({ menus, onImportComplete, onCancel }: MenuImportPDFProps) {
  const t = useTranslations('menus');

  const {
    step,
    menuId,
    setMenuId,
    file,
    isDragOver,
    extractedItems,
    importResult,
    fileInputRef,
    handleFileSelect,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleExtract,
    removeItem,
    handleImport,
    handleBackToUpload,
  } = useMenuImportPDF({ menus, onImportComplete });

  // --- Render ---------------------------------------------

  return (
    <div className="space-y-5 pt-2">
      {/* Step: Upload */}
      {(step === 'upload' || step === 'extracting') && (
        <MenuImportPDFUploadStep
          menus={menus}
          menuId={menuId}
          setMenuId={setMenuId}
          step={step}
          file={file}
          isDragOver={isDragOver}
          fileInputRef={fileInputRef}
          handleFileSelect={handleFileSelect}
          handleDrop={handleDrop}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleExtract={handleExtract}
          onCancel={onCancel}
        />
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <MenuImportPDFPreviewStep
          extractedItems={extractedItems}
          removeItem={removeItem}
          handleImport={handleImport}
          handleBackToUpload={handleBackToUpload}
        />
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-sm text-app-text-secondary">{t('importing')}</p>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && importResult && (
        <MenuImportPDFDoneStep importResult={importResult} onCancel={onCancel} />
      )}
    </div>
  );
}
