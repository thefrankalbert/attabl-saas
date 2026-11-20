'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CenteredSkeleton } from '@/components/shared/CenteredSkeleton';
import { Button } from '@/components/ui/button';
import { CheckoutView } from '@/components/checkout/CheckoutView';
import { logger } from '@/lib/logger';
import type { SubscriptionPlan, BillingInterval } from '@/types/billing';

type SelfServicePlan = Exclude<SubscriptionPlan, 'enterprise'>;

const VALID_PLANS: SelfServicePlan[] = ['starter', 'pro', 'business'];
const VALID_INTERVALS: BillingInterval[] = ['monthly', 'yearly'];

function isValidPlan(value: string | null): value is SelfServicePlan {
  return VALID_PLANS.includes(value as SelfServicePlan);
}

function isValidInterval(value: string | null): value is BillingInterval {
  return VALID_INTERVALS.includes(value as BillingInterval);
}

/** Le paiement n'a pas pu se charger: on le dit simplement et on propose de revenir. */
function CheckoutError() {
  const t = useTranslations('checkout');
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-white px-5 text-center">
      <h2 className="text-lg font-semibold text-zinc-900">{t('page.errorTitle')}</h2>
      <p className="max-w-xs text-sm text-zinc-600">{t('page.errorDescription')}</p>
      <Button variant="outline" onClick={() => window.history.back()} className="mt-3 h-11 px-5">
        {t('page.back')}
      </Button>
    </div>
  );
}

interface SessionResponse {
  status: number;
  ok: boolean;
  data: { clientSecret?: string; error?: unknown; detail?: unknown };
}

function CheckoutWithPlan({
  plan,
  interval,
  tenantSlug,
}: {
  plan: SelfServicePlan;
  interval: BillingInterval;
  /** Restaurant a abonner. L'API verifie l'appartenance et le role. */
  tenantSlug: string | null;
}) {
  const router = useRouter();

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Une seule demande de session par jeu de parametres. Chaque creation ferme
  // les sessions ouvertes du restaurant (anti double paiement): deux demandes
  // concurrentes (double rendu de React en developpement, re-execution de
  // l'effet) pouvaient fermer celle que la page affiche, et le formulaire
  // restait bloque en chargement.
  const inflight = useRef<{ key: string; promise: Promise<SessionResponse> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = `${plan}|${interval}|${tenantSlug ?? ''}`;
    if (inflight.current?.key !== key) {
      inflight.current = {
        key,
        promise: fetch('/api/create-embedded-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan,
            billingInterval: interval,
            ...(tenantSlug ? { tenantSlug } : {}),
          }),
        }).then(async (r) => ({ status: r.status, ok: r.ok, data: await r.json() })),
      };
    }
    const request = inflight.current.promise;

    async function fetchClientSecret() {
      try {
        const res = await request;

        if (cancelled) return;

        const data = res.data;

        if (res.status === 401) {
          const returnUrl = `/checkout?plan=${plan}&interval=${interval}${
            tenantSlug ? `&tenant=${encodeURIComponent(tenantSlug)}` : ''
          }`;
          router.replace(`/login?redirect=${encodeURIComponent(returnUrl)}`);
          return;
        }

        if (!res.ok) {
          const message =
            (typeof data.detail === 'string' && data.detail) ||
            (typeof data.error === 'string' && data.error) ||
            'server_error';
          setError(message);
          return;
        }

        setClientSecret(typeof data.clientSecret === 'string' ? data.clientSecret : null);
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
  }, [plan, interval, tenantSlug, router]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <CenteredSkeleton className="text-zinc-400" />
      </div>
    );
  }

  if (error || !clientSecret) {
    return <CheckoutError />;
  }

  // Changer de periode recharge l'URL: une nouvelle session est creee (le
  // serveur ferme l'ancienne) et le formulaire repart de zero grace a la cle.
  const changeInterval = (next: BillingInterval) => {
    router.replace(
      `/checkout?plan=${plan}&interval=${next}${
        tenantSlug ? `&tenant=${encodeURIComponent(tenantSlug)}` : ''
      }`,
    );
  };

  return (
    <CheckoutView
      key={clientSecret}
      clientSecret={clientSecret}
      plan={plan}
      interval={interval}
      onIntervalChange={changeInterval}
    />
  );
}

function CheckoutContent() {
  const searchParams = useSearchParams();

  const planParam = searchParams.get('plan');
  const intervalParam = searchParams.get('interval');
  const tenantParam = searchParams.get('tenant');

  const plan = isValidPlan(planParam) ? planParam : null;
  const interval = isValidInterval(intervalParam) ? intervalParam : 'monthly';

  if (!plan) {
    return <CheckoutError />;
  }

  return <CheckoutWithPlan plan={plan} interval={interval} tenantSlug={tenantParam} />;
}

export default function CheckoutPage() {
  const t = useTranslations('checkout');

  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 flex items-center justify-center bg-white">
          <CenteredSkeleton className="text-zinc-400" />
        </div>
      }
    >
      <title>{t('page.title')}</title>
      <CheckoutContent />
    </Suspense>
  );
}
