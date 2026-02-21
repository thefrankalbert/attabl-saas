'use client';

import { AuthForm } from '@/components/auth/AuthForm';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

export default function SignupPage() {
  return (
    <AuthLayout>
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-300" />
          </div>
        }
      >
        <AuthForm mode="signup" />
      </Suspense>
    </AuthLayout>
  );
}
