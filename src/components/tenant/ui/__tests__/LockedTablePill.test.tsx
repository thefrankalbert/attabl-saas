// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LockedTablePill } from '../LockedTablePill';

const baseLabels = {
  lockedLabel: 'Table verrouillee',
  noTableLabel: 'Aucune table detectee',
  rescanLabel: 'Scanner un autre QR',
};

describe('LockedTablePill', () => {
  it('renders the locked label and table number when a table is set', () => {
    render(<LockedTablePill tableNumber="T5" {...baseLabels} />);
    expect(screen.getByText('Table verrouillee - T5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: baseLabels.rescanLabel })).toBeNull();
  });

  it('trims surrounding whitespace from the table number', () => {
    render(<LockedTablePill tableNumber="  T9  " {...baseLabels} />);
    expect(screen.getByText('Table verrouillee - T9')).toBeInTheDocument();
  });

  it('renders the empty state and a rescan CTA when no table is set', () => {
    const onRescan = vi.fn();
    render(<LockedTablePill tableNumber={null} {...baseLabels} onRescan={onRescan} />);
    expect(screen.getByText('Aucune table detectee')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Scanner un autre QR' });
    fireEvent.click(btn);
    expect(onRescan).toHaveBeenCalledOnce();
  });

  it('omits the rescan CTA when no onRescan callback is provided', () => {
    render(<LockedTablePill tableNumber="" {...baseLabels} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
