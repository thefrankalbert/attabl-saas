import type { Order, Tenant } from '@/types/admin.types';
import { formatAmount, getCurrencySymbol } from '@/lib/utils/currency';
import { formatAmountMinor } from '@/lib/utils/money';
import { renderDocumentShell, renderBrandHeader, escapeHtml } from './document-shell';

const SERVICE_LABELS: Record<string, string> = {
  dine_in: 'Sur place',
  takeaway: 'A emporter',
  delivery: 'Livraison',
  room_service: 'Room service',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Especes',
  card: 'Carte bancaire',
  mobile_money: 'Mobile money',
};

/** A4 invoice styles layered on top of the shared shell. */
const INVOICE_CSS = `
  .inv-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .inv-doc { text-align: right; }
  .inv-doc__title { font-size: 26px; font-weight: 800; letter-spacing: -0.03em; }
  .inv-doc__num { font-size: 13px; font-weight: 600; color: var(--ink-soft); margin-top: 2px; font-variant-numeric: tabular-nums; }
  .inv-doc__date { font-size: 12px; color: var(--muted); margin-top: 6px; }

  .inv-parties { display: flex; gap: 40px; margin-top: 28px; }
  .inv-party { flex: 1; }
  .inv-party__label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--faint); margin-bottom: 6px; }
  .inv-party__body { font-size: 13px; color: var(--ink-soft); line-height: 1.6; }
  .inv-party__body strong { color: var(--ink); font-weight: 600; }

  .inv-table-wrap { margin-top: 28px; }

  .inv-totals { display: flex; justify-content: flex-end; margin-top: 18px; }
  .inv-totals__box { width: 280px; }
  .inv-totals__row { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); padding: 5px 0; }
  .inv-totals__row span:last-child { font-variant-numeric: tabular-nums; color: var(--ink-soft); }
  .inv-totals__row--discount span:last-child { color: var(--neg); }
  .inv-totals__row--tip span:last-child { color: var(--pos); }
  .inv-totals__grand { display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; padding-top: 12px; border-top: 1.5px solid var(--ink); }
  .inv-totals__grand-label { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  .inv-totals__grand-amount { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }

  .inv-pay { margin-top: 32px; display: flex; align-items: center; gap: 10px; }
  .inv-pay__label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--faint); }
  .inv-pay__badge { font-size: 12px; font-weight: 600; color: var(--ink-soft); background: var(--subtle); border: 1px solid var(--line); border-radius: 999px; padding: 4px 14px; }

  .inv-foot { margin-top: 44px; padding-top: 16px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: flex-end; }
  .inv-foot__note { font-size: 11px; color: var(--muted); max-width: 60%; line-height: 1.5; }
`;

/**
 * Facture A4 app-generee (distincte des factures d'abonnement Stripe).
 * Une facture par commande, imprimable ou exportable en PDF via le navigateur.
 */
