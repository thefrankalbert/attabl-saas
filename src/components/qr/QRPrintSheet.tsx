'use client';

import type { ReactNode } from 'react';

/**
 * Print-only isolation. On screen the children are hidden; when the browser
 * prints, everything except #qr-print-root is hidden so a clean single card
 * lands on the page (no admin shell). Scoped <style> keeps globals.css untouched.
 */
export function QRPrintSheet({ children }: { children: ReactNode }) {
  return (
    <>
      <div id="qr-print-root" aria-hidden className="hidden">
        <div className="qr-print-card">{children}</div>
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #qr-print-root, #qr-print-root * { visibility: visible !important; }
          #qr-print-root {
            display: flex !important;
            position: fixed;
            inset: 0;
            align-items: center;
            justify-content: center;
          }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </>
  );
}
