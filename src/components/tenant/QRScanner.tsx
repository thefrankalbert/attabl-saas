'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Scanner,
  setZXingModuleOverrides,
  type IDetectedBarcode,
  type IScannerError,
} from '@yudiel/react-qr-scanner';
import { X, Camera, CameraOff, RotateCcw, ScanLine, MapPin, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logger } from '@/lib/logger';
import type { Table } from '@/types/admin.types';

// Sans lecteur QR integre au navigateur (Safari sur iPhone), la bibliotheque
// decode avec un module WebAssembly qu'elle allait chercher sur
// fastly.jsdelivr.net: la CSP (connect-src) le refusait, la camera s'ouvrait
// puis l'ecran "camera non disponible" s'affichait. Le module est emis par le
// bundler sous /_next/static: servi par notre domaine, et jamais reecrit par le
// proxy sur le sous-domaine d'un restaurant (un fichier de public/ en .wasm y
// repondait 404). zxing-wasm est epingle a la version qu'utilise le scanner.
const ZXING_READER_WASM = new URL('zxing-wasm/reader/zxing_reader.wasm', import.meta.url).href;
setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) =>
    path.endsWith('.wasm') ? ZXING_READER_WASM : prefix + path,
});

// --- Types ---
type ScanStatus = 'loading' | 'scanning' | 'success' | 'error';
// Cause de l'ecran d'erreur: refus de permission, aucune camera utilisable, autre.
type CameraProblem = 'denied' | 'absent' | 'other';

// Erreurs de la bibliotheque qui veulent dire "pas de camera utilisable ici".
const ABSENT_KINDS: ReadonlySet<string> = new Set(['no-camera', 'unsupported', 'insecure-context']);

