'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Upload, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Menu } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────────────

interface ImportResult {
  categoriesCreated: number;
  itemsCreated: number;
  itemsSkipped: number;
  errors: Array<{ row: number; message: string }>;
}

interface MenuImportExcelProps {
  menus: Menu[];
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

export default function MenuImportExcel({
  menus,
  onImportComplete,
  onCancel,
}: MenuImportExcelProps) {
  const t = useTranslations('menus');
  const { toast } = useToast();

  const [importMenuId, setImportMenuId] = useState<string>(menus.length === 1 ? menus[0].id : '');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
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
      formData.append('menuId', importMenuId);

      const response = await fetch('/api/menu-import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast({ title: data.error || t('importError'), variant: 'destructive' });
        setImportResult({
          categoriesCreated: 0,
          itemsCreated: 0,
          itemsSkipped: 0,
          errors: data.errors || [],
        });
        return;
      }

      setImportResult({
        categoriesCreated: data.categoriesCreated ?? 0,
        itemsCreated: data.itemsCreated ?? 0,
        itemsSkipped: data.itemsSkipped ?? 0,
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
        href="/api/menu-import"
        download
        className="inline-flex items-center gap-2 text-sm font-medium text-lime-700 hover:text-lime-800 transition-colors"
      >
        <Download className="w-4 h-4" />
        {t('downloadTemplate')}
      </a>

      {/* Target menu selector */}
      <div className="space-y-1.5">
        <Label htmlFor="import-menu" className="text-neutral-900">
          {t('targetMenu')}
        </Label>
        <select
          id="import-menu"
          value={importMenuId}
          onChange={(e) => setImportMenuId(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-lime-400"
          required
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
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all',
          isDragOver
            ? 'border-lime-400 bg-lime-50'
            : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 hover:bg-neutral-100',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
        />
        <div className="w-12 h-12 bg-white rounded-xl border border-neutral-100 flex items-center justify-center">
          <Upload className="w-5 h-5 text-neutral-400" />
        </div>
        {importFile ? (
          <div className="text-center">
            <p className="text-sm font-semibold text-neutral-900">{importFile.name}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{formatFileSize(importFile.size)}</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-neutral-600">{t('dragAndDrop')}</p>
            <p className="text-xs text-neutral-400 mt-1">{t('maxFileSize')}</p>
          </div>
        )}
      </div>

      {/* Import results */}
      {importResult && (
        <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 space-y-2">
          {importResult.categoriesCreated > 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {t('categoriesCreated', { count: importResult.categoriesCreated })}
            </div>
          )}
          {importResult.itemsCreated > 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              {t('itemsCreated', { count: importResult.itemsCreated })}
            </div>
          )}
          {importResult.itemsSkipped > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {t('itemsSkipped', { count: importResult.itemsSkipped })}
            </div>
          )}
          {importResult.errors.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {t('errorsFound', { count: importResult.errors.length })}
              </div>
              <ul className="ml-6 space-y-0.5">
                {importResult.errors.map((err, i) => (
                  <li key={i} className="text-xs text-red-600">
                    {t('rowError', { row: err.row, message: err.message })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          variant="default"
          disabled={!importFile || !importMenuId || importing}
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
