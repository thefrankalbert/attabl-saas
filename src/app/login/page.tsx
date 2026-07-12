import { AuthForm } from '@/components/auth/AuthForm';
import { AuthShell } from '@/components/auth/AuthShell';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--muted)]" />
          </div>
        }
      >
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
