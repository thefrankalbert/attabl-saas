import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Nouveau mot de passe — ATTABL',
  description: 'Définissez un nouveau mot de passe pour votre compte ATTABL.',
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
