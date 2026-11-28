import Link from 'next/link';
import { LocaleToggle } from '@/components/marketing/LocaleToggle';
import { AuthPhotoPanel } from './AuthPhotoPanel';
import type { AuthScene } from './auth-scenes';
import '@/styles/auth-theme.css';

/**
 * Visual frame shared by every auth screen: photo, veil, grain, the card that
 * holds the screen, and the sentence laid over the photo.
 *
 * - From 1024px: full-screen photo, 500px card centred in the left half,
 *   sentence at the bottom of the right half. The page does not scroll; when
 *   the card is taller than the screen, the card scrolls.
 * - Below 1024px: the photo is a banner, the card slides up over it and the
 *   page scrolls normally (the scroller is the route's `h-full overflow-y-auto`
 *   wrapper, see rule 08).
 *
 * The card (`main`) comes BEFORE the photo (`aside`) in the DOM, so keyboard
 * and screen-reader users reach the form first. Only the logo, the language
 * button and the optional `footer` live in the card besides the screen itself.
 * Palette: auth-theme.css (.auth-shell); dark mode follows next-themes.
 */
export function AuthFrame({
  scene,
  footer,
  children,
}: {
  scene: AuthScene;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-shell relative flex min-h-full w-full flex-col overflow-x-clip lg:block lg:h-full lg:min-h-0 lg:overflow-hidden">
      <main className="auth-main relative z-10 order-2 -mt-7 max-lg:[@media(max-height:700px)]:mt-0 flex min-w-0 flex-1 flex-col lg:absolute lg:inset-y-0 lg:left-0 lg:mt-0 lg:w-1/2 lg:flex-row lg:items-center lg:justify-center lg:py-10">
        <div className="auth-card w-full flex-1 rounded-t-[28px] bg-[var(--card)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-7 sm:px-10 lg:max-h-full lg:w-[500px] lg:flex-none lg:overflow-y-auto lg:rounded-[32px] lg:p-10 lg:shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
          <div className="auth-head mb-8 flex items-center justify-between">
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
            <LocaleToggle className="h-9 rounded-full border-[var(--border)] px-3.5 py-0 text-[13px] font-medium text-[var(--fg)] hover:border-[var(--fg)] hover:text-[var(--fg)] dark:border-[var(--border)] dark:text-[var(--fg)] dark:hover:border-[var(--fg)] dark:hover:text-[var(--fg)]" />
          </div>

          <div className="[animation:auth-fade-up_0.35s_ease] motion-reduce:[animation:none]">
            {children}
          </div>

          {footer}
        </div>
      </main>

      <AuthPhotoPanel scene={scene} />
    </div>
  );
}
