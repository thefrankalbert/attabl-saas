import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';

/**
 * Split-screen shell for every auth surface (login / signup / forgot / reset).
 *
 * Une seule colonne: marque, carte d'authentification centree, pied de page
 * de connexion securisee. L'apercu du tableau de bord qui occupait la moitie
 * droite a partir de 1024px a ete retire le 2026-11-06 (decision produit).
 * Ported from the "Attabl Connexion" prototype; palette lives in auth-theme.css
 * (.auth-shell), dark mode follows the app's next-themes `.dark` class.
 *
 * Responsive contract (must never break on any device):
 * - `overflow-x-clip` on the root clips any horizontal spill WITHOUT creating a
 *   scroll container (unlike overflow-hidden), so the auth layout's
 *   `overflow-y-auto` never turns into a horizontal scrollbar.
 * - La colonne est `flex-1 min-w-0` (elle peut toujours retrecir), et elle est
 *   seule: plus de panneau lateral, donc plus aucun risque de carte ecrasee.
 * - The card is fluid (`w-full max-w-sm`) inside padded gutters, so it never
 *   touches the screen edges or overflows, down to 320px.
 * - Safe-area insets keep the header/footer clear of notches and home bars.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('authShell');

  return (
    <div className="auth-shell flex min-h-full w-full flex-row overflow-x-clip">
      {/* -- Left: brand + card + footer -------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-[max(1.25rem,env(safe-area-inset-left))] py-5">
          <Link href="/" className="flex items-center gap-[9px]">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[var(--fg)]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M6 1.5 L10.5 10 L1.5 10 Z" fill="var(--primary-fg)" />
              </svg>
            </span>
            <span className="text-[15px] font-semibold tracking-[0.04em] text-[var(--fg)]">
              ATTABL
            </span>
          </Link>
        </header>

        <main className="flex flex-1 items-start justify-center px-5 py-6 [@media(min-height:820px)]:py-12">
          <div className="mx-auto w-full max-w-sm [animation:auth-fade-up_0.35s_ease]">
            {children}
          </div>
        </main>

        <footer className="flex items-center justify-center gap-2 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-[12.5px] text-[var(--muted)]">
          <Lock className="h-3 w-3 shrink-0" />
          {t('secure')}
        </footer>
      </div>

      {/* PLUS DE PANNEAU A DROITE. L'apercu du tableau de bord qui occupait
       * 46% de l'ecran a partir de 1024px a ete retire le 2026-11-06 (decision
       * produit): la carte de connexion est desormais centree sur toute la
       * largeur, a toutes les tailles. Son historique: introduit par la PR
       * #270, restreint au desktop par la #275, retabli sur tablette paysage
       * par la #276 - c'est pour cela qu'il etait encore visible. */}
    </div>
  );
}
