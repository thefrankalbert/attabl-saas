'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Scanner, type IDetectedBarcode } from '@yudiel/react-qr-scanner';
import { X, Camera, CameraOff, CheckCircle2, RotateCcw, ScanLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logger } from '@/lib/logger';
import type { Table } from '@/types/admin.types';

// --- Types ---
type ScanStatus = 'loading' | 'scanning' | 'success' | 'error';

export interface QRScanResult {
  tableNumber: string | null;
  menuSlug: string | null;
  rawData: string;
  isUrl: boolean;
}

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: QRScanResult) => void;
  tables?: Table[];
}

// --- Parse QR code data ---
function parseQRData(decodedText: string): QRScanResult {
  const cleanText = decodedText.trim().replace(/\s+/g, '');

  if (cleanText.startsWith('http://') || cleanText.startsWith('https://')) {
    try {
      const scannedUrl = new URL(cleanText);
      const tableParam = scannedUrl.searchParams.get('table') || scannedUrl.searchParams.get('t');
      const menuParam = scannedUrl.searchParams.get('menu');
      return {
        tableNumber: tableParam || null,
        menuSlug: menuParam || null,
        rawData: cleanText,
        isUrl: true,
      };
    } catch {
      return { tableNumber: null, menuSlug: null, rawData: cleanText, isUrl: true };
    }
  }

  return {
    tableNumber: cleanText || null,
    menuSlug: null,
    rawData: cleanText,
    isUrl: false,
  };
}

