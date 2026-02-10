'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, CheckCircle2, AlertCircle } from 'lucide-react';
import { Table } from '@/types/admin.types';

// ─── Types ──────────────────────────────────────────────
type ScanStatus = 'loading' | 'scanning' | 'success' | 'error';

export interface QRScanResult {
  tableNumber: string | null;
  rawData: string;
  isUrl: boolean;
}

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: QRScanResult) => void;
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

  // Case 1: URL — extract ?table= or ?t= parameter
  if (cleanText.startsWith('http://') || cleanText.startsWith('https://')) {
    try {
      const scannedUrl = new URL(cleanText);
      const tableParam =
        scannedUrl.searchParams.get('table') ||
        scannedUrl.searchParams.get('t');

      return {
        tableNumber: tableParam || null,
        rawData: cleanText,
        isUrl: true,
      };
    } catch {
      return { tableNumber: null, rawData: cleanText, isUrl: true };
    }
  }

  // Case 2: Plain text — treat as table number directly
  return {
    tableNumber: cleanText || null,
    rawData: cleanText,
    isUrl: false,
  };
}

// ─── Component ──────────────────────────────────────────
export default function QRScanner({ isOpen, onClose, onScan, tables }: QRScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<InstanceType<
    typeof import('html5-qrcode').Html5Qrcode
  > | null>(null);
  const hasScannedRef = useRef(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('loading');
  const [matchedTable, setMatchedTable] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        html5QrCodeRef.current.stop().catch(() => {});
        html5QrCodeRef.current = null;
      }
      setScanStatus('loading');
      setMatchedTable(null);
      setErrorMessage(null);
      return;
    }

    hasScannedRef.current = false;
    setScanStatus('loading');

    const loadScanner = async () => {
      try {
        const qrModule =
          html5QrcodeModule || (await import('html5-qrcode'));
        html5QrcodeModule = qrModule;

        if (!scannerRef.current || !isOpen) return;

        const qrCode = new qrModule.Html5Qrcode(scannerRef.current.id);
        html5QrCodeRef.current = qrCode;

        await qrCode.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 250, height: 250 },
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
        console.error('Camera error:', err);
        setScanStatus('error');
        setErrorMessage("Impossible d'accéder à la caméra. Vérifiez les permissions.");
      }
    };

    loadScanner();

    return () => {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {});
        html5QrCodeRef.current = null;
      }
    };
  }, [isOpen, processQRCode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="text-white font-semibold text-lg">Scanner QR</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
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
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-72 h-72">
              {/* Animated corner frames */}
              <div className="absolute -top-1 -left-1 w-12 h-12 border-t-4 border-l-4 border-amber-500 rounded-tl-xl" />
              <div className="absolute -top-1 -right-1 w-12 h-12 border-t-4 border-r-4 border-amber-500 rounded-tr-xl" />
              <div className="absolute -bottom-1 -left-1 w-12 h-12 border-b-4 border-l-4 border-amber-500 rounded-bl-xl" />
              <div className="absolute -bottom-1 -right-1 w-12 h-12 border-b-4 border-r-4 border-amber-500 rounded-br-xl" />

              {/* Scanning line animation */}
              {scanStatus === 'scanning' && (
                <div className="absolute top-0 left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent animate-[scan_2s_ease-in-out_infinite]" />
              )}

              {/* Success indicator */}
              {scanStatus === 'success' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-500/20 rounded-xl animate-[fadeIn_0.3s_ease-out]">
                  <CheckCircle2 className="w-16 h-16 text-green-400" />
                  {matchedTable && (
                    <p className="text-green-400 font-bold text-lg mt-2">
                      Table {matchedTable}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-6 pb-safe bg-gradient-to-t from-black/80 to-transparent">
        <div className="text-center">
          {scanStatus === 'loading' && (
            <div className="flex flex-col items-center gap-3">
              <Camera className="w-8 h-8 text-white/60 animate-pulse" />
              <p className="text-white/80 text-sm">Activation de la caméra...</p>
            </div>
          )}

          {scanStatus === 'scanning' && (
            <p className="text-white/80 text-sm">
              Placez le QR code de votre table dans le cadre
            </p>
          )}

          {scanStatus === 'success' && (
            <p className="text-green-400 text-sm font-semibold">
              ✓ Code scanné avec succès !
            </p>
          )}

          {scanStatus === 'error' && (
            <div className="text-center">
              <div className="flex flex-col items-center gap-3">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <p className="text-red-400 text-sm">
                  {errorMessage || 'Erreur lors du scan'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-4 px-6 py-2.5 bg-white/10 text-white rounded-xl text-sm font-medium hover:bg-white/20 transition-colors"
              >
                Fermer
              </button>
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
            transform: translateY(280px);
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
