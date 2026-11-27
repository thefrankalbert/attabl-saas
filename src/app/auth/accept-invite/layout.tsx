import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Rejoindre l'équipe - ATTABL",
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function AcceptInviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
