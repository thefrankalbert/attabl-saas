'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2, RotateCcw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrencyMinor, toMinorUnits, fromMinorUnits } from '@/lib/utils/money';
import {
  actionGetPaymentSummary,
  actionRecordTender,
  actionRefundOrder,
} from '@/app/actions/orders';
import type { PaymentSummary } from '@/services/payment.service';
import type { CurrencyCode } from '@/types/admin.types';

interface OrderPaymentPanelProps {
  tenantId: string;
  orderId: string;
  currency?: CurrencyCode;
  /** Called after a tender/refund so the parent can refresh the order. */
  onUpdate: () => void;
}

/**
 * Payment ledger panel for a single order (audit H2/H8): shows the amount due,
 * what is settled, and every tender; lets staff record a split/partial payment
 * and managers refund. Each action appends an append-only row to the payments
 * ledger and the order's payment_status is recomputed server-side.
 */
export default function OrderPaymentPanel({
  tenantId,
  orderId,
  currency = 'XAF',
  onUpdate,
}: OrderPaymentPanelProps) {
  const t = useTranslations('payment');
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [tenderAmount, setTenderAmount] = useState('');
  const [refundAmount, setRefundAmount] = useState('');

  const {
    data: summary,
    refetch,
    isError,
  } = useQuery<PaymentSummary | null>({
    queryKey: ['paymentSummary', tenantId, orderId],
    queryFn: async () => {
      const res = await actionGetPaymentSummary(tenantId, orderId);
      if (res.error) throw new Error(res.error);
      return res.summary ?? null;
    },
  });

  const load = refetch;

  if (isError) {
    return (
      <div className="rounded-xl border border-app-border p-3">
        <p className="text-xs text-app-text-muted">{t('loadError')}</p>
      </div>
    );
  }

  if (!summary) return null;

  // summary.due / net / remaining and each tender.amount are integer MINOR units.
  const fmt = (amount: number) => formatCurrencyMinor(amount, currency);
  const remaining = Math.max(0, summary.due - summary.net);
  const canSettle = remaining > 0 && summary.paymentStatus !== 'paid';
  const canRefund = summary.net > 0;

  const handleRecord = async () => {
    // The cashier types a MAJOR-unit amount (e.g. 12.50); the ledger stores minor.
    const amount = parseFloat(tenderAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setLoading(true);
    const res = await actionRecordTender(tenantId, orderId, toMinorUnits(amount, currency), 'cash');
    setLoading(false);
    if (res.error) {
      toast({ title: t('paymentError'), description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: t('tenderRecorded') });
    setTenderAmount('');
    await load();
    onUpdate();
  };

  const handleRefund = async () => {
    // Major-unit input -> minor-unit ledger row.
    const amount = parseFloat(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setLoading(true);
    const res = await actionRefundOrder(tenantId, orderId, toMinorUnits(amount, currency), 'cash');
    setLoading(false);
    if (res.error) {
      toast({ title: t('refundError'), description: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: t('refunded') });
    setRefundAmount('');
    await load();
    onUpdate();
  };

  return (
    <div className="rounded-xl border border-app-border p-3 space-y-3">
      <p className="text-[10px] font-medium text-app-text-secondary uppercase tracking-wider">
        {t('ledger')}
      </p>

      {/* Totals */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between text-app-text-muted">
          <span>{t('amountDue')}</span>
          <span className="tabular-nums font-mono text-app-text">{fmt(summary.due)}</span>
        </div>
        <div className="flex justify-between text-app-text-muted">
          <span>{t('netPaid')}</span>
          <span className="tabular-nums font-mono text-app-text">{fmt(summary.net)}</span>
        </div>
        {remaining > 0 && (
          <div className="flex justify-between font-semibold text-[var(--warning)]">
            <span>{t('remaining')}</span>
            <span className="tabular-nums font-mono">{fmt(remaining)}</span>
          </div>
        )}
      </div>

      {/* Tender history */}
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-app-text-secondary uppercase tracking-wider">
          {t('tenderHistory')}
        </p>
        {summary.tenders.length === 0 ? (
          <p className="text-xs text-app-text-muted">{t('noTenders')}</p>
        ) : (
          <ul className="divide-y divide-app-border">
            {summary.tenders.map((tender) => (
              <li key={tender.id} className="flex items-center justify-between py-1 text-xs">
                <span className="text-app-text-muted">{tender.method}</span>
                <span
                  className={
                    tender.status === 'refunded'
                      ? 'tabular-nums font-mono text-[var(--muted-foreground)]'
                      : 'tabular-nums font-mono text-app-text'
                  }
                >
                  {tender.status === 'refunded' ? '-' : ''}
                  {fmt(tender.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Record a (partial) payment */}
      {canSettle && (
        <div className="flex gap-1.5">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={String(fromMinorUnits(remaining, currency))}
            value={tenderAmount}
            onChange={(e) => setTenderAmount(e.target.value)}
            aria-label={t('amount')}
            className="h-9 text-sm"
          />
          <Button
            size="sm"
            onClick={handleRecord}
            disabled={loading || !tenderAmount}
            className="h-9 text-xs shrink-0"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            {t('recordPayment')}
          </Button>
        </div>
      )}

      {/* Refund */}
      {canRefund && (
        <div className="flex gap-1.5">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={String(fromMinorUnits(summary.net, currency))}
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            aria-label={t('refundAmount')}
            className="h-9 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefund}
            disabled={loading || !refundAmount}
            className="h-9 text-xs shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            {t('refund')}
          </Button>
        </div>
      )}
    </div>
  );
}