export function generateInvoiceHTML(order: Order, tenant: Tenant): string {
  const currency = tenant.currency || 'XAF';
  const currencySymbol = getCurrencySymbol(currency);
  const items = order.items || [];

  const created = new Date(order.created_at);
  const dateLabel = created.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const serviceLabel = SERVICE_LABELS[order.service_type || 'dine_in'] || 'Sur place';

  // --- Items table (item.price is price_at_order, integer MINOR units) ---
  const rowsHTML = items
    .map((item) => {
      const lineTotal = item.price * item.quantity;
      const modifiers =
        item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0
          ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">${item.modifiers
              .map((m) => `${escapeHtml(m.name)} (${formatAmount(m.price, currency)})`)
              .join(', ')}</div>`
          : '';
      const note = item.customer_notes
        ? `<div style="font-size:11px;color:var(--muted);margin-top:2px;">Note : ${escapeHtml(item.customer_notes)}</div>`
        : '';
      return `<tr>
        <td><strong style="color:var(--ink);font-weight:600;">${escapeHtml(item.name)}</strong>${modifiers}${note}</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${formatAmountMinor(item.price, currency)}</td>
        <td class="num">${formatAmountMinor(lineTotal, currency)}</td>
      </tr>`;
    })
    .join('');

  // --- Totals ---
  const subtotal = order.subtotal || order.total_price || order.total || 0;
  const taxAmount = order.tax_amount || 0;
  const serviceCharge = order.service_charge_amount || 0;
  const discount = order.discount_amount || 0;
  const tipAmount = order.tip_amount || 0;
  const total = order.total || order.total_price || subtotal;

  const totalsRows: string[] = [
    `<div class="inv-totals__row"><span>Sous-total</span><span>${formatAmountMinor(subtotal, currency)}</span></div>`,
  ];
  if (taxAmount > 0)
    totalsRows.push(
      `<div class="inv-totals__row"><span>TVA</span><span>${formatAmountMinor(taxAmount, currency)}</span></div>`,
    );
  if (serviceCharge > 0)
    totalsRows.push(
      `<div class="inv-totals__row"><span>Service</span><span>${formatAmountMinor(serviceCharge, currency)}</span></div>`,
    );
  if (discount > 0)
    totalsRows.push(
      `<div class="inv-totals__row inv-totals__row--discount"><span>Remise</span><span>-${formatAmountMinor(discount, currency)}</span></div>`,
    );
  if (tipAmount > 0)
    totalsRows.push(
      `<div class="inv-totals__row inv-totals__row--tip"><span>Pourboire</span><span>+${formatAmountMinor(tipAmount, currency)}</span></div>`,
    );

  const paymentLabel = order.payment_method
    ? PAYMENT_LABELS[order.payment_method] || order.payment_method
    : '';

  // --- Bill-to (customer) ---
  const billToLines = [
    order.customer_name ? `<strong>${escapeHtml(order.customer_name)}</strong>` : '',
    order.table_number ? `Table ${escapeHtml(String(order.table_number))}` : '',
    order.room_number ? `Chambre ${escapeHtml(String(order.room_number))}` : '',
    order.delivery_address ? escapeHtml(order.delivery_address) : '',
    `Service : ${escapeHtml(serviceLabel)}`,
  ]
    .filter(Boolean)
    .join('<br />');

  const numberLabel =
    order.order_number || (order.table_number ? `Table ${order.table_number}` : '');

  const body = `
    <div class="inv-top">
      ${renderBrandHeader({ name: tenant.name, logoUrl: tenant.logo_url, address: tenant.address, phone: tenant.phone }, 'left')}
      <div class="inv-doc">
        <div class="inv-doc__title doc-title">Facture</div>
        <div class="inv-doc__num">${escapeHtml(numberLabel)}</div>
        <div class="inv-doc__date">${escapeHtml(dateLabel)}</div>
      </div>
    </div>

    <div class="inv-parties">
      <div class="inv-party">
        <div class="inv-party__label">Facture a</div>
        <div class="inv-party__body">${billToLines}</div>
      </div>
      ${
        tenant.address || tenant.phone
          ? `<div class="inv-party" style="text-align:right;">
        <div class="inv-party__label">Emise par</div>
        <div class="inv-party__body">${[escapeHtml(tenant.name || 'Restaurant'), tenant.address ? escapeHtml(tenant.address) : '', tenant.phone ? `Tel : ${escapeHtml(tenant.phone)}` : ''].filter(Boolean).join('<br />')}</div>
      </div>`
          : ''
      }
    </div>

    <div class="inv-table-wrap">
      <table class="doc-table">
        <thead>
          <tr>
            <th>Article</th>
            <th class="num">Qte</th>
            <th class="num">Prix unitaire</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>

    <div class="inv-totals">
      <div class="inv-totals__box">
        ${totalsRows.join('')}
        <div class="inv-totals__grand">
          <span class="inv-totals__grand-label">Total</span>
          <span class="inv-totals__grand-amount">${formatAmountMinor(total + tipAmount, currency)} ${escapeHtml(currencySymbol)}</span>
        </div>
      </div>
    </div>

    ${
      paymentLabel
        ? `<div class="inv-pay"><span class="inv-pay__label">Mode de paiement</span><span class="inv-pay__badge">${escapeHtml(paymentLabel)}</span></div>`
        : ''
    }

    <div class="inv-foot">
      <div class="inv-foot__note">Merci pour votre confiance. Cette facture est generee automatiquement par ${escapeHtml(tenant.name || 'le restaurant')}.</div>
      <div class="doc-footer">Powered by ATTABL</div>
    </div>
  `;

  return renderDocumentShell({
    format: 'a4',
    title: `Facture - ${numberLabel}`,
    body,
    css: INVOICE_CSS,
  });
}

/** Ouvre une nouvelle fenetre et lance l'impression / export PDF de la facture. */
export function printInvoice(order: Order, tenant: Tenant): void {
  const html = generateInvoiceHTML(order, tenant);
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}
