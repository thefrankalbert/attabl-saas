'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { actionUpdatePaymentMethods } from '@/app/actions/payment-methods';
import { ACTIVE_PAYMENT_METHOD_IDS, type PaymentMethodId } from '@/lib/payments/methods';
import { Loader2 } from 'lucide-react';

interface PaymentMethodsSettingsProps {
  initialMethods: string[];
}

export function PaymentMethodsSettings({ initialMethods }: PaymentMethodsSettingsProps) {
  const t = useTranslations('admin.settings');
  const [enabled, setEnabled] = useState<Set<string>>(new Set(initialMethods));
  const [isPending, startTransition] = useTransition();

  const toggle = (method: PaymentMethodId) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(method)) {
        if (next.size <= 1) return prev;
        next.delete(method);
      } else {
        next.add(method);
      }
      return next;
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await actionUpdatePaymentMethods(Array.from(enabled));
      if (result.success) {
        toast.success(t('paymentMethodsSaved'));
      } else {
        toast.error(result.error || t('paymentMethodsError'));
      }
    });
  };

  return (
    <section className="rounded-xl border border-app-border bg-app-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-app-text mb-1">{t('paymentMethodsTitle')}</h2>
      <p className="text-xs text-app-text-secondary mb-5">{t('paymentMethodsDesc')}</p>

      <div className="space-y-4">
        {ACTIVE_PAYMENT_METHOD_IDS.map((method) => (
          <div key={method} className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Label
                htmlFor={`pm-${method}`}
                className="text-sm font-medium text-app-text cursor-pointer"
              >
                {t(`paymentMethod.${method}.label`)}
              </Label>
              <p className="text-xs text-app-text-secondary mt-0.5">
                {t(`paymentMethod.${method}.desc`)}
              </p>
            </div>
            <Switch
              id={`pm-${method}`}
              checked={enabled.has(method)}
              onCheckedChange={() => toggle(method)}
              aria-label={t(`paymentMethod.${method}.label`)}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={isPending} size="sm" className="min-w-[120px]">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('savePaymentMethods')}
        </Button>
      </div>
    </section>
  );
}
