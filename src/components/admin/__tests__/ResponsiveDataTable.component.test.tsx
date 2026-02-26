// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResponsiveDataTable } from '../ResponsiveDataTable';
import type { ColumnDef } from '@tanstack/react-table';

// ─── Mocks ──────────────────────────────────────────────

const mockDevice = { isMobile: false, isTablet: false, isDesktop: true };

vi.mock('@/hooks/useDevice', () => ({
  useDevice: () => mockDevice,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// ─── Test Data ──────────────────────────────────────────

interface TestRow {
  id: string;
  name: string;
  price: number;
}

const testData: TestRow[] = [
  { id: '1', name: 'Pizza', price: 12 },
  { id: '2', name: 'Pasta', price: 10 },
  { id: '3', name: 'Salad', price: 8 },
];

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'price', header: 'Price' },
];

const renderCard = (row: TestRow) => (
  <div data-testid={`card-${row.id}`}>
    <span>{row.name}</span>
    <span>{row.price}€</span>
  </div>
);

// ─── Tests ──────────────────────────────────────────────

describe('ResponsiveDataTable', () => {
  beforeEach(() => {
    mockDevice.isMobile = false;
    mockDevice.isDesktop = true;
  });

  it('renders desktop DataTable by default', () => {
    render(<ResponsiveDataTable columns={columns} data={testData} />);

    // DataTable renders a table element
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('renders mobile cards when isMobile and mobileConfig provided', () => {
    mockDevice.isMobile = true;
    mockDevice.isDesktop = false;

    render(<ResponsiveDataTable columns={columns} data={testData} mobileConfig={{ renderCard }} />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-1')).toBeInTheDocument();
    expect(screen.getByTestId('card-2')).toBeInTheDocument();
    expect(screen.getByTestId('card-3')).toBeInTheDocument();
  });

  it('shows loading skeletons on mobile', () => {
    mockDevice.isMobile = true;
    mockDevice.isDesktop = false;

    const { container } = render(
      <ResponsiveDataTable
        columns={columns}
        data={[]}
        isLoading={true}
        mobileConfig={{ renderCard }}
      />,
    );

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(4);
  });

  it('shows empty message on mobile when no data', () => {
    mockDevice.isMobile = true;
    mockDevice.isDesktop = false;

    render(
      <ResponsiveDataTable
        columns={columns}
        data={[]}
        emptyMessage="No items found"
        mobileConfig={{ renderCard }}
      />,
    );

    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('calls onRowClick on mobile card click', () => {
    mockDevice.isMobile = true;
    mockDevice.isDesktop = false;
    const onClick = vi.fn();

    render(
      <ResponsiveDataTable
        columns={columns}
        data={testData}
        onRowClick={onClick}
        mobileConfig={{ renderCard }}
      />,
    );

    fireEvent.click(screen.getByTestId('card-1'));
    expect(onClick).toHaveBeenCalledWith(testData[0]);
  });

  it('falls back to DataTable on mobile without mobileConfig', () => {
    mockDevice.isMobile = true;
    mockDevice.isDesktop = false;

    render(<ResponsiveDataTable columns={columns} data={testData} />);

    // Without mobileConfig, even on mobile it renders the table
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
