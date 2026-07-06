import type { Order, KDSZoneFilter } from '@/types/admin.types';
import { renderDocumentShell, escapeHtml } from './document-shell';

interface PrintOptions {
  zoneFilter?: KDSZoneFilter;
  barDisplayEnabled?: boolean;
}

/** Filter items based on zone selection */
function filterItemsByZone(
  allItems: Order['items'],
  barDisplayEnabled: boolean,
  zoneFilter: KDSZoneFilter,
) {
  return (allItems || []).filter((item) => {
    const zone = item.preparation_zone || 'kitchen';
    if (!barDisplayEnabled) return true;
    if (zoneFilter === 'kitchen') return zone !== 'bar';
    if (zoneFilter === 'bar') return zone !== 'kitchen';
    return true;
  });
}

const SERVICE_LABELS: Record<string, string> = {
  dine_in: 'Sur place',
  takeaway: 'A emporter',
  delivery: 'Livraison',
  room_service: 'Room service',
};

const COURSE_LABELS: Record<string, string> = {
  appetizer: 'Entrees',
  main: 'Plats',
  dessert: 'Desserts',
  drink: 'Boissons',
};

const COURSE_ORDER = ['appetizer', 'main', 'dessert', 'drink'];

/**
 * Kitchen ticket styles: large, high-contrast, fast to scan on the line.
 * Neutral premium language (no emoji), 80mm thermal.
 */
const KITCHEN_CSS = `
  .k-head { text-align: center; }
  .k-head__eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; color: var(--muted); }
  .k-head__table { font-size: 34px; font-weight: 800; letter-spacing: -0.01em; margin-top: 4px; line-height: 1.05; }
  .k-head__badge { display: inline-block; margin-top: 8px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; border: 1.5px solid var(--ink); border-radius: 6px; padding: 3px 12px; }
  .k-head__sub { font-size: 12px; color: var(--muted); margin-top: 6px; }
  .k-head__num { font-size: 13px; font-weight: 600; color: var(--muted); margin-top: 4px; font-variant-numeric: tabular-nums; }

  .k-course { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--faint); padding: 14px 0 4px; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
  .k-item { font-size: 21px; font-weight: 800; line-height: 1.2; padding: 7px 0 2px; }
  .k-item__qty { font-variant-numeric: tabular-nums; }
  .k-note { font-size: 15px; font-weight: 700; background: var(--subtle); border: 1px solid var(--line); border-left: 3px solid var(--ink); border-radius: 4px; padding: 5px 9px; margin: 4px 0; }
  .k-detail { font-size: 14px; color: var(--muted); padding-left: 18px; }
  .k-mod { font-size: 14px; font-weight: 700; color: var(--accent); padding-left: 18px; text-transform: uppercase; }

  .k-foot { text-align: center; font-size: 11px; color: var(--faint); }
`;

/**
 * Genere le HTML d'un ticket cuisine premium (80mm). Gros caracteres, items
 * groupes par course, notes mises en evidence, aligne sur le shell de document.
 */
export function generateKitchenTicketHTML(order: Order, options: PrintOptions = {}): string {
  const { zoneFilter = 'all', barDisplayEnabled = false } = options;
  const items = filterItemsByZone(order.items, barDisplayEnabled, zoneFilter);
  const orderTime = new Date(order.created_at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const orderDate = new Date(order.created_at).toLocaleDateString('fr-FR');
  const serviceLabel = SERVICE_LABELS[order.service_type || 'dine_in'] || 'Sur place';

  // Group items by course
  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    const course = item.course || 'main';
    if (!grouped[course]) grouped[course] = [];
    grouped[course].push(item);
  }

  let itemsHTML = '';
  for (const course of COURSE_ORDER) {
    const courseItems = grouped[course];
    if (!courseItems || courseItems.length === 0) continue;

    itemsHTML += `<div class="k-course">${COURSE_LABELS[course] || course.toUpperCase()}</div>`;
    for (const item of courseItems) {
      itemsHTML += `<div class="k-item"><span class="k-item__qty">${item.quantity}x</span> ${escapeHtml(item.name.toUpperCase())}</div>`;
      if (item.customer_notes)
        itemsHTML += `<div class="k-note">${escapeHtml(item.customer_notes)}</div>`;
      if (item.notes) itemsHTML += `<div class="k-detail">${escapeHtml(item.notes)}</div>`;
      if (item.modifiers && Array.isArray(item.modifiers)) {
        for (const mod of item.modifiers) {
          itemsHTML += `<div class="k-mod">+ ${escapeHtml(mod.name.toUpperCase())}</div>`;
        }
      }
    }
  }

  const body = `
    <div class="k-head">
      <div class="k-head__eyebrow">Cuisine</div>
      <div class="k-head__table">Table ${escapeHtml(String(order.table_number || ' - '))}</div>
      <div class="k-head__badge">${escapeHtml(serviceLabel)}</div>
      ${order.order_number ? `<div class="k-head__num">${escapeHtml(order.order_number)}</div>` : ''}
      ${order.room_number ? `<div class="k-head__sub">Chambre ${escapeHtml(String(order.room_number))}</div>` : ''}
      ${order.delivery_address ? `<div class="k-head__sub">${escapeHtml(order.delivery_address)}</div>` : ''}
      <div class="k-head__sub doc-num">${escapeHtml(orderTime)}</div>
    </div>

    <hr class="doc-hr--strong" style="margin:12px 0;" />

    ${itemsHTML}

    <hr class="doc-hr" style="margin:14px 0;" />

    <div class="k-foot doc-num">${escapeHtml(orderDate)}</div>
  `;

  return renderDocumentShell({
    format: 'thermal80',
    title: `Cuisine - ${order.order_number || `Table ${order.table_number ?? ''}`}`,
    body,
    css: KITCHEN_CSS,
  });
}

/** Ouvre une nouvelle fenetre et lance l'impression du ticket cuisine. */
export function printKitchenTicket(order: Order, options: PrintOptions = {}): boolean {
  const { zoneFilter = 'all', barDisplayEnabled = false } = options;
  const relevantItems = filterItemsByZone(order.items, barDisplayEnabled, zoneFilter);
  if (relevantItems.length === 0) return false;

  const html = generateKitchenTicketHTML(order, options);
  const printWindow = window.open('', '_blank', 'width=350,height=600');
  if (!printWindow) return false;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };

  return true;
}
