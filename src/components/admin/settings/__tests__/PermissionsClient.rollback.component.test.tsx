// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PermissionsClient } from '../PermissionsClient';

// Decision du proprietaire: ses reglages de permissions prennent effet a
// l'ecran ET sur le serveur. Un enregistrement refuse laissait l'interrupteur
// bascule a l'ecran alors que rien n'etait en vigueur.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function toggleWaiterPos() {
  render(<PermissionsClient tenantId="t1" initialOverrides={{}} />);
  const sw = screen.getByLabelText('perm.pos_use - role.waiter');
  expect(sw).toHaveAttribute('data-state', 'checked');
  fireEvent.click(sw);
  expect(sw).toHaveAttribute('data-state', 'unchecked');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  return sw;
}

describe('Editeur de permissions: l ecran suit le serveur', () => {
  it('enregistrement refuse: l interrupteur revient a l etat en vigueur', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Trop de requetes' }) });
    const sw = await toggleWaiterPos();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/permissions',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(sw).toHaveAttribute('data-state', 'checked');
  });

  it('enregistrement accepte: l interrupteur garde le nouvel etat', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    const sw = await toggleWaiterPos();
    expect(sw).toHaveAttribute('data-state', 'unchecked');
  });

  it('echec sous une modification plus recente: l ecran garde ce que le serveur recevra', async () => {
    // Enregistrement 1 en vol, puis une 2e bascule. L'echec du 1er ne doit pas
    // effacer la 2e de l'ecran: son enregistrement (qui porte les deux) part
    // quand meme et peut reussir.
    let failFirst: (v: unknown) => void = () => {};
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            failFirst = resolve;
          }),
      )
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    const pos = await toggleWaiterPos();
    const view = screen.getByLabelText('perm.orders_view - role.waiter');
    fireEvent.click(view);
    expect(view).toHaveAttribute('data-state', 'unchecked');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    await act(async () => {
      failFirst({ ok: false, json: async () => ({ error: 'Trop de requetes' }) });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const lastBody = JSON.parse(String(fetchMock.mock.calls[1][1].body)) as {
      permissions: Record<string, boolean>;
    };
    expect(lastBody.permissions).toEqual({ 'pos.use': false, 'orders.view': false });
    expect(view).toHaveAttribute('data-state', 'unchecked');
    expect(pos).toHaveAttribute('data-state', 'unchecked');
  });

  it('restaurer les defauts annule une bascule encore en attente', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(<PermissionsClient tenantId="t1" initialOverrides={{}} />);
    const sw = screen.getByLabelText('perm.pos_use - role.waiter');
    fireEvent.click(sw);
    fireEvent.click(screen.getByRole('button', { name: 'reset' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    const methods = fetchMock.mock.calls.map((c) => (c[1] as { method: string }).method);
    expect(methods).toEqual(['DELETE']);
    expect(sw).toHaveAttribute('data-state', 'checked');
  });
});
