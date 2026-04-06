import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connexion - ATTABL',
  description: 'Connectez-vous à votre espace ATTABL pour gérer votre activité.',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto">{children}</div>;
}
