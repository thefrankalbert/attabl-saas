'use client';

import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type OrderRecord } from './types';

interface ActiveOrderCardProps {
  order: OrderRecord;
  tenantSlug: string;
}

export function ActiveOrderCard({ order, tenantSlug }: ActiveOrderCardProps) {
  const t = useTranslations('tenant');

  const activeStatusLabel: Record<string, string> = {
    pending: t('statusPending'),
    confirmed: t('statusConfirmed'),
    preparing: t('trackerPreparing'),
    ready: t('statusReady'),
  };

  const thumbs = (order.items || []).filter((i) => i.image_url).slice(0, 3);

  return (
    <Link
      href={`/sites/${tenantSlug}/order-confirmed?orderId=${order.id}&view=tracking`}
      className="block overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white"
    >
      <div className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-tag)] bg-[var(--color-brand-light)] px-2 py-[3px] font-mono text-[10.5px] font-medium uppercase tracking-[0.3px] text-[var(--color-brand-dark)]">
              <span className="track-pulse h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" />
              {activeStatusLabel[order.status] ?? order.status}
            </span>
            <div className="mt-2 text-[18px] font-semibold tracking-[-0.5px] text-[var(--color-ink)]">
              {activeStatusLabel[order.status] ?? order.status}
            </div>
            <div className="mt-px font-mono text-[11.5px] text-[var(--color-ink-muted)]">
              {order.order_number}
              {order.table_number ? ` - ${t('table')} ${order.table_number}` : ''}
            </div>
          </div>
          {thumbs.length > 0 && (
            <div className="flex shrink-0">
              {thumbs.map((it, i) => (
                <div
                  key={i}
                  className="h-11 w-11 overflow-hidden rounded-[var(--radius-search)] border-2 border-white"
                  style={{ marginLeft: i === 0 ? 0 : -14 }}
                >
                  <Image
                    src={it.image_url!}
                    alt=""
                    width={44}
                    height={44}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-divider)] bg-[var(--color-surface-alt)] px-4 py-[11px]">
        <span className="text-[12.5px] font-semibold text-[var(--color-ink-2)]">
          {t('trackLive')}
        </span>
        <ArrowRight className="h-[15px] w-[15px] text-[var(--color-ink-2)]" strokeWidth={2} />
      </div>

      <style jsx>{`
        @keyframes track-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }
        .track-pulse {
          animation: track-pulse 1.6s ease-in-out infinite;
        }
      `}</style>
    </Link>
  );
}
