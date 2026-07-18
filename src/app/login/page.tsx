import { AuthForm } from '@/components/auth/AuthForm';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthFormSkeleton } from '@/components/auth/AuthFormSkeleton';
import { ClearSwCache } from '@/components/shared/ClearSwCache';
import { Suspense } from 'react';

export default function LoginPage() {
  return (
    <AuthShell>
      <ClearSwCache />
      <Suspense fallback={<AuthFormSkeleton />}>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
