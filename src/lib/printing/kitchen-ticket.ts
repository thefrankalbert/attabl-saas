import type { Order } from '@/types/admin.types';

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
 * Génère le HTML d'un ticket cuisine pour impression.
 * Gros caractères, items groupés par course, notes mises en évidence.
 */
export function generateKitchenTicketHTML(order: Order): string {
  const items = order.items || [];
  const orderTime = new Date(order.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const serviceTypeLabels: Record<string, string> = {
    dine_in: '🍽️ SUR PLACE',
    takeaway: '📦 À EMPORTER',
    delivery: '🚗 LIVRAISON',
    room_service: '🏨 ROOM SERVICE',
  };

  const serviceLabel = serviceTypeLabels[order.service_type || 'dine_in'] || '🍽️ SUR PLACE';

  // Course labels and order
  const courseLabels: Record<string, string> = {
    appetizer: '🥗 ENTRÉES',
    main: '🍖 PLATS',
    dessert: '🍰 DESSERTS',
    drink: '🥤 BOISSONS',
  };

  const courseOrder = ['appetizer', 'main', 'dessert', 'drink'];

  // Group items by course
  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    const course = item.course || 'main';
    if (!grouped[course]) grouped[course] = [];
    grouped[course].push(item);
  }

  // Build items HTML grouped by course
  let itemsHTML = '';
  for (const course of courseOrder) {
    const courseItems = grouped[course];
    if (!courseItems || courseItems.length === 0) continue;

    itemsHTML += `
      <tr>
        <td colspan="2" style="padding-top:12px;font-size:14px;font-weight:bold;color:#666;border-bottom:1px solid #ccc;">
          ${courseLabels[course] || course.toUpperCase()}
        </td>
      </tr>
    `;

    for (const item of courseItems) {
      itemsHTML += `
        <tr>
          <td style="font-size:20px;font-weight:bold;padding:6px 0;">
            ${item.quantity}x ${escapeHtml(item.name.toUpperCase())}
          </td>
        </tr>
      `;

      // Customer notes in yellow
      if (item.customer_notes) {
        itemsHTML += `
          <tr>
            <td style="background:#fff3cd;padding:4px 8px;font-size:16px;font-weight:bold;color:#856404;border-radius:4px;">
              ⚠️ ${escapeHtml(item.customer_notes)}
            </td>
          </tr>
        `;
      }

      // Notes (variant info)
      if (item.notes) {
        itemsHTML += `
          <tr>
            <td style="padding-left:20px;font-size:14px;color:#444;">
              ↳ ${escapeHtml(item.notes)}
            </td>
          </tr>
        `;
      }

      // Modifiers in blue
      if (item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0) {
        for (const mod of item.modifiers) {
          itemsHTML += `
            <tr>
              <td style="padding-left:20px;font-size:14px;color:#0066cc;font-weight:bold;">
                + ${escapeHtml(mod.name.toUpperCase())}
              </td>
            </tr>
          `;
        }
      }
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CUISINE - ${escapeHtml(order.order_number || `Table ${order.table_number}`)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 16px;
      width: 300px;
      margin: 0 auto;
      padding: 10px;
      color: #000;
    }
    .center { text-align: center; }
    .separator {
      border-top: 2px dashed #000;
      margin: 10px 0;
    }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; }
    .header {
      text-align: center;
      padding: 8px 0;
    }
    .header h1 {
      font-size: 28px;
      letter-spacing: 2px;
    }
    .service-badge {
      display: inline-block;
      padding: 4px 12px;
      font-size: 16px;
      font-weight: bold;
      border: 2px solid #000;
      border-radius: 4px;
      margin-top: 6px;
    }
    @media print {
      body { width: 100%; }
      @page { margin: 0; size: 80mm auto; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <h1>🔔 CUISINE</h1>
    <p style="font-size:14px;margin-top:4px;">${orderTime}</p>
  </div>

  <div class="separator"></div>

  <!-- Order info - BIG -->
  <div class="center">
    <p style="font-size:32px;font-weight:bold;">TABLE ${escapeHtml(String(order.table_number || ' - '))}</p>
    ${order.order_number ? `<p style="font-size:16px;color:#666;">${escapeHtml(order.order_number)}</p>` : ''}
    <div class="service-badge">${serviceLabel}</div>
    ${order.room_number ? `<p style="font-size:18px;font-weight:bold;margin-top:6px;">Chambre ${escapeHtml(String(order.room_number))}</p>` : ''}
    ${order.delivery_address ? `<p style="font-size:14px;margin-top:4px;">📍 ${escapeHtml(order.delivery_address)}</p>` : ''}
  </div>

  <div class="separator"></div>

  <!-- Items -->
  <table>
    ${itemsHTML}
  </table>

  <div class="separator"></div>

  <!-- Footer -->
  <div class="center" style="padding:8px 0;">
    <p style="font-size:12px;color:#666;">${new Date(order.created_at).toLocaleDateString('fr-FR')}</p>
  </div>
</body>
</html>`;
}

/**
 * Ouvre une nouvelle fenêtre et lance l'impression du ticket cuisine.
 */
export function printKitchenTicket(order: Order): void {
  const html = generateKitchenTicketHTML(order);
  const printWindow = window.open('', '_blank', 'width=350,height=600');
  if (!printWindow) return;

  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}
