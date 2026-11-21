// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import POSUnpaidPanel from '../POSUnpaidPanel';
import { POSTablePickerDialog } from '../POSTablePickerDialog';
import type { Order, Zone, Table } from '@/types/admin.types';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/components/admin/skeletons/ListRowsSkeleton', () => ({
  ListRowsSkeleton: () => null,
}));

describe('POSUnpaidPanel a11y', () => {
  afterEach(cleanup);

  it('est nomme par son titre et se ferme avec Echap', () => {
    const onClose = vi.fn();
    render(
      <POSUnpaidPanel
        open
        onClose={onClose}
        orders={[]}
        loading={false}
        currency="XOF"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'toSettle' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// Audit pourboires du 2026-11-20: la liste affichait le total seul (5 000)
// alors que l'ecran d'encaissement reclame total + pourboire du client (5 500).
describe('POSUnpaidPanel montant', () => {
  afterEach(cleanup);

  it('affiche ce que l encaissement reclamera: total + pourboire du client', () => {
    const order = {
      id: 'o1',
      order_number: 'CMD-1',
      table_number: null,
      total_price: 5000,
      tip_amount: 500,
      items: [],
    } as unknown as Order;
    render(
      <POSUnpaidPanel
        open
        onClose={() => {}}
        orders={[order]}
        loading={false}
        currency="XOF"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(/5\D?500/);
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/5\D?000/);
  });
});

describe('POSTablePickerDialog a11y', () => {
  afterEach(cleanup);

  it('expose aria-pressed sur la zone et la table choisies', () => {
    const zones = [{ id: 'z1', name: 'Terrasse' }] as Zone[];
    const tables = [
      { id: 't1', table_number: 'T1', display_name: 'T1' },
      { id: 't2', table_number: 'T2', display_name: 'T2' },
    ] as Table[];
    render(
      <POSTablePickerDialog
        open
        onOpenChange={() => {}}
        zones={zones}
        pickerZoneId="z1"
        onPickZone={() => {}}
        pickerTables={tables}
        selectedTable="T2"
        onSelectTable={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Terrasse' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'T2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'T1' })).toHaveAttribute('aria-pressed', 'false');
  });
});
