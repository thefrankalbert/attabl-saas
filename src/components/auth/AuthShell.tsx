import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';

/**
 * Split-screen shell for every auth surface (login / signup / forgot / reset).
 *
 * Left: brand, the centered auth card (children), a secure-connection footer.
 * Right (>= 900px): a grayscale-faded dashboard preview with a short pitch.
 * Ported from the "Attabl Auth.dc.html" prototype; palette lives in auth-theme.css
 * (.auth-shell), dark mode follows the app's next-themes `.dark` class.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('authShell');

  return (
    <div className="auth-shell flex min-h-full flex-row">
      {/* -- Left: brand + card + footer -------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-7 py-5">
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

        <main className="flex flex-1 items-start justify-center px-5 pb-20 pt-12">
          <div className="w-full max-w-[384px] [animation:auth-fade-up_0.35s_ease]">{children}</div>
        </main>

        <footer className="flex items-center justify-center gap-2 p-5 text-[12.5px] text-[var(--muted)]">
          <Lock className="h-3 w-3" />
          {t('secure')}
        </footer>
      </div>

      {/* -- Right: product panel (hidden < 900px) ---------------------- */}
      <aside className="relative hidden w-[46%] flex-col justify-end overflow-hidden min-[900px]:flex">
        <Image
          src="/auth/dashboard-preview.png"
          alt={t('panelImageAlt')}
          fill
          priority
          sizes="46vw"
          className="object-cover object-[left_center]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 55%, transparent) 28%, color-mix(in srgb, var(--bg) 0%, transparent) 62%), linear-gradient(180deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 0%, transparent) 26%), linear-gradient(0deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 0%, transparent) 42%)',
          }}
        />
        <div className="relative max-w-[480px] px-12 pb-[52px]">
          <h2 className="mb-2 text-[20px] font-semibold tracking-[-0.02em] text-[var(--heading)]">
            {t('panelTitle')}
          </h2>
          <p className="text-sm leading-[1.6] text-[var(--secondary)]">{t('panelSub')}</p>
        </div>
      </aside>
    </div>
  );
}
