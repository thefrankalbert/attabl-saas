'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { actionUpdatePaymentMethods } from '@/app/actions/payment-methods';
import { Loader2 } from 'lucide-react';

const PAYMENT_METHOD_KEYS = [
  'cash',
  'card',
  'wave',
  'orange_money',
  'mtn_momo',
  'free_money',
] as const;

type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number];

interface PaymentMethodsSettingsProps {
  tenantId: string;
  initialMethods: string[];
}

export function PaymentMethodsSettings({ initialMethods }: PaymentMethodsSettingsProps) {
  const t = useTranslations('admin.settings');
  const [enabled, setEnabled] = useState<Set<string>>(new Set(initialMethods));
  const [isPending, startTransition] = useTransition();

  const toggle = (method: PaymentMethodKey) => {
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
    <section className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-white mb-1">
        {t('paymentMethodsTitle')}
      </h2>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-5">
        {t('paymentMethodsDesc')}
      </p>

      <div className="space-y-4">
        {PAYMENT_METHOD_KEYS.map((method) => (
          <div key={method} className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Label
                htmlFor={`pm-${method}`}
                className="text-sm font-medium text-neutral-900 dark:text-white cursor-pointer"
              >
                {t(`paymentMethod.${method}.label`)}
              </Label>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
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
