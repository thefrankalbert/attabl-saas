// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReassignTableDialog, type ReassignFreeTable } from '../ReassignTableDialog';

const mockReassign = vi.fn();
vi.mock('@/app/actions/table-reassign', () => ({
  actionReassignOrderTable: (orderId: string, table: string) => mockReassign(orderId, table),
}));

// Simplify the shadcn Dialog + Select so the branches are drivable in jsdom.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => (
    <select
      data-testid="table-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

const LABELS = {
  title: 'Move the order',
  description: 'Pick a free table.',
  placeholder: 'Free table',
  noFreeTables: 'No free table right now.',
  confirm: 'Move',
  cancel: 'Cancel',
  moving: 'Moving...',
  success: 'Order moved',
  error: 'Move failed',
};

const FREE: ReassignFreeTable[] = [
  { tableNumber: '5', label: 'Table 5' },
  { tableNumber: '6', label: 'Terrasse 6' },
];

function setup(overrides: Partial<React.ComponentProps<typeof ReassignTableDialog>> = {}) {
  const toast = vi.fn();
  const onReassigned = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ReassignTableDialog
      open
      onOpenChange={onOpenChange}
      orderId="order-1"
      freeTables={FREE}
      onReassigned={onReassigned}
      labels={LABELS}
      toast={toast}
      {...overrides}
    />,
  );
  return { toast, onReassigned, onOpenChange };
}

describe('ReassignTableDialog', () => {
  beforeEach(() => {
    mockReassign.mockReset();
  });

  it('shows the no-free-tables message when there is no destination', () => {
    setup({ freeTables: [] });
    expect(screen.getByText('No free table right now.')).toBeInTheDocument();
    // Confirm stays disabled with nothing to move to.
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('keeps confirm disabled until a table is selected', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('reassigns to the chosen free table on success, then refreshes + closes', async () => {
    mockReassign.mockResolvedValue({ success: true });
    const { toast, onReassigned, onOpenChange } = setup();

    fireEvent.change(screen.getByTestId('table-select'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(mockReassign).toHaveBeenCalledWith('order-1', '6'));
    expect(toast).toHaveBeenCalledWith({ title: 'Order moved' });
    expect(onReassigned).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('surfaces the error and does NOT refresh when the action fails', async () => {
    mockReassign.mockResolvedValue({ success: false, error: 'Table occupied' });
    const { toast, onReassigned } = setup();

    fireEvent.change(screen.getByTestId('table-select'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: 'Move failed',
        description: 'Table occupied',
        variant: 'destructive',
      }),
    );
    expect(onReassigned).not.toHaveBeenCalled();
  });
});
