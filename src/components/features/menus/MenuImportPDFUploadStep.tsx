'use client';

import { useTranslations } from 'next-intl';
import { Loader2, Upload, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Menu } from '@/types/admin.types';
import { formatFileSize, type Step } from './menu-import-pdf.types';

interface MenuImportPDFUploadStepProps {
  menus: Menu[];
  menuId: string;
  setMenuId: (value: string) => void;
  step: Step;
  file: File | null;
  isDragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (selectedFile: File | undefined) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleExtract: () => void;
  onCancel: () => void;
}

export function MenuImportPDFUploadStep({
  menus,
  menuId,
  setMenuId,
  step,
  file,
  isDragOver,
  fileInputRef,
  handleFileSelect,
  handleDrop,
  handleDragOver,
  handleDragLeave,
  handleExtract,
  onCancel,
}: MenuImportPDFUploadStepProps) {
  const t = useTranslations('menus');

  return (
    <>
      {/* Target menu selector */}
      <div className="space-y-1.5">
        <Label htmlFor="pdf-import-menu" className="text-app-text">
          {t('targetMenu')}
        </Label>
        <Select
          value={menuId || undefined}
          onValueChange={setMenuId}
          disabled={step === 'extracting'}
        >
          <SelectTrigger id="pdf-import-menu" className="w-full">
            <SelectValue placeholder={t('selectTargetMenu')} />
          </SelectTrigger>
          <SelectContent>
            {menus.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        {/* eslint-disable-next-line react/forbid-elements -- <input type="file"> is the CLAUDE.md-documented exception (no shadcn equivalent) */}
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
        <Button type="button" variant="ghost" onClick={onCancel} disabled={step === 'extracting'}>
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
  );
}
