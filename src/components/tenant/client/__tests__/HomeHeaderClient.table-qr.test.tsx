// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { HomeHeaderClient } from '../HomeHeaderClient';
import { readScannedTable } from '@/hooks/useScannedTable';

// The storefront root page hands the scanned `?table=` to HomeHeaderClient as
// `initialTable`. This locks the client half of that path: the header MUST pass
// it down to useHomeHeader -> useScannedTable, which persists it under the key
// the cart reads at order time. Without it a printed root QR loses its table.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.table ? `${key}:${values.table}` : key,
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/tenant/ItemDetailSheet', () => ({ default: () => null }));
vi.mock('@/components/tenant/client/HomeSearchOverlay', () => ({
  HomeSearchOverlay: () => null,
}));

describe('HomeHeaderClient - table from a root QR', () => {
  beforeEach(() => localStorage.clear());

  it('persists initialTable for the cart and shows it', () => {
    render(<HomeHeaderClient site="resto" tenantName="Resto" initialTable="TER-1" />);

    expect(readScannedTable('resto')).toBe('TER-1');
    expect(screen.getByText(/tableLabel:TER-1/)).toBeInTheDocument();
  });

  it('a root QR replaces a table remembered from an earlier visit', () => {
    localStorage.setItem('attabl_resto_table', 'OLD-9');
    render(<HomeHeaderClient site="resto" tenantName="Resto" initialTable="TER-1" />);
    expect(readScannedTable('resto')).toBe('TER-1');
  });

  it('without a scanned table, keeps the remembered one', () => {
    localStorage.setItem('attabl_resto_table', 'OLD-9');
    render(<HomeHeaderClient site="resto" tenantName="Resto" />);
    expect(localStorage.getItem('attabl_resto_table')).toBe('OLD-9');
  });
});
