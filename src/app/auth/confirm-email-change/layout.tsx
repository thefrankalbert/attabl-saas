import type { Metadata } from 'next';
import '../../../styles/auth-theme.css';

export const metadata: Metadata = {
  title: "Changement d'adresse - ATTABL",
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ConfirmEmailChangeLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto">{children}</div>;
}
