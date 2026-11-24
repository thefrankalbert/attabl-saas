'use client';

import { useTranslations } from 'next-intl';
import { CHART_NEUTRAL, CHART_PALETTE } from '@/lib/design-tokens';
import { ALL_PAYMENT_METHOD_IDS, type PaymentMethodId } from '@/lib/payments/methods';
import type { PaymentMethodRow } from '@/hooks/queries/useAdvancedReports';
import type { CurrencyFormatter } from '../reports.types';

interface PaymentMethodsCardProps {
  rows: PaymentMethodRow[];
  fmt: CurrencyFormatter;
}

const isKnown = (m: string): m is PaymentMethodId =>
  (ALL_PAYMENT_METHOD_IDS as string[]).includes(m);

/** Repartition de l'argent encaisse par moyen de paiement (registre payments). */
export function PaymentMethodsCard({ rows, fmt }: PaymentMethodsCardProps) {
  const t = useTranslations('reports.advanced');
  const tm = useTranslations('admin.settings.paymentMethod');
  const total = rows.reduce((s, r) => s + Math.max(r.net, 0), 0);

  return (
    <section className="bg-app-card border border-app-border/60 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-bold text-app-text">{t('methodsTitle')}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-app-text-muted">{t('noSales')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const share = total > 0 ? Math.round((Math.max(r.net, 0) / total) * 100) : 0;
            // Couleur fixe par moyen (meme couleur d'une periode a l'autre). Un moyen
            // inconnu (ancienne donnee) reste affiche, en gris neutre.
            const color = isKnown(r.method)
              ? CHART_PALETTE[ALL_PAYMENT_METHOD_IDS.indexOf(r.method) % CHART_PALETTE.length]
              : CHART_NEUTRAL;
            return (
              <li key={r.method} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-app-text">
                    {isKnown(r.method) ? tm(`${r.method}.label`) : r.method}
                  </span>
                  <span className="font-semibold tabular-nums text-app-text whitespace-nowrap">
                    {fmt(r.net)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-app-elevated">
                  {/* Couleur de la palette des graphiques: style inline voulu. */}
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${share}%`, backgroundColor: color }}
                  />
                </div>
                <p className="text-xs tabular-nums text-app-text-muted">
                  {t('methodDetail', { share, count: r.count })}
                  {r.refunded > 0 && ` - ${t('methodRefunded', { amount: fmt(r.refunded) })}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
