'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Upload, CheckCircle2, AlertCircle, Trash2, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Menu } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────────────

interface PdfExtractedItem {
  category: string;
  name: string;
  description: string | null;
  price: number;
}

interface ImportResult {
  categoriesCreated: number;
  categoriesExisting: number;
  itemsCreated: number;
  itemsSkipped: number;
  errors: Array<{ index: number; message: string }>;
}

type Step = 'upload' | 'extracting' | 'preview' | 'importing' | 'done';

interface MenuImportPDFProps {
  menus: Menu[];
  onImportComplete: () => void;
  onCancel: () => void;
}

// ─── Helpers ────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPrice(price: number): string {
  if (price === 0) return '—';
  return price.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ─── Component ──────────────────────────────────────────

export default function MenuImportPDF({ menus, onImportComplete, onCancel }: MenuImportPDFProps) {
  const t = useTranslations('menus');
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('upload');
  const [menuId, setMenuId] = useState<string>(menus.length === 1 ? menus[0].id : '');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [extractedItems, setExtractedItems] = useState<PdfExtractedItem[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── File handling ──────────────────────────────────────

  const handleFileSelect = (selectedFile: File | undefined) => {
    if (!selectedFile) return;

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast({ title: t('pdfMaxFileSize'), variant: 'destructive' });
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      toast({ title: t('pdfExtractionError'), variant: 'destructive' });
      return;
    }

    setFile(selectedFile);
    setExtractedItems([]);
    setImportResult(null);
    setStep('upload');
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files[0]);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  // ─── Extract ────────────────────────────────────────────

  const handleExtract = async () => {
    if (!file || !menuId) return;

    setStep('extracting');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('menuId', menuId);
      formData.append('action', 'extract');

      const response = await fetch('/api/menu-import-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast({ title: data.error || t('pdfExtractionError'), variant: 'destructive' });
        setStep('upload');
        return;
      }

      const items = data.items as PdfExtractedItem[];

      if (!items || items.length === 0) {
        toast({ title: t('pdfNoData'), variant: 'destructive' });
        setStep('upload');
        return;
      }

      setExtractedItems(items);
      setStep('preview');
    } catch {
      toast({ title: t('pdfExtractionError'), variant: 'destructive' });
      setStep('upload');
    }
  };

  // ─── Remove item from preview ───────────────────────────

  const removeItem = (index: number) => {
    setExtractedItems((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Import confirmed items ─────────────────────────────

  const handleImport = async () => {
    if (extractedItems.length === 0) return;

    setStep('importing');

    try {
      const formData = new FormData();
      formData.append('menuId', menuId);
      formData.append('items', JSON.stringify(extractedItems));
      formData.append('action', 'import');

      const response = await fetch('/api/menu-import-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast({ title: data.error || t('importError'), variant: 'destructive' });
        setStep('preview');
        return;
      }

      setImportResult({
        categoriesCreated: data.categoriesCreated ?? 0,
        categoriesExisting: data.categoriesExisting ?? 0,
        itemsCreated: data.itemsCreated ?? 0,
        itemsSkipped: data.itemsSkipped ?? 0,
        errors: data.errors ?? [],
      });

      setStep('done');
      toast({ title: t('importSuccess') });
      onImportComplete();
    } catch {
      toast({ title: t('importError'), variant: 'destructive' });
      setStep('preview');
    }
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-5 pt-2">
      {/* Step: Upload */}
      {(step === 'upload' || step === 'extracting') && (
        <>
          {/* Target menu selector */}
          <div className="space-y-1.5">
            <Label htmlFor="pdf-import-menu" className="text-app-text">
              {t('targetMenu')}
            </Label>
            <select
              id="pdf-import-menu"
              value={menuId}
              onChange={(e) => setMenuId(e.target.value)}
              className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-accent/30"
              required
              disabled={step === 'extracting'}
            >
              <option value="">{t('selectTargetMenu')}</option>
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* File upload drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => step !== 'extracting' && fileInputRef.current?.click()}
            className={cn(
              'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all',
              step === 'extracting' ? 'cursor-default' : 'cursor-pointer',
              isDragOver
                ? 'border-accent bg-accent/5'
                : 'border-app-border bg-app-elevated hover:border-app-border hover:bg-app-hover',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              disabled={step === 'extracting'}
            />

            {step === 'extracting' ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-accent animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-app-text">{t('pdfImporting')}</p>
                  <p className="text-xs text-app-text-muted mt-1">{file?.name}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 bg-app-card rounded-xl border border-app-border flex items-center justify-center">
                  <Upload className="w-5 h-5 text-app-text-muted" />
                </div>
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-semibold text-app-text">{file.name}</p>
                    <p className="text-xs text-app-text-secondary mt-0.5">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm text-app-text-secondary">{t('pdfDragAndDrop')}</p>
                    <p className="text-xs text-app-text-muted mt-1">{t('pdfMaxFileSize')}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={step === 'extracting'}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="default"
              disabled={!file || !menuId || step === 'extracting'}
              onClick={handleExtract}
              className="gap-2 rounded-xl"
            >
              {step === 'extracting' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {step === 'extracting' ? t('pdfImporting') : t('importPdf')}
            </Button>
          </div>
        </>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
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
                    <span className="text-[10px] font-medium uppercase tracking-wider text-accent bg-accent/5 px-1.5 py-0.5 rounded">
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
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-1 rounded-md text-app-text-muted hover:text-red-500 hover:bg-status-error/10 transition-colors"
                    title="Supprimer"
                    aria-label="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {extractedItems.length === 0 && (
            <p className="text-sm text-app-text-secondary text-center py-4">{t('pdfNoData')}</p>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStep('upload');
                setExtractedItems([]);
              }}
            >
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
        <>
          <div className="rounded-xl border border-app-border bg-app-elevated p-4 space-y-2">
            {importResult.categoriesCreated > 0 && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                {t('categoriesCreated', { count: importResult.categoriesCreated })}
              </div>
            )}
            {importResult.itemsCreated > 0 && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                {t('itemsCreated', { count: importResult.itemsCreated })}
              </div>
            )}
            {importResult.itemsSkipped > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {t('itemsSkipped', { count: importResult.itemsSkipped })}
              </div>
            )}
            {importResult.errors.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {t('errorsFound', { count: importResult.errors.length })}
                </div>
                <ul className="ml-6 space-y-0.5">
                  {importResult.errors.map((err, i) => (
                    <li key={i} className="text-xs text-red-500">
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
      )}
    </div>
  );
}
