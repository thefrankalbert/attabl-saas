// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import POSUnpaidPanel from '../POSUnpaidPanel';
import { POSTablePickerDialog } from '../POSTablePickerDialog';
import type { Zone, Table } from '@/types/admin.types';

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
