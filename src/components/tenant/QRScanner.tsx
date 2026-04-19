'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, CameraOff, CheckCircle2, Hash, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logger } from '@/lib/logger';
import { Table } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────────────
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
  onManualEntry?: () => void;
  tables?: Table[];
}

// ─── Module preloading ──────────────────────────────────
let html5QrcodeModule: typeof import('html5-qrcode') | null = null;
export const preloadScanner = () => {
  if (!html5QrcodeModule) {
    import('html5-qrcode').then((mod) => {
      html5QrcodeModule = mod;
    });
  }
};

// ─── Parse QR code data ─────────────────────────────────
function parseQRData(decodedText: string): QRScanResult {
  const cleanText = decodedText.trim().replace(/\s+/g, '');

  // Case 1: URL - extract ?table= or ?t= and ?menu= parameters
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

  // Case 2: Plain text - treat as table number directly
  return {
    tableNumber: cleanText || null,
    menuSlug: null,
    rawData: cleanText,
    isUrl: false,
  };
}

// ─── Component ──────────────────────────────────────────
export default function QRScanner({
  isOpen,
  onClose,
  onScan,
  onManualEntry,
  tables,
}: QRScannerProps) {
  const t = useTranslations('qrScanner');
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<InstanceType<typeof import('html5-qrcode').Html5Qrcode> | null>(
    null,
  );
  const hasScannedRef = useRef(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('loading');
  const [matchedTable, setMatchedTable] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Process the decoded QR text
  const processQRCode = useCallback(
    (decodedText: string) => {
      const result = parseQRData(decodedText);

      // Try to match table from the tables prop
      if (result.tableNumber && tables && tables.length > 0) {
        const found = tables.find(
          (t) =>
            t.table_number === result.tableNumber ||
            t.table_number === result.tableNumber?.toUpperCase() ||
            t.display_name === result.tableNumber,
        );
        if (found) {
          setMatchedTable(found.table_number);
        }
      }

      // Brief delay to show success animation, then callback
      setTimeout(() => {
        onScan(result);
        onClose();
      }, 800);
    },
    [onScan, onClose, tables],
  );

  // Start/stop scanner when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      if (html5QrCodeRef.current) {
        try {
          html5QrCodeRef.current.stop().catch(() => {});
        } catch {
          // stop() throws synchronously if scanner was never started
        }
        html5QrCodeRef.current = null;
      }
      setScanStatus('loading');
      setMatchedTable(null);
      return;
    }

    hasScannedRef.current = false;
    setScanStatus('loading');

    const loadScanner = async () => {
      try {
        const qrModule = html5QrcodeModule || (await import('html5-qrcode'));
        html5QrcodeModule = qrModule;

        if (!scannerRef.current || !isOpen) return;

        const qrCode = new qrModule.Html5Qrcode(scannerRef.current.id);
        html5QrCodeRef.current = qrCode;

        await qrCode.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1,
          },
          (decodedText: string) => {
            if (hasScannedRef.current || !html5QrCodeRef.current) return;
            hasScannedRef.current = true;
            setScanStatus('success');

            const currentScanner = html5QrCodeRef.current;
            html5QrCodeRef.current = null;

            currentScanner
              .stop()
              .then(() => processQRCode(decodedText))
              .catch(() => processQRCode(decodedText));
          },
          () => {}, // Ignore continuous parse errors
        );

        setScanStatus('scanning');
      } catch (err) {
        logger.error('Camera error', err);
        html5QrCodeRef.current = null;
        setScanStatus('error');
      }
    };

    loadScanner();

    return () => {
      if (html5QrCodeRef.current) {
        try {
          html5QrCodeRef.current.stop().catch(() => {});
        } catch {
          // stop() throws synchronously if scanner was never started
        }
        html5QrCodeRef.current = null;
      }
    };
  }, [isOpen, processQRCode, retryCount]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="text-white font-semibold text-lg">{t('title')}</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20"
        >
          <X className="w-5 h-5 text-white" />
        </Button>
      </div>

      {/* Scanner Container */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          id="qr-reader"
          ref={scannerRef}
          className="w-full h-full"
          style={{
            opacity: scanStatus === 'scanning' || scanStatus === 'success' ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
        />

        {/* Scanner Frame Overlay */}
        {scanStatus !== 'error' && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-56 h-56">
                {/* Corner frames */}
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-3 border-l-3 border-amber-500 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-3 border-r-3 border-amber-500 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-3 border-l-3 border-amber-500 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-3 border-r-3 border-amber-500 rounded-br-lg" />

                {/* Scanning line animation */}
                {scanStatus === 'scanning' && (
                  <div className="absolute top-0 left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent animate-[scan_2s_ease-in-out_infinite]" />
                )}

                {/* Success indicator */}
                {scanStatus === 'success' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-500/20 rounded-xl animate-[fadeIn_0.3s_ease-out]">
                    <CheckCircle2 className="w-12 h-12 text-green-400" />
                    {matchedTable && (
                      <p className="text-green-400 font-bold text-lg mt-2">
                        {t('tableMatched', { table: matchedTable })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-6 pb-safe bg-gradient-to-t from-black/80 to-transparent">
        <div className="text-center">
          {scanStatus === 'loading' && (
            <div className="flex flex-col items-center gap-3">
              <Camera className="w-6 h-6 text-white/60 animate-pulse" />
              <p className="text-white/70 text-sm">{t('activating')}</p>
            </div>
          )}

          {scanStatus === 'scanning' && <p className="text-white/70 text-sm">{t('placeQR')}</p>}

          {scanStatus === 'success' && (
            <p className="text-green-400 text-sm font-semibold">{t('success')}</p>
          )}

          {scanStatus === 'error' && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <CameraOff className="w-7 h-7 text-white/40" />
              </div>
              <div>
                <p className="text-white/80 text-sm font-medium">{t('cameraUnavailable')}</p>
                <p className="text-white/40 text-xs mt-1">{t('cameraHint')}</p>
              </div>
              <div className="flex gap-3 mt-1">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setScanStatus('loading');
                    setRetryCount((c) => c + 1);
                  }}
                  className="px-5 py-2.5 bg-white/10 text-white rounded-xl text-sm font-medium hover:bg-white/20 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  {t('retry') || 'Reessayer'}
                </Button>
                {onManualEntry && (
                  <Button
                    variant="default"
                    onClick={() => {
                      onClose();
                      onManualEntry();
                    }}
                    className="px-5 py-2.5 bg-white text-black rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-white/90"
                  >
                    <Hash className="w-4 h-4" />
                    {t('enterManually')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={onClose}
                  className="px-5 py-2.5 bg-white/10 text-white rounded-xl text-sm font-medium hover:bg-white/20"
                >
                  {t('close')}
                </Button>
              </div>
              {/* Manual table number input fallback */}
              <div className="mt-4 w-full max-w-xs mx-auto">
                <p className="text-sm text-center mb-2" style={{ color: '#737373' }}>
                  {t('manualTableEntry') || 'Ou saisissez votre numero de table :'}
                </p>
                <Input
                  type="text"
                  placeholder="Ex: 12"
                  className="text-center bg-white/10 text-white border-white/20 placeholder:text-white/30"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (value) {
                        onScan({
                          tableNumber: value,
                          menuSlug: null,
                          rawData: value,
                          isUrl: false,
                        });
                        onClose();
                      }
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scan animation keyframes */}
      <style jsx>{`
        @keyframes scan {
          0%,
          100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          50% {
            transform: translateY(210px);
            opacity: 1;
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.8);
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
