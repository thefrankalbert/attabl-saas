import type { Order, Tenant } from '@/types/admin.types';
import { formatAmount, getCurrencySymbol } from '@/lib/utils/currency';
import { formatAmountMinor } from '@/lib/utils/money';
import { renderDocumentShell, renderBrandHeader, escapeHtml } from './document-shell';

export { escapeHtml };

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

/** Receipt-specific styles layered on top of the shared document shell. */
const RECEIPT_CSS = `
  .r-eyebrow { text-align: center; margin-top: 12px; }
  .r-number { text-align: center; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; margin-top: 2px; }
  .r-meta { margin-top: 14px; }
  .r-meta__row { display: flex; justify-content: space-between; align-items: baseline; padding: 3px 0; }
  .r-meta__label { font-size: 11px; color: var(--muted); }
  .r-meta__value { font-size: 12px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
  .r-section-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--faint); margin-bottom: 6px; }
  .r-item { display: flex; align-items: baseline; gap: 8px; padding: 5px 0; }
  .r-item__qty { min-width: 22px; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .r-item__name { flex: 1; font-size: 12px; line-height: 1.35; }
  .r-item__price { font-size: 12px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .r-item__detail { font-size: 10px; color: var(--muted); padding: 1px 0 1px 30px; line-height: 1.4; }
  .r-item__detail--mod { color: var(--accent); }
  .r-bd { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); padding: 2px 0; }
  .r-bd--discount { color: var(--neg); }
  .r-bd--tip { color: var(--pos); }
  .r-bd span:last-child { font-variant-numeric: tabular-nums; }
  .r-total { display: flex; justify-content: space-between; align-items: baseline; padding: 10px 0 2px; }
  .r-total__label { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
  .r-total__amount { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
  .r-total__currency { font-size: 12px; font-weight: 600; color: var(--faint); margin-left: 4px; }
  .r-pay { text-align: center; padding: 4px 0; }
  .r-pay__badge { display: inline-block; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); background: var(--subtle); border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px; }
  .r-footer { text-align: center; padding-top: 8px; }
  .r-footer__thanks { font-size: 13px; font-weight: 600; }
  .r-footer__url { font-size: 10px; color: var(--faint); margin-top: 2px; }
  .r-footer__powered { margin-top: 10px; }
`;

/**
 * Genere le HTML d'un recu client premium (imprimante thermique 80mm),
 * aligne sur le langage visuel du dashboard via le shell de document partage.
 */