// --- Component ---
export default function QRScanner({ isOpen, onClose, onScan, tables }: QRScannerProps) {
  const t = useTranslations('qrScanner');
  const manualInputRef = useRef<HTMLInputElement>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasScannedRef = useRef(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('loading');
  const [matchedTable, setMatchedTable] = useState<string | null>(null);

  // Reset on open/close
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: isOpen is an external prop boundary; full multi-field reset required on each open/close cycle; component persists across open/close so useState initializer is insufficient (2026-05-05) */
  useEffect(() => {
    if (!isOpen) {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
      setScanStatus('loading');
      setMatchedTable(null);
      hasScannedRef.current = false;
      return;
    }
    hasScannedRef.current = false;
    setScanStatus('loading');
    setMatchedTable(null);
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // loading -> scanning transition (gives camera time to init)
  useEffect(() => {
    if (!isOpen || scanStatus !== 'loading') return;
    const timer = setTimeout(() => setScanStatus('scanning'), 600);
    return () => clearTimeout(timer);
  }, [isOpen, scanStatus]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

  const submitManualTable = useCallback(() => {
    const value = manualInputRef.current?.value.trim();
    if (value) {
      onScan({ tableNumber: value, menuSlug: null, rawData: value, isUrl: false });
      onClose();
    }
  }, [onScan, onClose]);

  const handleScan = useCallback(
    (detectedCodes: IDetectedBarcode[]) => {
      if (hasScannedRef.current || detectedCodes.length === 0) return;
      hasScannedRef.current = true;

      const result = parseQRData(detectedCodes[0].rawValue);

      if (result.tableNumber && tables && tables.length > 0) {
        const normalizedScanned = result.tableNumber.toLowerCase();
        const found = tables.find(
          (tbl) =>
            tbl.table_number.toLowerCase() === normalizedScanned ||
            tbl.display_name.toLowerCase() === normalizedScanned,
        );
        if (found) setMatchedTable(found.table_number);
      }

      setScanStatus('success');
      successTimeoutRef.current = setTimeout(() => {
        onScan(result);
        onClose();
      }, 800);
    },
    [onScan, onClose, tables],
  );

  const handleError = useCallback((error: unknown) => {
    const errStr = error instanceof Error ? error.message : String(error);
    if (errStr.includes('NotAllowedError') || errStr.includes('Permission denied')) {
      logger.warn('Camera permission denied');
    } else {
      logger.error('Camera error', error);
    }
    setScanStatus('error');
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      {/* Camera feed — fills entire screen; library renders video in JSX, CSS works normally */}
      {scanStatus !== 'error' && (
        <Scanner
          onScan={handleScan}
          onError={handleError}
          paused={scanStatus === 'success'}
          constraints={{ facingMode: 'environment' }}
          formats={['qr_code']}
          components={{ finder: false, torch: false, onOff: false, zoom: false }}
          styles={{
            container: { position: 'absolute', inset: 0, padding: 0 },
            video: { width: '100%', height: '100%', objectFit: 'cover' },
          }}
        />
      )}

      {/* Viewfinder overlay */}
      {(scanStatus === 'scanning' || scanStatus === 'success') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div
            className="w-60 h-60"
            style={{
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
              borderRadius: 4,
              position: 'relative',
            }}
          >
            {/* Corner brackets */}
            <div className="absolute -top-px -left-px w-7 h-7 border-t-2 border-l-2 border-white rounded-tl" />
            <div className="absolute -top-px -right-px w-7 h-7 border-t-2 border-r-2 border-white rounded-tr" />
            <div className="absolute -bottom-px -left-px w-7 h-7 border-b-2 border-l-2 border-white rounded-bl" />
            <div className="absolute -bottom-px -right-px w-7 h-7 border-b-2 border-r-2 border-white rounded-br" />

            {/* Scan line */}
            {scanStatus === 'scanning' && (
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent animate-[scan_2s_ease-in-out_infinite]" />
            )}

            {/* Success overlay */}
            {scanStatus === 'success' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/15 rounded animate-[fadeIn_0.3s_ease-out]">
                <CheckCircle2 className="w-14 h-14 text-white" />
                {matchedTable && (
                  <p className="text-white font-bold text-base mt-2 px-3 text-center">
                    {t('tableMatched', { table: matchedTable })}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Status text */}
          <div className="mt-6 text-center px-8">
            {scanStatus === 'scanning' && <p className="text-white/80 text-sm">{t('placeQR')}</p>}
            {scanStatus === 'success' && (
              <p className="text-white text-sm font-semibold">{t('success')}</p>
            )}
          </div>
        </div>
      )}

      {/* Header — always on top */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)', paddingBottom: '16px' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
            <ScanLine className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-white font-bold text-base tracking-tight">{t('title')}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('close')}
          onClick={onClose}
          className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 pointer-events-auto"
        >
          <X className="w-4 h-4 text-white" />
        </Button>
      </div>

      {/* Loading state */}
      {scanStatus === 'loading' && (
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center"
          style={{ top: 'calc(64px + env(safe-area-inset-top, 0px))' }}
        >
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
            <Camera className="w-8 h-8 text-white/40 animate-pulse" />
          </div>
          <p className="mt-4 text-white/50 text-sm">{t('activating')}</p>
        </div>
      )}

      {/* Error state */}
      {scanStatus === 'error' && (
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center px-6"
          style={{ top: 'calc(64px + env(safe-area-inset-top, 0px))' }}
        >
          <div className="w-full max-w-xs flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
              <CameraOff className="w-7 h-7 text-white/30" />
            </div>
            <div className="text-center">
              <p className="text-white text-base font-semibold">{t('cameraUnavailable')}</p>
              <p className="text-white/40 text-xs mt-1 leading-relaxed">{t('cameraHint')}</p>
            </div>

            <Button
              variant="ghost"
              onClick={() => {
                hasScannedRef.current = false;
                setScanStatus('loading');
              }}
              className="w-full h-11 bg-white/10 text-white rounded-[var(--radius-card)] text-sm font-medium hover:bg-white/20 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {t('retry')}
            </Button>

            <div className="w-full">
              <p className="text-xs text-center text-white/40 mb-2.5">{t('manualTableEntry')}</p>
              <div className="flex gap-2">
                <Input
                  ref={manualInputRef}
                  type="text"
                  inputMode="numeric"
                  placeholder={t('inputPlaceholder')}
                  className="flex-1 text-center bg-white/10 text-white border-white/20 placeholder:text-white/30 rounded-[var(--radius-card)]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitManualTable();
                  }}
                />
                <Button
                  type="button"
                  onClick={submitManualTable}
                  className="min-h-[44px] bg-white text-[var(--color-ink)] font-semibold rounded-[var(--radius-card)] px-4 hover:bg-white/90"
                >
                  {t('confirmTable')}
                </Button>
              </div>
            </div>

            <Button
              variant="ghost"
              onClick={onClose}
              className="text-white/30 text-xs hover:text-white/50 min-h-[44px]"
            >
              {t('close')}
            </Button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes scan {
          0%,
          100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          50% {
            transform: translateY(238px);
            opacity: 1;
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
