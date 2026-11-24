// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Verification visuelle du lot B2b-2 (defaut 8): sur un refus 429 (limite
// d'exports par minute), l'editeur du chevalet disait seulement "Erreur lors de
// l'export PDF". Le restaurateur doit savoir qu'il suffit d'attendre.

const toast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/services/supports.service', () => ({
  createSupportsService: () => ({ saveConfig: vi.fn() }),
}));
vi.mock('../ChevaletControls', () => ({ ChevaletControls: () => null }));
vi.mock('../ChevaletPreview', () => ({ ChevaletPreview: () => null }));

import { ChevaletEditor } from '../ChevaletEditor';

const tenant = {
  id: 't1',
  slug: 'resto',
  name: 'Chez Awa',
  description: null,
  logoUrl: null,
  primaryColor: '#FF8800',
  secondaryColor: '#FFFFFF',
  menuUrl: 'https://resto.attabl.com',
};

afterEach(() => {
  cleanup();
  toast.mockClear();
  vi.unstubAllGlobals();
});

async function exportWith(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ error: 'x' }), { status })),
  );
  render(<ChevaletEditor tenant={tenant} savedConfig={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'exportPdf' }));
  await waitFor(() => expect(toast).toHaveBeenCalled());
}

describe('ChevaletEditor: export PDF refuse', () => {
  it('429: message de limite d exports', async () => {
    await exportWith(429);
    expect(toast).toHaveBeenCalledWith({ title: 'exportRateLimited', variant: 'destructive' });
  });

  it('temoin: autre erreur: message d echec d export', async () => {
    await exportWith(500);
    expect(toast).toHaveBeenCalledWith({ title: 'exportPdfError', variant: 'destructive' });
  });
});
