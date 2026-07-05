import type { Order, Tenant } from '@/types/admin.types';
import { generateReceiptHTML } from './receipt-html';

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
