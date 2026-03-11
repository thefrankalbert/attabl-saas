import type { Order, Tenant } from '@/types/admin.types';
import { formatAmount, getCurrencySymbol } from '@/lib/utils/currency';

/** Escape user-controlled strings before interpolating into HTML. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Génère le HTML d'un reçu client premium pour impression.
 * Design épuré inspiré du client-space, optimisé pour imprimante thermique 80mm.
 */
export function generateReceiptHTML(order: Order, tenant: Tenant): string {
  const currency = tenant.currency || 'XAF';
  const currencySymbol = getCurrencySymbol(currency);
  const items = order.items || [];
  const primaryColor = tenant.primary_color || '#18181b';

  const orderDate = new Date(order.created_at).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const orderTime = new Date(order.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const serviceTypeLabels: Record<string, string> = {
    dine_in: 'Sur place',
    takeaway: 'À emporter',
    delivery: 'Livraison',
    room_service: 'Room Service',
  };

  const serviceLabel = serviceTypeLabels[order.service_type || 'dine_in'] || 'Sur place';

  // ─── Header section (logo or name) ────────────────────
  const logoHTML = tenant.logo_url
    ? `<img src="${escapeHtml(tenant.logo_url)}" alt="${escapeHtml(tenant.name || '')}" style="max-height:48px;max-width:160px;margin:0 auto 8px;display:block;object-fit:contain;" />`
    : '';

  // ─── Items rows ────────────────────────────────────────
  const itemsHTML = items
    .map((item) => {
      const lineTotal = item.price * item.quantity;
      let row = `
        <div class="item-row">
          <span class="item-qty">${item.quantity}</span>
          <span class="item-name">${escapeHtml(item.name)}</span>
          <span class="item-price">${formatAmount(lineTotal, currency)}</span>
        </div>`;

      if (item.notes) {
        row += `<div class="item-detail">↳ ${escapeHtml(item.notes)}</div>`;
      }
      if (item.customer_notes) {
        row += `<div class="item-detail item-detail--note">Note: ${escapeHtml(item.customer_notes)}</div>`;
      }
      if (item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0) {
        for (const m of item.modifiers) {
          row += `<div class="item-detail item-detail--mod">+ ${escapeHtml(m.name)} (${formatAmount(m.price, currency)})</div>`;
        }
      }

      return row;
    })
    .join('');

  // ─── Breakdown ─────────────────────────────────────────
  const subtotal = order.subtotal || order.total_price || order.total || 0;
  const taxAmount = order.tax_amount || 0;
  const serviceCharge = order.service_charge_amount || 0;
  const discount = order.discount_amount || 0;
  const tipAmount = order.tip_amount || 0;
  const total = order.total || order.total_price || subtotal;

  let breakdownHTML = `
    <div class="breakdown-row">
      <span>Sous-total</span>
      <span>${formatAmount(subtotal, currency)}</span>
    </div>`;

  if (taxAmount > 0) {
    breakdownHTML += `
    <div class="breakdown-row">
      <span>TVA</span>
      <span>${formatAmount(taxAmount, currency)}</span>
    </div>`;
  }
  if (serviceCharge > 0) {
    breakdownHTML += `
    <div class="breakdown-row">
      <span>Service</span>
      <span>${formatAmount(serviceCharge, currency)}</span>
    </div>`;
  }
  if (discount > 0) {
    breakdownHTML += `
    <div class="breakdown-row breakdown-row--discount">
      <span>Réduction</span>
      <span>-${formatAmount(discount, currency)}</span>
    </div>`;
  }
  if (tipAmount > 0) {
    breakdownHTML += `
    <div class="breakdown-row breakdown-row--tip">
      <span>Pourboire</span>
      <span>+${formatAmount(tipAmount, currency)}</span>
    </div>`;
  }

  // ─── Payment method ────────────────────────────────────
  const paymentLabels: Record<string, string> = {
    cash: 'Espèces',
    card: 'Carte bancaire',
    mobile_money: 'Mobile Money',
  };
  const paymentLabel = order.payment_method
    ? paymentLabels[order.payment_method] || order.payment_method
    : '';

  // ─── Tenant URL ────────────────────────────────────────
  const tenantUrl = tenant.slug ? `${tenant.slug}.attabl.com` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reçu - ${escapeHtml(order.order_number || `Table ${order.table_number}`)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      width: 302px;
      margin: 0 auto;
      padding: 0;
      color: #18181b;
      background: #fff;
      -webkit-font-smoothing: antialiased;
    }

    .receipt {
      padding: 16px 14px;
    }

    /* ─── Header ─────────────────────────────────── */
    .header {
      text-align: center;
      padding-bottom: 14px;
    }
    .header .tenant-name {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: ${primaryColor};
      margin-bottom: 2px;
    }
    .header .tenant-info {
      font-size: 10px;
      color: #a1a1aa;
      line-height: 1.5;
    }

    /* ─── Dividers ────────────────────────────────── */
    .divider {
      border: none;
      border-top: 1px solid #e4e4e7;
      margin: 12px 0;
    }
    .divider--strong {
      border-top: 2px solid #18181b;
      margin: 14px 0;
    }

    /* ─── Order info card ─────────────────────────── */
    .info-card {
      background: #fafafa;
      border: 1px solid #f4f4f5;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 2px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 3px 0;
    }
    .info-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #a1a1aa;
      font-weight: 600;
    }
    .info-value {
      font-size: 12px;
      font-weight: 700;
      color: #18181b;
      font-variant-numeric: tabular-nums;
    }
    .info-value--mono {
      font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
    }

    /* ─── Items section ───────────────────────────── */
    .items-header {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #a1a1aa;
      font-weight: 600;
      padding: 0 0 6px;
    }
    .item-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 5px 0;
    }
    .item-qty {
      font-size: 12px;
      font-weight: 800;
      color: ${primaryColor};
      min-width: 18px;
      text-align: center;
    }
    .item-name {
      flex: 1;
      font-size: 12px;
      color: #18181b;
      line-height: 1.3;
    }
    .item-price {
      font-size: 12px;
      font-weight: 700;
      color: #18181b;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .item-detail {
      font-size: 10px;
      color: #71717a;
      padding: 1px 0 1px 26px;
      line-height: 1.4;
    }
    .item-detail--note {
      color: #ca8a04;
    }
    .item-detail--mod {
      color: #2563eb;
    }

    /* ─── Breakdown ───────────────────────────────── */
    .breakdown-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #71717a;
      padding: 2px 0;
    }
    .breakdown-row--discount {
      color: #dc2626;
    }
    .breakdown-row--tip {
      color: #059669;
    }

    /* ─── Total ───────────────────────────────────── */
    .total-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0 4px;
    }
    .total-label {
      font-size: 14px;
      font-weight: 800;
      color: #18181b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .total-amount {
      font-size: 20px;
      font-weight: 900;
      color: #18181b;
      font-variant-numeric: tabular-nums;
    }
    .total-currency {
      font-size: 12px;
      font-weight: 600;
      color: #a1a1aa;
      margin-left: 4px;
    }

    /* ─── Payment badge ───────────────────────────── */
    .payment-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #71717a;
      background: #f4f4f5;
      border: 1px solid #e4e4e7;
      border-radius: 4px;
      padding: 3px 10px;
    }

    /* ─── Footer ──────────────────────────────────── */
    .footer {
      text-align: center;
      padding-top: 6px;
    }
    .footer .thank-you {
      font-size: 13px;
      font-weight: 700;
      color: #18181b;
      margin-bottom: 4px;
    }
    .footer .tenant-url {
      font-size: 10px;
      color: #a1a1aa;
      letter-spacing: 0.02em;
    }
    .footer .powered {
      font-size: 9px;
      color: #d4d4d8;
      margin-top: 8px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    /* ─── Print styles ────────────────────────────── */
    @media print {
      body { width: 100%; }
      @page { margin: 0; size: 80mm auto; }
      .info-card { background: #fff; border: 1px solid #e4e4e7; }
    }
  </style>
</head>
<body>
<div class="receipt">

  <!-- ═══ Header ═══ -->
  <div class="header">
    ${logoHTML}
    <div class="tenant-name">${escapeHtml(tenant.name || 'Restaurant')}</div>
    ${tenant.address ? `<div class="tenant-info">${escapeHtml(tenant.address)}</div>` : ''}
    ${tenant.phone ? `<div class="tenant-info">Tél : ${escapeHtml(tenant.phone)}</div>` : ''}
  </div>

  <hr class="divider" />

  <!-- ═══ Order info ═══ -->
  <div class="info-card">
    <div class="info-row">
      <span class="info-label">N° commande</span>
      <span class="info-value info-value--mono">${escapeHtml(order.order_number || '—')}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Date</span>
      <span class="info-value">${orderDate}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Heure</span>
      <span class="info-value info-value--mono">${orderTime}</span>
    </div>
    ${
      order.table_number
        ? `<div class="info-row">
      <span class="info-label">Table</span>
      <span class="info-value info-value--mono">${escapeHtml(String(order.table_number))}</span>
    </div>`
        : ''
    }
    <div class="info-row">
      <span class="info-label">Service</span>
      <span class="info-value">${serviceLabel}</span>
    </div>
    ${
      order.room_number
        ? `<div class="info-row">
      <span class="info-label">Chambre</span>
      <span class="info-value info-value--mono">${escapeHtml(String(order.room_number))}</span>
    </div>`
        : ''
    }
    ${
      order.customer_name
        ? `<div class="info-row">
      <span class="info-label">Client</span>
      <span class="info-value">${escapeHtml(order.customer_name)}</span>
    </div>`
        : ''
    }
    <div class="info-row">
      <span class="info-label">Devise</span>
      <span class="info-value">${currencySymbol}</span>
    </div>
  </div>

  <hr class="divider" />

  <!-- ═══ Items ═══ -->
  <div class="items-header">Articles commandés</div>
  ${itemsHTML}

  <hr class="divider" />

  <!-- ═══ Breakdown ═══ -->
  ${breakdownHTML}

  <hr class="divider--strong" />

  <!-- ═══ Total ═══ -->
  <div class="total-section">
    <span class="total-label">Total</span>
    <span>
      <span class="total-amount">${formatAmount(total + tipAmount, currency)}</span>
      <span class="total-currency">${currencySymbol}</span>
    </span>
  </div>

  ${
    paymentLabel
      ? `
  <hr class="divider" />
  <div style="text-align:center;padding:4px 0;">
    <span class="payment-badge">${paymentLabel}</span>
  </div>`
      : ''
  }

  <hr class="divider" />

  <!-- ═══ Footer ═══ -->
  <div class="footer">
    <div class="thank-you">Merci pour votre visite !</div>
    ${tenantUrl ? `<div class="tenant-url">${escapeHtml(tenantUrl)}</div>` : ''}
    <div class="powered">Powered by ATTABL</div>
  </div>

</div>
</body>
</html>`;
}

/**
 * Ouvre une nouvelle fenêtre et lance l'impression du reçu.
 */
export function printReceipt(order: Order, tenant: Tenant): void {
  const html = generateReceiptHTML(order, tenant);
  const printWindow = window.open('', '_blank', 'width=350,height=600');
  if (!printWindow) return;

  printWindow.document.write(html);
  printWindow.document.close();

  // Attendre le chargement puis imprimer
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}
