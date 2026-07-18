'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CenteredSkeleton } from '@/components/shared/CenteredSkeleton';
import { useTenant } from '@/contexts/TenantContext';
import { useTranslations, useLocale } from 'next-intl';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { useCart } from '@/contexts/CartContext';
import { getCartItemKey } from '@/components/tenant/cart/CartItemsList';
import { remainingItemCapacity } from '@/lib/utils/cart-display';
import { fromMinorUnits } from '@/lib/utils/money';
import { logger } from '@/lib/logger';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowLeft,
  CheckCircle2,
  Plus,
  Utensils,
  Loader2,
  Receipt,
  ChevronRight,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { PriceStacked } from '@/components/tenant/PriceStacked';
import Image from 'next/image';

interface DetailItem {
  name: string;
  quantity: number;
  price: number;
  menu_item_id?: string | null;
  image_url?: string | null;
}

interface OrderDetailData {
  id: string;
  order_number: string;
  table_number: string | null;
  status: string;
  total: number;
  subtotal: number | null;
  tip_amount: number;
  created_at: string;
  items: DetailItem[];
}

// Shape returned by the get_orders_for_tracking RPC (non-PII columns only).
interface TrackedDetailRow {
  id: string;
  order_number: string;
  table_number: string | null;
  status: string;
  total: number;
  subtotal: number | null;
  tip_amount: number | null;
  created_at: string;
  order_items: Array<{
    item_name: string;
    quantity: number;
    price_at_order: number;
    menu_item_id: string | null;
    image_url: string | null;
  }> | null;
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = typeof params.orderId === 'string' ? params.orderId : null;
  const { slug: tenantSlug, tenantId, tenant } = useTenant();
  const t = useTranslations('tenant');
  const locale = useLocale();
  const dateLocale = locale.startsWith('fr') ? fr : undefined;
  const router = useRouter();
  const { addToCart, items } = useCart();
  const { formatDisplayPrice } = useDisplayCurrency();
  const orderCurrency = tenant?.currency || 'XAF';
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());

  const [order, setOrder] = useState<OrderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  useEffect(() => {
    if (!orderId || !tenantId) return;
    let cancelled = false;
    supabaseRef.current
      .rpc('get_orders_for_tracking', { p_tenant_id: tenantId, p_order_ids: [orderId] })
      .then(({ data, error }) => {
        if (cancelled) return;
        const row = ((data as unknown as TrackedDetailRow[] | null) || [])[0];
        if (error || !row) {
          logger.warn('Order detail not found', { orderId });
        } else {
          // Order money columns are integer MINOR units; convert to major at the
          // boundary (order base currency = tenant currency) so formatDisplayPrice
          // and the reorder->cart path (which use major) keep working. Identity for XAF.
          const toMajor = (minor: number) => fromMinorUnits(minor, orderCurrency);
          setOrder({
            id: row.id,
            order_number: row.order_number,
            table_number: row.table_number,
            status: row.status,
            total: toMajor(row.total),
            subtotal: row.subtotal != null ? toMajor(row.subtotal) : null,
            tip_amount: toMajor(row.tip_amount ?? 0),
            created_at: row.created_at,
            items: (row.order_items || []).map((oi) => ({
              name: oi.item_name,
              quantity: oi.quantity,
              price: toMajor(oi.price_at_order),
              menu_item_id: oi.menu_item_id ?? undefined,
              image_url: oi.image_url ?? null,
            })),
          });
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, tenantId, orderCurrency]);

  const subtotal = order
    ? (order.subtotal ?? order.items.reduce((s, i) => s + i.price * i.quantity, 0))
    : 0;
  const grandTotal = order ? order.total + order.tip_amount : 0;
  const isCancelled = order?.status === 'cancelled';

  const handleReorder = useCallback(() => {
    if (!order || !tenantId) return;
    for (const item of order.items) {
      // Skip items whose menu entry no longer exists - they cannot be re-ordered
      // (server price verification would reject an id that is not a real menu_item).
      if (!item.menu_item_id) continue;
      const existingQty = items.find((l) => getCartItemKey(l) === item.menu_item_id)?.quantity ?? 0;
      const toAdd = Math.min(item.quantity, remainingItemCapacity(existingQty));
      for (let i = 0; i < toAdd; i++) {
        addToCart(
          {
            id: item.menu_item_id,
            name: item.name,
            price: item.price,
            quantity: 1,
          },
          tenantId,
          true,
        );
      }
    }
    router.push(`/sites/${tenantSlug}/cart`);
  }, [order, addToCart, items, tenantId, tenantSlug, router]);

  const handleDownloadReceipt = useCallback(async () => {
    if (!order) return;
    setDownloadingReceipt(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      const left = 20;
      const right = 190;
      let y = 22;
      // jsPDF core fonts are cp1252/WinAnsi: the thin-space (U+2009 / U+202F) thousands
      // separator from formatDisplayPrice is not in that charset and renders as a missing
      // glyph. Swap it for a regular ASCII space in the PDF.
      const pdfPrice = (n: number) => formatDisplayPrice(n).replace(/[\u2009\u202f]/g, ' ');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(tenant?.name ?? t('menuTitle'), left, y);
      y += 9;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(order.order_number, left, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(
        format(new Date(order.created_at), 'dd MMM yyyy - HH:mm', { locale: dateLocale }),
        left,
        y,
      );
      y += 6;
      if (order.table_number) {
        doc.text(`${t('table')} ${order.table_number}`, left, y);
        y += 6;
      }

      y += 4;
      doc.setDrawColor(220);
      doc.line(left, y, right, y);
      y += 9;

      doc.setFontSize(11);
      order.items.forEach((item) => {
        doc.text(`${item.quantity} x ${item.name}`, left, y);
        doc.text(pdfPrice(item.price * item.quantity), right, y, { align: 'right' });
        y += 7;
      });

      y += 2;
      doc.line(left, y, right, y);
      y += 9;

      doc.text(t('subtotal'), left, y);
      doc.text(pdfPrice(subtotal), right, y, { align: 'right' });
      y += 8;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(t('total'), left, y);
      doc.text(pdfPrice(grandTotal), right, y, { align: 'right' });

      doc.save(`recu_${order.order_number}.pdf`);
      toast({ title: t('receiptDownloaded') });
    } catch (err) {
      logger.error('Failed to generate receipt PDF', err);
      toast({ title: t('receiptError'), variant: 'destructive' });
    } finally {
      setDownloadingReceipt(false);
    }
  }, [order, tenant, t, dateLocale, formatDisplayPrice, subtotal, grandTotal, toast]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-white px-6">
        <CenteredSkeleton className="text-black/50" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-[var(--color-ink-muted)]">{t('orderNotFound')}</p>
        <Button asChild variant="outline" className="rounded-full">
          <Link href={`/sites/${tenantSlug}/orders`}>{t('backToMenu')}</Link>
        </Button>
      </div>
    );
  }

  const dateStr = format(new Date(order.created_at), 'dd MMM - HH:mm', { locale: dateLocale });

  return (
    <div
      className="h-full bg-[var(--color-surface-alt)]"
      style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* TopBar */}
      <div className="sticky top-0 z-40 border-b border-[var(--color-divider)] bg-white">
        <div className="mx-auto flex max-w-lg items-center gap-2.5 px-[14px] py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/sites/${tenantSlug}/orders?history=true`)}
            aria-label={t('ariaGoBack')}
            className="h-[38px] w-[38px] shrink-0 rounded-full bg-[var(--color-surface-alt)] text-[var(--color-ink)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-mono text-[16px] font-semibold tracking-[-0.2px] text-[var(--color-ink)]">
              {order.order_number}
            </h1>
            <div className="text-[11.5px] text-[var(--color-ink-muted)]">{dateStr}</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-3 px-3 pt-3.5">
        {/* Status card */}
        <section className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white px-4 py-3.5">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-search)] ${isCancelled ? 'bg-[var(--color-promo)]/10' : 'bg-[var(--color-brand-light)]'}`}
          >
            {isCancelled ? (
              <XCircle className="h-5 w-5 text-[var(--color-promo)]" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-[var(--color-brand-dark)]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold text-[var(--color-ink)]">
              {isCancelled ? t('orderCancelledTitle') : t('orderServedTitle')}
            </div>
            {order.table_number && (
              <div className="mt-px text-[11.5px] text-[var(--color-ink-muted)]">
                {t('table')} {order.table_number}
              </div>
            )}
          </div>
          <span
            className={`inline-flex items-center rounded-[var(--radius-tag)] px-2 py-[3px] text-[10.5px] font-semibold ${isCancelled ? 'bg-[var(--color-promo)]/10 text-[var(--color-promo)]' : 'bg-[var(--color-brand-light)] text-[var(--color-brand-dark)]'}`}
          >
            {isCancelled ? t('statusCancelled') : t('orderFinished')}
          </span>
        </section>

        {/* Items */}
        <section className="rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white px-4">
          {order.items.map((item, idx) => {
            const hasImg = item.image_url && !item.image_url.includes('placeholder');
            return (
              <div
                key={idx}
                className="flex items-center gap-3 border-b border-[var(--color-divider)] py-3 last:border-b-0"
              >
                <div className="relative h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[var(--radius-search)] border border-[var(--color-divider)] bg-[var(--color-surface-alt)]">
                  {hasImg ? (
                    <Image
                      src={item.image_url!}
                      alt={item.name}
                      fill
                      sizes="46px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Utensils className="h-4 w-4 text-[var(--color-ink-soft)]" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold tracking-[-0.2px] text-[var(--color-ink)]">
                    {item.name}
                  </div>
                  <div className="mt-px text-[11.5px] text-[var(--color-ink-muted)]">
                    {t('quantityLabel')} - {item.quantity}
                  </div>
                </div>
                <PriceStacked
                  value={formatDisplayPrice(item.price * item.quantity)}
                  numClass="text-[14px] font-bold text-[var(--color-ink)]"
                />
              </div>
            );
          })}
        </section>

        {/* Summary */}
        <section className="rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white px-4 py-3.5">
          <div className="flex items-center justify-between py-[5px]">
            <span className="text-[13px] text-[var(--color-ink-muted)]">{t('subtotal')}</span>
            <PriceStacked
              value={formatDisplayPrice(subtotal)}
              numClass="text-[13px] font-medium text-[var(--color-ink-2)]"
            />
          </div>
          <div className="mt-1 border-t border-[var(--color-divider)] pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold tracking-[-0.2px] text-[var(--color-ink)]">
                {t('total')}
              </span>
              <PriceStacked
                value={formatDisplayPrice(grandTotal)}
                numClass="text-[18px] font-bold text-[var(--color-ink)]"
              />
            </div>
          </div>
        </section>

        {/* Receipt download */}
        <Button
          variant="ghost"
          onClick={handleDownloadReceipt}
          disabled={downloadingReceipt}
          className="flex h-auto w-full items-center justify-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white px-4 py-3.5 hover:bg-[var(--color-surface-alt)]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-search)] bg-[var(--color-surface-alt)]">
            {downloadingReceipt ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin text-[var(--color-ink-muted)]" />
            ) : (
              <Receipt className="h-[18px] w-[18px] text-[var(--color-ink-2)]" />
            )}
          </span>
          <span className="flex-1 text-left text-[13.5px] font-semibold text-[var(--color-ink)]">
            {t('downloadReceipt')}
          </span>
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[var(--color-ink-soft)]" />
        </Button>
      </div>

      {/* CTA: reorder - sits above the in-flow bottom nav so its tabs stay
          tappable. The nav is h-16 (64px) PLUS its own safe-area-inset-bottom
          padding, so the offset must include the inset or the CTA overlaps the
          tab row on notched phones. */}
      <div
        className="fixed inset-x-0 z-[60] border-t border-[var(--color-divider)] bg-white/95 px-3.5 pt-3 pb-4 backdrop-blur"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mx-auto max-w-lg">
          <Button
            onClick={handleReorder}
            className="h-[54px] w-full justify-center gap-2 rounded-full bg-[var(--color-ink)] px-5 text-[15px] font-semibold text-white hover:bg-black"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2.2} />
            <span className="min-w-0 truncate">{t('reorderShort')}</span>
            <span className="shrink-0">- {formatDisplayPrice(subtotal)}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
