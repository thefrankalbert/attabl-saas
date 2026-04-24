'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CheckoutLeftPanel } from '@/components/checkout/CheckoutLeftPanel';
import { CheckoutRightPanel } from '@/components/checkout/CheckoutRightPanel';
import { logger } from '@/lib/logger';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';

type SelfServicePlan = Exclude<SubscriptionPlan, 'enterprise'>;

const VALID_PLANS: SelfServicePlan[] = ['starter', 'pro', 'business'];
const VALID_INTERVALS: BillingInterval[] = ['monthly', 'yearly', 'semiannual'];

function isValidPlan(value: string | null): value is SelfServicePlan {
  return VALID_PLANS.includes(value as SelfServicePlan);
}

function isValidInterval(value: string | null): value is BillingInterval {
  return VALID_INTERVALS.includes(value as BillingInterval);
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('checkout');

  const planParam = searchParams.get('plan');
  const intervalParam = searchParams.get('interval');

  const plan = isValidPlan(planParam) ? planParam : null;
  const interval = isValidInterval(intervalParam) ? intervalParam : 'monthly';

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!plan) {
      setError('invalid_plan');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchClientSecret() {
      try {
        const res = await fetch('/api/create-embedded-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan, billingInterval: interval }),
        });

        if (cancelled) return;

        const data = await res.json();

        if (res.status === 401) {
          const returnUrl = `/checkout?plan=${plan}&interval=${interval}`;
          router.replace(`/login?redirect=${encodeURIComponent(returnUrl)}`);
          return;
        }

        if (!res.ok) {
          setError(data.error ?? 'server_error');
          return;
        }

        setClientSecret(data.clientSecret);
      } catch (err) {
        if (cancelled) return;
        logger.error('Embedded checkout fetch error', err);
        setError('network_error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchClientSecret();
    return () => {
      cancelled = true;
    };
  }, [plan, interval, router]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="w-8 h-8 animate-spin text-[#c2f542]" />
      </div>
    );
  }

  if (error || !clientSecret || !plan) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] px-4 gap-4">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-red-400" />
        </div>
        <h2 className="text-lg font-semibold text-[#f5f5f4]">{t('page.errorTitle')}</h2>
        <p className="text-sm text-[#a8a29e] text-center max-w-xs">{t('page.errorDescription')}</p>
        <Button
          variant="outline"
          onClick={() => window.history.back()}
          className="mt-2 border-[rgba(255,255,255,0.12)] text-[#f5f5f4] hover:bg-[rgba(255,255,255,0.06)]"
        >
          {t('page.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col md:flex-row">
      <CheckoutLeftPanel plan={plan} interval={interval} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <CheckoutRightPanel clientSecret={clientSecret} />
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const t = useTranslations('checkout');

  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a0a]">
          <Loader2 className="w-8 h-8 animate-spin text-[#c2f542]" />
        </div>
      }
    >
      <title>{t('page.title')}</title>
      <CheckoutContent />
    </Suspense>
  );
}
