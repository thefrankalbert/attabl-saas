import AnalyseTabs from '@/components/admin/AnalyseTabs';

/**
 * Shared shell for the four Analyse tabs (Rapports, Historique stock, Factures,
 * Journal d'audit). The tab bar lives here, above the route's Suspense boundary,
 * so it renders once and stays mounted while switching tabs - no flash, no
 * vertical shift. Only the content area below swaps (and shows loading.tsx).
 *
 * Per-tab auth / plan gating stays in each page.tsx; this layout is pure chrome.
 */
export default function AnalyseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <div className="shrink-0">
        <AnalyseTabs />
      </div>
      <div className="flex flex-1 min-h-0 flex-col pt-4">{children}</div>
    </div>
  );
}
