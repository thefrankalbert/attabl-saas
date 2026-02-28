import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Créer un compte — ATTABL',
  description: 'Créez votre compte ATTABL et digitalisez votre restaurant en quelques minutes.',
  robots: { index: false, follow: false },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