/** Vrai quand le navigateur n'offre aucune camera (pas d'API, ou aucune entree video). */
async function hasNoCamera(): Promise<boolean> {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (!devices?.getUserMedia) return true;
  if (!devices.enumerateDevices) return false;
  try {
    const list = await devices.enumerateDevices();
    return !list.some((d) => d.kind === 'videoinput');
  } catch {
    return false;
  }
}

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
  /** Shown on the confirmation card after a successful scan. */
  tenantName?: string;
  zoneName?: string;
  isOpen_venue?: boolean;
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
export default function QRScanner({
  isOpen,
  onClose,
  onScan,
  tables,
  tenantName,
  zoneName,
  isOpen_venue,
}: QRScannerProps) {
  const t = useTranslations('qrScanner');
  const manualInputRef = useRef<HTMLInputElement>(null);
  const hasScannedRef = useRef(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('loading');
  const [matchedTable, setMatchedTable] = useState<string | null>(null);
  const [scannedResult, setScannedResult] = useState<QRScanResult | null>(null);
  // Refus de la permission: on dit ou l'autoriser (un site ne peut pas ouvrir
  // les reglages du telephone lui-meme). Absence de camera: on le dit aussi.
  const [cameraProblem, setCameraProblem] = useState<CameraProblem>('other');

  // Reset on open/close
  useEffect(() => {
    if (!isOpen) {
      setScanStatus('loading');
      setMatchedTable(null);
      setScannedResult(null);
      hasScannedRef.current = false;
      return;
    }
    hasScannedRef.current = false;
    setScanStatus('loading');
    setMatchedTable(null);
    setScannedResult(null);
  }, [isOpen]);

  // Sans camera (ordinateur sans webcam, navigateur sans API), la bibliotheque
  // ne repondait rien de visible: on le detecte a l'ouverture et on le dit.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void hasNoCamera().then((absent) => {
      if (cancelled || !absent) return;
      // Un refus deja signale par la bibliotheque prime: la liste des cameras
      // peut arriver APRES lui (vide sans permission sur certains navigateurs),
      // et "aucune camera" cacherait alors ou autoriser la camera.
      setCameraProblem((prev) => (prev === 'denied' ? prev : 'absent'));
      setScanStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // loading -> scanning transition (gives camera time to init)
  useEffect(() => {
    if (!isOpen || scanStatus !== 'loading') return;
    const timer = setTimeout(() => setScanStatus('scanning'), 600);
    return () => clearTimeout(timer);
  }, [isOpen, scanStatus]);

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

      // Maquette flow: show a confirmation card and let the user confirm the
      // detected table (no auto-navigation).
      setScannedResult(result);
      setScanStatus('success');
    },
    [tables],
  );

  const confirmScan = useCallback(() => {
    if (!scannedResult) return;
    onScan(scannedResult);
    onClose();
  }, [scannedResult, onScan, onClose]);

  const handleError = useCallback((error: IScannerError) => {
    // La bibliotheque classe deja l'erreur: `kind` est la seule source fiable
    // (le message d'origine n'est pas repris tel quel).
    const denied = error.kind === 'permission-denied';
    const absent = ABSENT_KINDS.has(error.kind);
    setCameraProblem(denied ? 'denied' : absent ? 'absent' : 'other');
    if (denied) {
      logger.warn('Camera permission denied');
    } else if (absent) {
      logger.warn('No usable camera', { kind: error.kind });
    } else {
      logger.error('Camera error', error);
    }
    setScanStatus('error');
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      {/* Camera feed - fills entire screen; library renders video in JSX, CSS works normally */}
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
          {scanStatus === 'success' && (
            <p className="mb-9 text-center text-[20px] font-bold leading-tight tracking-[-0.3px] text-white">
              {t('tableDetected')}
            </p>
          )}
          <div
            className="w-60 h-60"
            style={{
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
              borderRadius: 4,
              position: 'relative',
            }}
          >
            {/* Corner brackets (brand green per maquette) */}
            <div className="absolute -top-px -left-px h-7 w-7 rounded-tl border-l-2 border-t-2 border-[var(--brand-cta)]" />
            <div className="absolute -top-px -right-px h-7 w-7 rounded-tr border-r-2 border-t-2 border-[var(--brand-cta)]" />
            <div className="absolute -bottom-px -left-px h-7 w-7 rounded-bl border-b-2 border-l-2 border-[var(--brand-cta)]" />
            <div className="absolute -bottom-px -right-px h-7 w-7 rounded-br border-b-2 border-r-2 border-[var(--brand-cta)]" />

            {/* Scan line */}
            {scanStatus === 'scanning' && (
              <div className="absolute left-0 right-0 top-0 h-px animate-[scan_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-[var(--brand-cta)] to-transparent" />
            )}
          </div>

          {/* Status text (scanning hint) */}
          {scanStatus === 'scanning' && (
            <div className="mt-6 px-8 text-center">
              <p className="text-sm text-white/80">{t('placeQR')}</p>
            </div>
          )}
        </div>
      )}

      {/* Confirmation card (after a successful scan) */}
      {scanStatus === 'success' && scannedResult && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 animate-[fadeIn_0.3s_ease-out] px-3"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="mx-auto max-w-lg rounded-[var(--radius-modal)] bg-white p-3.5 shadow-[0_-2px_16px_rgba(0,0,0,0.18)]">
            <div className="flex items-center gap-3 px-1 pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-search)] bg-[var(--color-brand-light)]">
                <MapPin className="h-5 w-5 text-[var(--color-brand-dark)]" />
              </span>
              <div className="min-w-0 flex-1">
                {(tenantName || zoneName) && (
                  <div className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.4px] text-[var(--color-ink-muted)]">
                    {[tenantName, zoneName].filter(Boolean).join(' - ')}
                  </div>
                )}
                <div className="text-[17px] font-bold tracking-[-0.3px] text-[var(--color-ink)]">
                  {scannedResult.tableNumber || matchedTable
                    ? t('tableMatched', { table: matchedTable || scannedResult.tableNumber || '' })
                    : t('tableDetected')}
                </div>
              </div>
              {isOpen_venue !== undefined && (
                <span
                  className={
                    isOpen_venue
                      ? 'shrink-0 rounded-[var(--radius-tag)] bg-[var(--color-brand-light)] px-2 py-1 text-[11px] font-semibold text-[var(--color-brand-dark)]'
                      : 'shrink-0 rounded-[var(--radius-tag)] bg-[var(--color-surface-alt)] px-2 py-1 text-[11px] font-semibold text-[var(--color-ink-muted)]'
                  }
                >
                  {isOpen_venue ? t('venueOpen') : t('close')}
                </span>
              )}
            </div>
            <Button
              onClick={confirmScan}
              className="h-[54px] w-full justify-center gap-2 rounded-full bg-[var(--color-ink)] text-[15px] font-semibold text-white hover:bg-black"
            >
              {t('confirmTableCta')}
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
            </Button>
          </div>
        </div>
      )}

      {/* Header - always on top */}
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
              <p className="text-white text-base font-semibold">
                {cameraProblem === 'denied'
                  ? t('cameraDeniedTitle')
                  : cameraProblem === 'absent'
                    ? t('noCameraTitle')
                    : t('cameraUnavailable')}
              </p>
              <p className="text-white/60 text-xs mt-1 leading-relaxed">
                {cameraProblem === 'denied'
                  ? t('cameraDeniedHint')
                  : cameraProblem === 'absent'
                    ? t('noCameraHint')
                    : t('cameraHint')}
              </p>
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
              className="text-white/70 text-xs hover:text-white min-h-[44px]"
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
