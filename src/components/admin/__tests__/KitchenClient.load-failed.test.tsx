// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

// Verification visuelle du lot B2b-2 (point A): quand le chargement des
// commandes echouait, l'ecran cuisine affichait le bandeau "non synchronise"
// ET "Aucune commande active". Si aucune commande n'a JAMAIS ete lue, la liste
// vide ne veut rien dire: un cuisinier croirait n'avoir rien a preparer.

let kitchenState: Record<string, unknown> = {};
vi.mock('@/hooks/useKitchenData', () => ({ useKitchenData: () => kitchenState }));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) => `${ns}.${k}`,
}));
vi.mock('@/hooks/useContextualShortcuts', () => ({ useContextualShortcuts: () => undefined }));
vi.mock('@/components/features/kitchen/KitchenFilters', () => ({ default: () => null }));
vi.mock('@/components/features/kitchen/FooterSummaryBar', () => ({ default: () => null }));
vi.mock('@/components/features/kitchen/KitchenBoard', () => ({
  default: ({ orders }: { orders: unknown[] }) => (
    <p>{orders.length === 0 ? 'kitchen.emptyActive' : `${orders.length} commandes`}</p>
  ),
}));

import KitchenClient from '../KitchenClient';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';

function renderKitchen() {
  return render(
    <PermissionsProvider postes={['chef']} levels={getEffectiveLevels({ postes: ['chef'] })}>
      <KitchenClient tenantId="t1" />
    </PermissionsProvider>,
  );
}

function state(over: Record<string, unknown>) {
  kitchenState = {
    loading: false,
    stale: false,
    hasLoaded: true,
    lastUpdate: new Date('2026-11-24T05:38:00'),
    allOrders: [],
    completedOrders: [],
    pendingOrders: [],
    preparingOrders: [],
    totalActive: 0,
    completedToday: 0,
    showMockData: false,
    isFullscreen: false,
    loadOrders: vi.fn(),
    goBack: vi.fn(),
    toggleFullscreen: vi.fn(),
    handleStatusChange: vi.fn(),
    updateItemStatus: vi.fn(),
    markAllItemsReady: vi.fn(),
    setCourseHeld: vi.fn(),
    ...over,
  };
}

afterEach(() => cleanup());

describe('ecran cuisine: chargement des commandes impossible', () => {
  it('jamais charge: etat d erreur distinct, jamais "Aucune commande active"', () => {
    state({ stale: true, hasLoaded: false });
    renderKitchen();
    expect(screen.getByRole('alert')).toHaveTextContent('kitchen.loadFailedTitle');
    expect(screen.queryByText('kitchen.emptyActive')).not.toBeInTheDocument();
  });

  it('deja charge puis desynchronise: garde les dernieres commandes connues et le bandeau', () => {
    const order = { id: 'o1', status: 'pending', created_at: '2026-11-24T05:00:00Z' };
    state({ stale: true, hasLoaded: true, allOrders: [order] });
    renderKitchen();
    expect(screen.getByText('1 commandes')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('kitchen.staleScreen');
    expect(screen.queryByText('kitchen.loadFailedTitle')).not.toBeInTheDocument();
  });

  it('Reessayer: le bouton se desactive pendant l essai, puis revient', async () => {
    let finish: () => void = () => {};
    const loadOrders = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    state({ stale: true, hasLoaded: false, loadOrders });
    renderKitchen();
    const retry = screen.getByRole('button', { name: 'common.retry' });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(loadOrders).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole('button', { name: 'common.loading' });
    expect(busy).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'common.retry' })).toBeEnabled());
  });

  it('temoin: synchronise et vide: "Aucune commande active"', () => {
    state({});
    renderKitchen();
    expect(screen.getByText('kitchen.emptyActive')).toBeInTheDocument();
  });
});
