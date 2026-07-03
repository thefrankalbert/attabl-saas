'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Upload, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────

interface SupplierImportResult {
  suppliersCreated: number;
  suppliersUpdated: number;
  suppliersSkipped: number;
  errors: Array<{ row: number; message: string }>;
}

interface SupplierImportExcelProps {
  onImportComplete: () => void;
  onCancel: () => void;
}

// ─── Helpers ────────────────────────────────────────────

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Component ──────────────────────────────────────────

export default function SupplierImportExcel({
  onImportComplete,
  onCancel,
}: SupplierImportExcelProps) {
  const t = useTranslations('inventoryImport');
  const { toast } = useToast();

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<SupplierImportResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: t('maxFileSize'), variant: 'destructive' });
      return;
    }
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.xlsx?$/i)) {
      toast({ title: t('importError'), variant: 'destructive' });
      return;
    }
    setImportFile(file);
    setImportResult(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const response = await fetch('/api/supplier-import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast({ title: data.error || t('importError'), variant: 'destructive' });
        setImportResult({
          suppliersCreated: 0,
          suppliersUpdated: 0,
          suppliersSkipped: 0,
          errors: data.errors || [],
        });
        return;
      }

      setImportResult({
        suppliersCreated: data.suppliersCreated ?? 0,
        suppliersUpdated: data.suppliersUpdated ?? 0,
        suppliersSkipped: data.suppliersSkipped ?? 0,
        errors: data.errors ?? [],
      });

      toast({ title: t('importSuccess') });
      onImportComplete();
    } catch {
      toast({ title: t('importError'), variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5 pt-2">
      {/* Download template link */}
      <a
        href="/api/supplier-import"
        download
        className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
      >
        <Download className="w-4 h-4" />
        {t('downloadTemplate')}
      </a>

      {/* File upload drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all',
          isDragOver
            ? 'border-app-border bg-app-hover'
            : 'border-app-border bg-app-elevated hover:border-app-border hover:bg-app-hover',
        )}
      >
        {/* eslint-disable-next-line react/forbid-elements -- <input type="file"> is the CLAUDE.md-documented exception (no shadcn equivalent) */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
        />
        <div className="w-12 h-12 bg-app-card rounded-xl border border-app-border flex items-center justify-center">
          <Upload className="w-5 h-5 text-app-text-muted" />
        </div>
        {importFile ? (
          <div className="text-center">
            <p className="text-sm font-semibold text-app-text">{importFile.name}</p>
            <p className="text-xs text-app-text-secondary mt-0.5">
              {formatFileSize(importFile.size)}
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-app-text-secondary">{t('dragAndDrop')}</p>
            <p className="text-xs text-app-text-muted mt-1">{t('maxFileSize')}</p>
          </div>
        )}
      </div>

      {/* Import results */}
      {importResult && (
        <div className="rounded-xl border border-app-border bg-app-elevated p-4 space-y-2">
          {importResult.suppliersCreated > 0 && (
            <div className="flex items-center gap-2 text-sm text-status-success">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {t('suppliersCreated', { count: importResult.suppliersCreated })}
            </div>
          )}
          {importResult.suppliersUpdated > 0 && (
            <div className="flex items-center gap-2 text-sm text-status-success">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {t('suppliersUpdated', { count: importResult.suppliersUpdated })}
            </div>
          )}
          {importResult.suppliersSkipped > 0 && (
            <div className="flex items-center gap-2 text-sm text-status-warning">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {t('suppliersSkipped', { count: importResult.suppliersSkipped })}
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
                    {t('rowError', { row: err.row, message: err.message })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t border-app-border">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          variant="default"
          disabled={!importFile || importing}
          onClick={handleImport}
          className="gap-2 rounded-xl"
        >
          {importing && <Loader2 className="w-4 h-4 animate-spin" />}
          {importing ? t('importing') : t('importExcel')}
        </Button>
      </div>
    </div>
  );
}
