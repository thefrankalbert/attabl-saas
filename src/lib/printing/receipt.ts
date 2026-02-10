import type { Order, Tenant } from '@/types/admin.types';
import { formatCurrency } from '@/lib/utils/currency';

/**
 * Génère le HTML d'un reçu client pour impression.
 * Format monospace optimisé pour imprimante thermique 80mm.
 */
export function generateReceiptHTML(order: Order, tenant: Tenant): string {
  const currency = tenant.currency || 'XAF';
  const items = order.items || [];
  const orderDate = new Date(order.created_at).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const serviceTypeLabels: Record<string, string> = {
    dine_in: 'Sur place',
    takeaway: 'À emporter',
    delivery: 'Livraison',
    room_service: 'Room Service',
  };

  const serviceLabel = serviceTypeLabels[order.service_type || 'dine_in'] || 'Sur place';

  // Build items rows
  const itemsHTML = items
    .map(
      (item) => `
      <tr>
        <td style="text-align:left;">${item.quantity}x ${item.name}</td>
        <td style="text-align:right;">${formatCurrency(item.price * item.quantity, currency)}</td>
      </tr>
      ${
        item.notes
          ? `<tr><td colspan="2" style="font-size:11px;color:#666;padding-left:20px;">↳ ${item.notes}</td></tr>`
          : ''
      }
      ${
        item.customer_notes
          ? `<tr><td colspan="2" style="font-size:11px;color:#c59000;padding-left:20px;">📝 ${item.customer_notes}</td></tr>`
          : ''
      }
      ${
        item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0
          ? item.modifiers
              .map(
                (m) =>
                  `<tr><td colspan="2" style="font-size:11px;color:#0066cc;padding-left:20px;">+ ${m.name} (${formatCurrency(m.price, currency)})</td></tr>`,
              )
              .join('')
          : ''
      }`,
    )
    .join('');

  // Build breakdown
  const subtotal = order.subtotal || order.total_price || order.total || 0;
  const taxAmount = order.tax_amount || 0;
  const serviceCharge = order.service_charge_amount || 0;
  const discount = order.discount_amount || 0;
  const total = order.total || order.total_price || subtotal;

  let breakdownHTML = `
    <tr><td>Sous-total</td><td style="text-align:right;">${formatCurrency(subtotal, currency)}</td></tr>
  `;

  if (taxAmount > 0) {
    breakdownHTML += `<tr><td>TVA</td><td style="text-align:right;">${formatCurrency(taxAmount, currency)}</td></tr>`;
  }
  if (serviceCharge > 0) {
    breakdownHTML += `<tr><td>Service</td><td style="text-align:right;">${formatCurrency(serviceCharge, currency)}</td></tr>`;
  }
  if (discount > 0) {
    breakdownHTML += `<tr><td style="color:#dc2626;">Réduction</td><td style="text-align:right;color:#dc2626;">-${formatCurrency(discount, currency)}</td></tr>`;
  }

  // Payment method
  const paymentLabels: Record<string, string> = {
    cash: 'Espèces',
    card: 'Carte bancaire',
    mobile_money: 'Mobile Money',
  };
  const paymentLabel = order.payment_method
    ? paymentLabels[order.payment_method] || order.payment_method
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reçu - ${order.order_number || `Table ${order.table_number}`}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 13px;
      width: 300px;
      margin: 0 auto;
      padding: 10px;
      color: #000;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .separator {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    .total-row td {
      font-size: 16px;
      font-weight: bold;
      padding-top: 6px;
      border-top: 2px solid #000;
    }
    @media print {
      body { width: 100%; }
      @page { margin: 0; size: 80mm auto; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="center">
    <h2 style="font-size:18px;margin-bottom:4px;">${tenant.name || 'Restaurant'}</h2>
    ${tenant.address ? `<p style="font-size:11px;">${tenant.address}</p>` : ''}
    ${tenant.phone ? `<p style="font-size:11px;">Tél: ${tenant.phone}</p>` : ''}
  </div>

  <div class="separator"></div>

  <!-- Order info -->
  <table>
    <tr><td class="bold">N°</td><td style="text-align:right;">${order.order_number || '—'}</td></tr>
    <tr><td>Date</td><td style="text-align:right;">${orderDate}</td></tr>
    <tr><td>Table</td><td style="text-align:right;">${order.table_number || '—'}</td></tr>
    <tr><td>Service</td><td style="text-align:right;">${serviceLabel}</td></tr>
    ${order.room_number ? `<tr><td>Chambre</td><td style="text-align:right;">${order.room_number}</td></tr>` : ''}
    ${order.customer_name ? `<tr><td>Client</td><td style="text-align:right;">${order.customer_name}</td></tr>` : ''}
  </table>

  <div class="separator"></div>

  <!-- Items -->
  <table>
    ${itemsHTML}
  </table>

  <div class="separator"></div>

  <!-- Breakdown -->
  <table>
    ${breakdownHTML}
  </table>

  <table>
    <tr class="total-row">
      <td>TOTAL</td>
      <td style="text-align:right;">${formatCurrency(total, currency)}</td>
    </tr>
  </table>

  ${
    paymentLabel
      ? `
    <div class="separator"></div>
    <table>
      <tr><td>Paiement</td><td style="text-align:right;">${paymentLabel}</td></tr>
    </table>
  `
      : ''
  }

  <div class="separator"></div>

  <!-- Footer -->
  <div class="center" style="margin-top:10px;">
    <p style="font-size:12px;">Merci pour votre visite !</p>
    <p style="font-size:10px;color:#888;margin-top:6px;">Powered by ATTABL</p>
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
