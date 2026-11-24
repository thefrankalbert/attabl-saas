// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, renderHook, act, cleanup } from '@testing-library/react';

// Verification visuelle du lot B2b-2:
// - defaut 6: sans plat importable, l'apercu disait "aucune donnee extraite"
//   juste au-dessus de "3 plat(s) ne seront pas importes";
// - defaut 9: l'avertissement B71 (carte lue en partie) etait un toast qui
//   couvrait l'apercu a 375 px. Il devient un encadre persistant DANS l'apercu.

const toast = vi.fn();
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));

import { MenuImportPDFPreviewStep } from '../MenuImportPDFPreviewStep';
import { useMenuImportPDF } from '../useMenuImportPDF';
import type { PdfExtractedItem, PdfNotImportedItem } from '../menu-import-pdf.types';

const refused = [
  { name: 'Yassa', price: 'abc', reason: 'illisible' },
] as unknown as PdfNotImportedItem[];
const item = { category: 'Plats', name: 'Riz gras', price: 2500 } as unknown as PdfExtractedItem;

afterEach(() => {
  cleanup();
  toast.mockClear();
  vi.unstubAllGlobals();
});

function preview(
  extracted: PdfExtractedItem[],
  notImported: PdfNotImportedItem[],
  truncated = false,
) {
  render(
    <MenuImportPDFPreviewStep
      extractedItems={extracted}
      notImported={notImported}
      truncated={truncated}
      removeItem={vi.fn()}
      handleImport={vi.fn()}
      handleBackToUpload={vi.fn()}
    />,
  );
}

describe('apercu PDF: aucun plat importable', () => {
  it('plats lus mais tous refuses: le dit, sans "aucune donnee extraite"', () => {
    preview([], refused);
    expect(screen.getByText('pdfAllRefused')).toBeInTheDocument();
    expect(screen.queryByText('pdfNoData')).not.toBeInTheDocument();
    // Pas de "0 plat(s) extrait(s)" au-dessus de "nous avons lu les plats".
    expect(screen.queryByText('pdfExtracted')).not.toBeInTheDocument();
  });

  it('temoin: rien lu du tout: "aucune donnee extraite"', () => {
    preview([], []);
    expect(screen.getByText('pdfNoData')).toBeInTheDocument();
    expect(screen.queryByText('pdfAllRefused')).not.toBeInTheDocument();
  });
});

describe('apercu PDF: carte lue en partie (B71)', () => {
  it('encadre persistant dans l apercu', () => {
    preview([item], [], true);
    expect(screen.getByRole('status')).toHaveTextContent('pdfTruncatedWarning');
  });

  it('temoin: carte lue en entier, pas d encadre', () => {
    preview([item], [], false);
    expect(screen.queryByText('pdfTruncatedWarning')).not.toBeInTheDocument();
  });

  it('le hook garde l etat "tronque" et n ouvre plus de toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ items: [item], notImported: [], truncated: true }),
      })),
    );
    const { result } = renderHook(() =>
      useMenuImportPDF({
        menus: [{ id: 'm1' }] as unknown as Parameters<typeof useMenuImportPDF>[0]['menus'],
        onImportComplete: vi.fn(),
      }),
    );
    act(() => {
      result.current.handleFileSelect(new File(['x'], 'carte.pdf', { type: 'application/pdf' }));
    });
    await act(async () => {
      await result.current.handleExtract();
    });
    expect(result.current.step).toBe('preview');
    expect(result.current.truncated).toBe(true);
    expect(toast).not.toHaveBeenCalledWith({ title: 'pdfTruncatedWarning' });
  });
});
