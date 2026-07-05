import type { Order, Tenant } from '@/types/admin.types';
import { formatAmount, getCurrencySymbol } from '@/lib/utils/currency';
import { formatAmountMinor } from '@/lib/utils/money';
import { receiptStyles } from './receipt-styles';

/** Escape user-controlled strings before interpolating into HTML. */
export function escapeHtml(str: string): string {
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

  // --- Header section (logo or name) --------------------
  const logoHTML = tenant.logo_url
    ? `<img src="${escapeHtml(tenant.logo_url)}" alt="${escapeHtml(tenant.name || '')}" style="max-height:48px;max-width:160px;margin:0 auto 8px;display:block;object-fit:contain;" />`
    : '';

  // --- Items rows ----------------------------------------
  const itemsHTML = items
    .map((item) => {
      // item.price is price_at_order (integer MINOR units); line total stays minor.
      const lineTotal = item.price * item.quantity;
      let row = `
        <div class="item-row">
          <span class="item-qty">${item.quantity}</span>
          <span class="item-name">${escapeHtml(item.name)}</span>
          <span class="item-price">${formatAmountMinor(lineTotal, currency)}</span>
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

  // --- Breakdown -----------------------------------------
  const subtotal = order.subtotal || order.total_price || order.total || 0;
  const taxAmount = order.tax_amount || 0;
  const serviceCharge = order.service_charge_amount || 0;
  const discount = order.discount_amount || 0;
  const tipAmount = order.tip_amount || 0;
  const total = order.total || order.total_price || subtotal;

  let breakdownHTML = `
    <div class="breakdown-row">
      <span>Sous-total</span>
      <span>${formatAmountMinor(subtotal, currency)}</span>
    </div>`;

  if (taxAmount > 0) {
    breakdownHTML += `
    <div class="breakdown-row">
      <span>TVA</span>
      <span>${formatAmountMinor(taxAmount, currency)}</span>
    </div>`;
  }
  if (serviceCharge > 0) {
    breakdownHTML += `
    <div class="breakdown-row">
      <span>Service</span>
      <span>${formatAmountMinor(serviceCharge, currency)}</span>
    </div>`;
  }
  if (discount > 0) {
    breakdownHTML += `
    <div class="breakdown-row breakdown-row--discount">
      <span>Réduction</span>
      <span>-${formatAmountMinor(discount, currency)}</span>
    </div>`;
  }
  if (tipAmount > 0) {
    breakdownHTML += `
    <div class="breakdown-row breakdown-row--tip">
      <span>Pourboire</span>
      <span>+${formatAmountMinor(tipAmount, currency)}</span>
    </div>`;
  }

  // --- Payment method ------------------------------------
  const paymentLabels: Record<string, string> = {
    cash: 'Espèces',
    card: 'Carte bancaire',
    mobile_money: 'Mobile Money',
  };
  const paymentLabel = order.payment_method
    ? paymentLabels[order.payment_method] || order.payment_method
    : '';

  // --- Tenant URL ----------------------------------------
  const tenantUrl = tenant.slug ? `${tenant.slug}.attabl.com` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reçu - ${escapeHtml(order.order_number || `Table ${order.table_number}`)}</title>
  <style>${receiptStyles(primaryColor)}</style>
</head>
<body>
<div class="receipt">

  <!-- --- Header --- -->
  <div class="header">
    ${logoHTML}
    <div class="tenant-name">${escapeHtml(tenant.name || 'Restaurant')}</div>
    ${tenant.address ? `<div class="tenant-info">${escapeHtml(tenant.address)}</div>` : ''}
    ${tenant.phone ? `<div class="tenant-info">Tél : ${escapeHtml(tenant.phone)}</div>` : ''}
  </div>

  <hr class="divider" />

  <!-- --- Order info --- -->
  <div class="info-card">
    <div class="info-row">
      <span class="info-label">N° commande</span>
      <span class="info-value info-value--mono">${escapeHtml(order.order_number || ' - ')}</span>
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

  <!-- --- Items --- -->
  <div class="items-header">Articles commandés</div>
  ${itemsHTML}

  <hr class="divider" />

  <!-- --- Breakdown --- -->
  ${breakdownHTML}

  <hr class="divider--strong" />

  <!-- --- Total --- -->
  <div class="total-section">
    <span class="total-label">Total</span>
    <span>
      <span class="total-amount">${formatAmountMinor(total + tipAmount, currency)}</span>
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

  <!-- --- Footer --- -->
  <div class="footer">
    <div class="thank-you">Merci pour votre visite !</div>
    ${tenantUrl ? `<div class="tenant-url">${escapeHtml(tenantUrl)}</div>` : ''}
    <div class="powered">Powered by ATTABL</div>
  </div>

</div>
</body>
</html>`;
}
