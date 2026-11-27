// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const written: string[] = [];
const tableCells: string[] = [];

vi.mock('jspdf', () => ({
  jsPDF: class {
    lastAutoTable = { finalY: 10 };
    internal = { pageSize: { getHeight: () => 297 } };
    setFont() {}
    setTextColor() {}
    setFontSize() {}
    setDrawColor() {}
    setLineWidth() {}
    setPage() {}
    line() {}
    getNumberOfPages() {
      return 1;
    }
    text(value: string) {
      written.push(String(value));
    }
    save() {}
  },
}));
vi.mock('jspdf-autotable', () => ({
  default: (_doc: unknown, opts: { head: string[][]; body: string[][] }) => {
    tableCells.push(...opts.head.flat(), ...opts.body.flat());
  },
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { useReportExports } from '../useReportExports';

// Meme espace que Intl.NumberFormat fr: U+202F entre les milliers, U+00A0 avant la devise.
const fmt = (n: number) => `${n.toLocaleString('en-US').replace(/,/g, ' ')} FCFA`;

const args = {
  currency: 'XOF' as const,
  fmt,
  periodDisplayLabel: 'semaine',
  summary: { revenue: 14543000, orders: 629, avgBasket: 23121, tips: 0 },
  topItems: [{ id: 'i-1', name: 'Champagne', quantity: 10, revenue: 450000 }],
  dailyStats: [],
  categories: [{ category: 'Boissons', revenue: 1735000, percentage: 12 }],
};

describe('useReportExports - export PDF', () => {
  beforeEach(() => {
    written.length = 0;
    tableCells.length = 0;
  });

  it("n'ecrit ni U+202F ni U+00A0 dans le PDF et garde les montants lisibles", async () => {
    const { result } = renderHook(() => useReportExports(args));
    await act(async () => {
      await result.current.handleExportPDF();
    });
    const all = [...written, ...tableCells];
    expect(all).toContain('14 543 000 FCFA');
    expect(all).toContain('450 000 FCFA');
    expect(all).toContain('1 735 000 FCFA');
    for (const s of all) {
      expect(s).not.toMatch(/[  ]/);
    }
  });

  it('temoin: le formateur de l ecran contient bien les espaces insecables', () => {
    expect(fmt(14543000)).toMatch(/[  ]/);
  });
});
