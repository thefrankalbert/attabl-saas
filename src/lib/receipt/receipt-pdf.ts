import type { jsPDF as JsPDF } from 'jspdf';

/**
 * Recu client au format TICKET DE CAISSE (bande de 80 mm, police a chasse fixe),
 * comme en supermarche. Avant (2026-11-17): une page A4 generique, que le
 * proprietaire ne reconnaissait pas comme un vrai recu.
 *
 * Deux passes: la premiere mesure la hauteur (noms longs repartis sur plusieurs
 * lignes), la seconde dessine sur une page de cette hauteur exacte, sans blanc.
 */

export interface ReceiptLine {
  name: string;
  quantity: number;
  /** Prix unitaire, unite majeure de la devise. */
  unitPrice: number;
}

export interface ReceiptData {
  restaurantName: string;
  address?: string | null;
  phone?: string | null;
  orderNumber: string;
  /** Date et heure deja formatees dans la langue du client. */
  dateTime: string;
  table?: string | null;
  lines: ReceiptLine[];
  subtotal: number;
  /** Total de la commande hors pourboire (taxes, frais, remises compris). */
  total: number;
  tip: number;
}

export interface ReceiptLabels {
  title: string;
  order: string;
  table: string;
  phone: string;
  subtotal: string;
  adjustments: string;
  tip: string;
  total: string;
  thanks: string;
}

type JsPDFCtor = new (options: {
  unit: 'mm';
  format: [number, number];
  orientation: 'portrait';
}) => JsPDF;

const WIDTH = 80;
const MARGIN = 5;
const LEFT = MARGIN;
const RIGHT = WIDTH - MARGIN;
const CENTER = WIDTH / 2;
const CONTENT = WIDTH - 2 * MARGIN;
const FONT = 'courier';
const LINE = 4; // interligne du corps (mm)

/**
 * Les polices integrees de jsPDF sont en WinAnsi: l'espace fine (U+2009,
 * U+202F) des milliers sortait en glyphe manquant. Espace ASCII a la place.
 */
export function pdfSafe(text: string): string {
  return text.replace(/[\u2009\u202f\u00a0]/g, ' ');
}

function draw(
  doc: JsPDF,
  data: ReceiptData,
  labels: ReceiptLabels,
  money: (n: number) => string,
): number {
  let y = 9;
  const center = (text: string, size: number, bold = false) => {
    doc.setFont(FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    for (const part of doc.splitTextToSize(pdfSafe(text), CONTENT) as string[]) {
      doc.text(part, CENTER, y, { align: 'center' });
      y += size * 0.45;
    }
  };
  const dashes = () => {
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.setLineWidth(0.2);
    doc.line(LEFT, y, RIGHT, y);
    doc.setLineDashPattern([], 0);
    y += LINE;
  };
  const row = (left: string, right: string, size = 8.5, bold = false) => {
    doc.setFont(FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(pdfSafe(left), LEFT, y);
    doc.text(pdfSafe(right), RIGHT, y, { align: 'right' });
    y += size * 0.47;
  };

  center(data.restaurantName, 12, true);
  y += 0.5;
  if (data.address) center(data.address, 8);
  if (data.phone) center(`${labels.phone} ${data.phone}`, 8);
  y += 1.5;
  dashes();

  center(labels.title.toUpperCase(), 10, true);
  y += 0.5;
  center(`${labels.order} ${data.orderNumber}`, 8.5);
  center(data.dateTime, 8.5);
  if (data.table) center(`${labels.table} ${data.table}`, 8.5);
  y += 1;
  dashes();

  for (const line of data.lines) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8.5);
    for (const part of doc.splitTextToSize(pdfSafe(line.name), CONTENT) as string[]) {
      doc.text(part, LEFT, y);
      y += LINE;
    }
    row(`  ${line.quantity} x ${money(line.unitPrice)}`, money(line.quantity * line.unitPrice));
    y += 1;
  }
  dashes();

  row(labels.subtotal, money(data.subtotal));
  // Taxes, frais de service ou remise: l'ecart rend les lignes additionnables.
  const adjustment = data.total - data.subtotal;
  if (Math.abs(adjustment) >= 0.005) row(labels.adjustments, money(adjustment));
  if (data.tip > 0) row(labels.tip, money(data.tip));
  y += 1;
  doc.setLineWidth(0.4);
  doc.line(LEFT, y - 2.5, RIGHT, y - 2.5);
  row(labels.total.toUpperCase(), money(data.total + data.tip), 11, true);
  doc.line(LEFT, y - 1.5, RIGHT, y - 1.5);
  y += 4;

  center(labels.thanks, 9, true);
  return y + 4;
}

/** Construit le ticket. `JsPDF` est passe par l'appelant (import dynamique). */
export function buildReceiptPdf(
  JsPDF: JsPDFCtor,
  data: ReceiptData,
  labels: ReceiptLabels,
  money: (n: number) => string,
): JsPDF {
  const probe = new JsPDF({ unit: 'mm', format: [WIDTH, 2000], orientation: 'portrait' });
  // Au moins 90 mm: plus court que large, jsPDF basculerait la page en paysage.
  const height = Math.max(90, Math.ceil(draw(probe, data, labels, money)));
  const doc = new JsPDF({ unit: 'mm', format: [WIDTH, height], orientation: 'portrait' });
  draw(doc, data, labels, money);
  return doc;
}
