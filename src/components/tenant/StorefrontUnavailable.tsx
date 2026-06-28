import { getTranslations } from 'next-intl/server';

/**
 * Full-screen convive state shown when a tenant is suspended (is_active=false).
 * A suspended restaurant must not browse menus or take orders, so the storefront
 * shell is replaced by this notice. Server component - no interactivity.
 */
export async function StorefrontUnavailable() {
  const t = await getTranslations('tenant');

  return (
    <div className="tenant-client flex h-dvh flex-col items-center justify-center gap-3 overflow-hidden bg-white px-6 text-center antialiased">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-2xl">
        {/* Decorative pause glyph; ASCII only */}
        <span aria-hidden="true">||</span>
      </div>
      <h1 className="text-lg font-semibold text-neutral-900 sm:text-xl">{t('suspendedTitle')}</h1>
      <p className="max-w-sm text-sm text-neutral-500 sm:text-base">{t('suspendedDesc')}</p>
    </div>
  );
}