export function generateReceiptHTML(order: Order, tenant: Tenant): string {
  const currency = tenant.currency || 'XAF';
  const currencySymbol = getCurrencySymbol(currency);
  const items = order.items || [];

  const created = new Date(order.created_at);
  const orderDate = created.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const orderTime = created.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const serviceLabel = SERVICE_LABELS[order.service_type || 'dine_in'] || 'Sur place';

  // --- Items (item.price is price_at_order, integer MINOR units) ---
  const itemsHTML = items
    .map((item) => {
      const lineTotal = item.price * item.quantity;
      let row = `<div class="r-item">
        <span class="r-item__qty doc-num">${item.quantity}x</span>
        <span class="r-item__name">${escapeHtml(item.name)}</span>
        <span class="r-item__price">${formatAmountMinor(lineTotal, currency)}</span>
      </div>`;
      if (item.notes) row += `<div class="r-item__detail">${escapeHtml(item.notes)}</div>`;
      if (item.customer_notes)
        row += `<div class="r-item__detail">Note : ${escapeHtml(item.customer_notes)}</div>`;
      if (item.modifiers && Array.isArray(item.modifiers)) {
        for (const m of item.modifiers) {
          row += `<div class="r-item__detail r-item__detail--mod">+ ${escapeHtml(m.name)} (${formatAmount(m.price, currency)})</div>`;
        }
      }
      return row;
    })
    .join('');

  // --- Breakdown ---
  const subtotal = order.subtotal || order.total_price || order.total || 0;
  const taxAmount = order.tax_amount || 0;
  const serviceCharge = order.service_charge_amount || 0;
  const discount = order.discount_amount || 0;
  const tipAmount = order.tip_amount || 0;
  const total = order.total || order.total_price || subtotal;

  const bd: string[] = [
    `<div class="r-bd"><span>Sous-total</span><span>${formatAmountMinor(subtotal, currency)}</span></div>`,
  ];
  if (taxAmount > 0)
    bd.push(
      `<div class="r-bd"><span>TVA</span><span>${formatAmountMinor(taxAmount, currency)}</span></div>`,
    );
  if (serviceCharge > 0)
    bd.push(
      `<div class="r-bd"><span>Service</span><span>${formatAmountMinor(serviceCharge, currency)}</span></div>`,
    );
  if (discount > 0)
    bd.push(
      `<div class="r-bd r-bd--discount"><span>Reduction</span><span>-${formatAmountMinor(discount, currency)}</span></div>`,
    );
  if (tipAmount > 0)
    bd.push(
      `<div class="r-bd r-bd--tip"><span>Pourboire</span><span>+${formatAmountMinor(tipAmount, currency)}</span></div>`,
    );

  // --- Meta ---
  const metaRows: Array<[string, string]> = [
    ['Date', orderDate],
    ['Heure', orderTime],
  ];
  if (order.table_number) metaRows.push(['Table', String(order.table_number)]);
  metaRows.push(['Service', serviceLabel]);
  if (order.room_number) metaRows.push(['Chambre', String(order.room_number)]);
  if (order.customer_name) metaRows.push(['Client', order.customer_name]);
  const metaHTML = metaRows
    .map(
      ([label, value]) =>
        `<div class="r-meta__row"><span class="r-meta__label">${escapeHtml(label)}</span><span class="r-meta__value">${escapeHtml(value)}</span></div>`,
    )
    .join('');

  const paymentLabel = order.payment_method
    ? PAYMENT_LABELS[order.payment_method] || order.payment_method
    : '';
  const tenantUrl = tenant.slug ? `${tenant.slug}.attabl.com` : '';
  const numberLabel =
    order.order_number || (order.table_number ? `Table ${order.table_number}` : ' - ');

  const body = `
    ${renderBrandHeader({ name: tenant.name, logoUrl: tenant.logo_url, address: tenant.address, phone: tenant.phone }, 'center')}

    <div class="r-eyebrow doc-eyebrow">Recu</div>
    <div class="r-number doc-num">${escapeHtml(numberLabel)}</div>

    <div class="r-meta">${metaHTML}</div>

    <hr class="doc-hr" style="margin:14px 0;" />

    <div class="r-section-label">Articles</div>
    ${itemsHTML}

    <hr class="doc-hr" style="margin:12px 0;" />

    ${bd.join('')}

    <hr class="doc-hr--strong" style="margin:12px 0;" />

    <div class="r-total">
      <span class="r-total__label">Total</span>
      <span><span class="r-total__amount">${formatAmountMinor(total + tipAmount, currency)}</span><span class="r-total__currency">${escapeHtml(currencySymbol)}</span></span>
    </div>

    ${paymentLabel ? `<hr class="doc-hr" style="margin:12px 0;" /><div class="r-pay"><span class="r-pay__badge">${escapeHtml(paymentLabel)}</span></div>` : ''}

    <hr class="doc-hr" style="margin:12px 0;" />

    <div class="r-footer">
      <div class="r-footer__thanks">Merci pour votre visite</div>
      ${tenantUrl ? `<div class="r-footer__url">${escapeHtml(tenantUrl)}</div>` : ''}
      <div class="r-footer__powered doc-footer">Powered by ATTABL</div>
    </div>
  `;

  return renderDocumentShell({
    format: 'thermal80',
    title: `Recu - ${numberLabel}`,
    body,
    css: RECEIPT_CSS,
  });
}
