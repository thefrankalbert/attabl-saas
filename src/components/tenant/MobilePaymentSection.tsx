'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';

interface MobilePaymentSectionProps {
  orderId: string;
  enabledMethods: string[];
  orderTotal: number;
  formatPrice: (amount: number) => string;
}

export function MobilePaymentSection({
  orderId,
  enabledMethods,
  orderTotal,
  formatPrice,
}: MobilePaymentSectionProps) {
  const t = useTranslations('tenant');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasWave = enabledMethods.includes('wave');
  const hasOrangeMoney = enabledMethods.includes('orange_money');

  if (!hasWave && !hasOrangeMoney) return null;

  const initiate = async (method: 'wave' | 'orange_money') => {
    setLoading(method);
    setError(null);
    try {
      const endpoint =
        method === 'wave'
          ? `/api/orders/${orderId}/pay-wave`
          : `/api/orders/${orderId}/pay-orange-money`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = (await response.json()) as {
        checkoutUrl?: string;
        paymentUrl?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(data.error || t('paymentError'));
        return;
      }

      const redirectUrl = data.checkoutUrl || data.paymentUrl;
      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    } catch (err) {
      logger.error('Mobile payment initiation failed', { err, method, orderId });
      setError(t('connectionError'));
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="mt-5 space-y-3">
      <p className="text-[13px] font-semibold text-[#1A1A1A] text-center">
        {t('payOnline')} - {formatPrice(orderTotal)}
      </p>

      {error && (
        <p className="text-[12px] text-red-600 text-center bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {hasWave && (
        <Button
          onClick={() => initiate('wave')}
          disabled={loading !== null}
          className="w-full h-[52px] rounded-xl bg-[#1B4FD8] hover:bg-[#1642BE] text-white font-semibold text-[15px] gap-2"
        >
          {loading === 'wave' ? <Loader2 className="w-5 h-5 animate-spin" /> : t('payWithWave')}
        </Button>
      )}

      {hasOrangeMoney && (
        <Button
          onClick={() => initiate('orange_money')}
          disabled={loading !== null}
          className="w-full h-[52px] rounded-xl bg-[#FF6600] hover:bg-[#E55A00] text-white font-semibold text-[15px] gap-2"
        >
          {loading === 'orange_money' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            t('payWithOrangeMoney')
          )}
        </Button>
      )}
    </section>
  );
}
