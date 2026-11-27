import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Double authentification - ATTABL',
  robots: { index: false, follow: false },
};

/**
 * Page autonome plein ecran (regle 12): seul ce conteneur defile sous 1024px,
 * comme les autres pages de connexion. Les messages viennent de app/auth/layout.
 */
export default function MfaLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto">{children}</div>;
}
