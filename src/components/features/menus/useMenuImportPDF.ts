'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import type { Menu } from '@/types/admin.types';
import {
  MAX_FILE_SIZE,
  type ImportResult,
  type PdfExtractedItem,
  type PdfNotImportedItem,
  type Step,
} from './menu-import-pdf.types';

interface UseMenuImportPDFParams {
  menus: Menu[];
  onImportComplete: () => void;
}

export function useMenuImportPDF({ menus, onImportComplete }: UseMenuImportPDFParams) {
  const t = useTranslations('menus');
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('upload');
  const [menuId, setMenuId] = useState<string>(menus.length === 1 ? menus[0].id : '');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [extractedItems, setExtractedItems] = useState<PdfExtractedItem[]>([]);
  // B72: plats dont le prix est refuse, jamais envoyes a l'import.
  const [notImported, setNotImported] = useState<PdfNotImportedItem[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- File handling --------------------------------------

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
    setNotImported([]);
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

  // --- Extract --------------------------------------------

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

      const items = (data.items ?? []) as PdfExtractedItem[];
      const refused = Array.isArray(data.notImported)
        ? (data.notImported as PdfNotImportedItem[])
        : [];

      // Rien a importer ET rien a signaler: le PDF n'a rien donne. Si des plats
      // sont refuses, l'apercu les montre meme quand aucun n'est importable.
      if (items.length === 0 && refused.length === 0) {
        toast({ title: t('pdfNoData'), variant: 'destructive' });
        setStep('upload');
        return;
      }

      // B71: au-dela de la limite de lecture, seule la premiere partie de la
      // carte a ete lue. Le restaurateur le sait avant d'importer.
      if (data.truncated === true) {
        toast({ title: t('pdfTruncatedWarning') });
      }
      setExtractedItems(items);
      setNotImported(refused);
      setStep('preview');
    } catch {
      toast({ title: t('pdfExtractionError'), variant: 'destructive' });
      setStep('upload');
    }
  };

  // --- Remove item from preview ---------------------------

  const removeItem = (index: number) => {
    setExtractedItems((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Import confirmed items -----------------------------

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
        itemsUpdated: data.itemsUpdated ?? 0,
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

  const handleBackToUpload = () => {
    setStep('upload');
    setExtractedItems([]);
    setNotImported([]);
  };

  return {
    step,
    menuId,
    setMenuId,
    file,
    isDragOver,
    extractedItems,
    notImported,
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
  };
}
