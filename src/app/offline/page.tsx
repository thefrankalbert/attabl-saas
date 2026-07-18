import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';

// Offline fallback document. Precached by the service worker (serwist.config.js
// additionalPrecacheEntries) so a navigation attempted with no network still
// renders a real page. Kept fully static and i18n-free so it never depends on a
// server request to render - it must work with zero connectivity.
export const metadata: Metadata = {
  title: 'Hors ligne - ATTABL',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="rounded-2xl bg-muted p-4">
        <WifiOff className="h-8 w-8 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">Pas de connexion</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Vous etes hors ligne. Les commandes que vous prenez sont sauvegardees sur cet appareil et
          partent toutes seules des que le reseau revient.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">Reconnexion automatique...</p>
    </main>
  );
}
