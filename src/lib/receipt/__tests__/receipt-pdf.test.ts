import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { buildReceiptPdf, pdfSafe, type ReceiptData, type ReceiptLabels } from '../receipt-pdf';

const labels: ReceiptLabels = {
  title: 'Reçu',
  order: 'Commande',
  table: 'Table',
  phone: 'Tél.',
  subtotal: 'Sous-total',
  adjustments: 'Taxes et remises',
  tip: 'Pourboire',
  total: 'Total',
  thanks: 'Merci de votre visite !',
};

// Espace fine des milliers, comme formatDisplayPrice.
const money = (n: number) => `${n.toLocaleString('fr-FR').replace(/\s/g, '\u202f')} FCFA`;

const base: ReceiptData = {
  restaurantName: "L'Epicurien",
  address: 'Avenue Charles de Gaulle, Ouagadougou',
  phone: '+226 70 00 00 00',
  orderNumber: 'CMD-20261117-026',
  dateTime: '17/11/2026 21:14',
  table: '12',
  lines: [
    { name: 'Samoussas de boeuf', quantity: 2, unitPrice: 4000 },
    { name: 'Bissap maison', quantity: 1, unitPrice: 1500 },
  ],
  subtotal: 9500,
  total: 9500,
  tip: 500,
};

/** Texte du PDF non compresse: les chaines dessinees y apparaissent telles quelles. */
const text = (data: ReceiptData) => buildReceiptPdf(jsPDF, data, labels, money).output();

describe('ticket de caisse du client', () => {
  it('est une bande de 80 mm, plus haute que large', () => {
    const doc = buildReceiptPdf(jsPDF, base, labels, money);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    expect(Math.round(w)).toBe(80);
    expect(h).toBeGreaterThan(w);
  });

  it('porte le restaurant, la commande, chaque ligne et le total pourboire compris', () => {
    const out = text(base);
    for (const s of [
      "L'Epicurien",
      'CMD-20261117-026',
      'Table 12',
      'Samoussas de boeuf',
      '2 x 4 000 FCFA',
      '8 000 FCFA',
      'Pourboire',
      'TOTAL',
      '10 000 FCFA',
      'Merci de votre visite !',
    ]) {
      expect(out, s).toContain(s);
    }
  });

  it("n'affiche une ligne d'ajustement que si le total differe du sous-total", () => {
    expect(text(base)).not.toContain('Taxes et remises');
    // jsPDF ecrit chaque texte comme "(texte) Tj": on verifie la ligne exacte.
    const withTax = text({ ...base, total: 10450 });
    expect(withTax).toContain('(Taxes et remises) Tj');
    expect(withTax).toContain('(950 FCFA) Tj');
    expect(withTax).toContain('(10 950 FCFA) Tj');
  });

  it('affiche une remise en negatif et un total qui en tient compte', () => {
    const withDiscount = text({ ...base, total: 9000 });
    expect(withDiscount).toContain('(-500 FCFA) Tj');
    expect(withDiscount).toContain('(9 500 FCFA) Tj'); // 9 000 + 500 de pourboire
  });

  it("n'affiche pas de ligne pourboire quand il n'y en a pas", () => {
    expect(text({ ...base, tip: 0 })).not.toContain('Pourboire');
  });

  it('allonge le ticket pour un nom long au lieu de le couper', () => {
    const haut = (name: string) =>
      buildReceiptPdf(
        jsPDF,
        { ...base, lines: [{ name, quantity: 1, unitPrice: 9500 }] },
        labels,
        money,
      ).internal.pageSize.getHeight();
    const long = 'Brochettes d agneau marinees aux epices, legumes grilles et sauce yaourt';
    expect(haut(long)).toBeGreaterThan(haut('Bissap'));
    // Le nom entier est dans le PDF, reparti sur plusieurs lignes, pas tronque.
    const out = text({ ...base, lines: [{ name: long, quantity: 1, unitPrice: 9500 }] });
    expect(out).toContain('Brochettes');
    expect(out).toContain('yaourt');
  });

  it('remplace les espaces fines par des espaces ASCII (police WinAnsi)', () => {
    expect(pdfSafe('8\u202f000\u00a0FCFA')).toBe('8 000 FCFA');
  });
});
