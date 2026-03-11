'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Receipt, Download, ExternalLink, Loader2, FileX2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StripeInvoice {
  id: string;
  number: string | null;
  status: string | null;
  amount_paid: number;
  amount_due: number;
  currency: string;
  created: number;
  period_start: number;
  period_end: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

interface InvoiceHistoryClientProps {
  tenantId: string;
  hasStripeCustomer: boolean;
  currency: string;
}

export default function InvoiceHistoryClient({ hasStripeCustomer }: InvoiceHistoryClientProps) {
  const t = useTranslations('invoices');
  const [invoices, setInvoices] = useState<StripeInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    if (!hasStripeCustomer) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/invoices');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch {
      setError(t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [hasStripeCustomer, t]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatAmount = (amount: number, currency: string) => {
    // Stripe amounts are in smallest unit (cents for most currencies, but XAF is zero-decimal)
    const zeroDecimal = [
      'xaf',
      'xof',
      'bif',
      'clp',
      'djf',
      'gnf',
      'jpy',
      'kmf',
      'krw',
      'mga',
      'pyg',
      'rwf',
      'ugx',
      'vnd',
      'vuv',
    ];
    const divisor = zeroDecimal.includes(currency.toLowerCase()) ? 1 : 100;
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
    }).format(amount / divisor);
  };

  const statusVariant = (
    status: string | null,
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'paid':
        return 'default';
      case 'open':
        return 'secondary';
      case 'uncollectible':
      case 'void':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const statusLabel = (status: string | null): string => {
    switch (status) {
      case 'paid':
        return t('statusPaid');
      case 'open':
        return t('statusOpen');
      case 'draft':
        return t('statusDraft');
      case 'uncollectible':
        return t('statusUncollectible');
      case 'void':
        return t('statusVoid');
      default:
        return status || '—';
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-lg sm:text-2xl font-bold text-app-text flex items-center gap-2">
          <Receipt className="w-6 h-6" />
          {t('title')}
          <span className="text-base font-normal text-app-text-secondary">({invoices.length})</span>
        </h1>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 sm:mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-app-text-muted" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={fetchInvoices}>
              {t('retry')}
            </Button>
          </div>
        ) : !hasStripeCustomer || invoices.length === 0 ? (
          <div className="bg-app-card rounded-xl border border-app-border p-12 text-center">
            <div className="w-14 h-14 bg-app-bg rounded-xl flex items-center justify-center mx-auto mb-4">
              <FileX2 className="w-7 h-7 text-app-text-muted" />
            </div>
            <h3 className="text-base font-bold text-app-text">{t('empty')}</h3>
            <p className="text-sm text-app-text-secondary mt-2">{t('emptyDesc')}</p>
          </div>
        ) : (
          <div className="bg-app-card rounded-xl border border-app-border overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-app-border bg-app-bg/50">
                    <th className="text-left text-xs font-semibold text-app-text-secondary px-4 py-3">
                      {t('colNumber')}
                    </th>
                    <th className="text-left text-xs font-semibold text-app-text-secondary px-4 py-3">
                      {t('colDate')}
                    </th>
                    <th className="text-left text-xs font-semibold text-app-text-secondary px-4 py-3">
                      {t('colPeriod')}
                    </th>
                    <th className="text-right text-xs font-semibold text-app-text-secondary px-4 py-3">
                      {t('colAmount')}
                    </th>
                    <th className="text-center text-xs font-semibold text-app-text-secondary px-4 py-3">
                      {t('colStatus')}
                    </th>
                    <th className="text-right text-xs font-semibold text-app-text-secondary px-4 py-3">
                      {t('colActions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-app-border last:border-0 hover:bg-app-bg transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-app-text">
                          {inv.number || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-app-text-secondary">
                        {formatDate(inv.created)}
                      </td>
                      <td className="px-4 py-3 text-sm text-app-text-secondary">
                        {formatDate(inv.period_start)} → {formatDate(inv.period_end)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-app-text tabular-nums">
                          {formatAmount(inv.amount_paid, inv.currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={statusVariant(inv.status)}
                          className={cn(
                            'text-[10px]',
                            inv.status === 'paid' &&
                              'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                          )}
                        >
                          {statusLabel(inv.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {inv.invoice_pdf && (
                            <a
                              href={inv.invoice_pdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 min-h-[44px] text-xs font-medium text-app-text-secondary hover:text-app-text transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                              PDF
                            </a>
                          )}
                          {inv.hosted_invoice_url && (
                            <a
                              href={inv.hosted_invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 min-h-[44px] text-xs font-medium text-primary hover:underline transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              {t('view')}
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-app-border">
              {invoices.map((inv) => (
                <div key={inv.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-app-text">{inv.number || '—'}</span>
                    <Badge
                      variant={statusVariant(inv.status)}
                      className={cn(
                        'text-[10px]',
                        inv.status === 'paid' &&
                          'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                      )}
                    >
                      {statusLabel(inv.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-app-text-secondary">
                    <span>{formatDate(inv.created)}</span>
                    <span className="font-bold text-sm text-app-text tabular-nums">
                      {formatAmount(inv.amount_paid, inv.currency)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {inv.invoice_pdf && (
                      <a
                        href={inv.invoice_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-2 min-h-[44px] text-xs font-medium bg-app-bg rounded-lg text-app-text hover:bg-app-bg transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </a>
                    )}
                    {inv.hosted_invoice_url && (
                      <a
                        href={inv.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-2 min-h-[44px] text-xs font-medium text-primary hover:underline transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {t('view')}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
