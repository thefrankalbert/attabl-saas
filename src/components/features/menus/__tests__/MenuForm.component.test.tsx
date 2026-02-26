// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MenuForm from '../MenuForm';

// ─── Mocks ──────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// ─── Test Data ──────────────────────────────────────────

const mockOnSubmit = vi.fn().mockResolvedValue(undefined);
const mockOnCancel = vi.fn();

const defaultProps = {
  editingMenu: null,
  menus: [],
  venues: [],
  onSubmit: mockOnSubmit,
  onCancel: mockOnCancel,
};

// ─── Tests ──────────────────────────────────────────────

describe('MenuForm', () => {
  beforeEach(() => {
    mockOnSubmit.mockClear();
    mockOnCancel.mockClear();
  });

  it('renders all form fields', () => {
    render(<MenuForm {...defaultProps} />);

    expect(screen.getByLabelText('nameFr')).toBeInTheDocument();
    expect(screen.getByLabelText('nameEn')).toBeInTheDocument();
  });

  it('renders create button when no editingMenu', () => {
    render(<MenuForm {...defaultProps} />);

    expect(screen.getByText('create')).toBeInTheDocument();
  });

  it('renders update button when editing', () => {
    render(
      <MenuForm
        {...defaultProps}
        editingMenu={{
          id: 'menu-1',
          name: 'Lunch Menu',
          name_en: 'Lunch Menu EN',
          description: 'Desc',
          description_en: 'Desc EN',
          venue_id: null,
          parent_menu_id: null,
          is_active: true,
          display_order: 0,
          slug: 'lunch-menu',
          tenant_id: 'tenant-1',
          created_at: new Date().toISOString(),
        }}
      />,
    );

    expect(screen.getByText('update')).toBeInTheDocument();
  });

  it('prefills form values when editing', () => {
    render(
      <MenuForm
        {...defaultProps}
        editingMenu={{
          id: 'menu-1',
          name: 'Carte Déjeuner',
          name_en: 'Lunch Card',
          description: 'Description FR',
          description_en: 'Description EN',
          venue_id: null,
          parent_menu_id: null,
          is_active: true,
          display_order: 0,
          slug: 'carte-dejeuner',
          tenant_id: 'tenant-1',
          created_at: new Date().toISOString(),
        }}
      />,
    );

    expect(screen.getByDisplayValue('Carte Déjeuner')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Lunch Card')).toBeInTheDocument();
  });

  it('does not submit when name is empty', async () => {
    render(<MenuForm {...defaultProps} />);

    fireEvent.click(screen.getByText('create'));

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('submits form data when valid', async () => {
    const user = userEvent.setup();
    render(<MenuForm {...defaultProps} />);

    const nameInput = screen.getByLabelText('nameFr');
    await user.type(nameInput, 'Nouveau Menu');

    fireEvent.click(screen.getByText('create'));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nouveau Menu' }));
    });
  });

  it('calls onCancel when cancel button clicked', () => {
    render(<MenuForm {...defaultProps} />);

    fireEvent.click(screen.getByText('cancel'));

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('disables submit button while saving', async () => {
    mockOnSubmit.mockImplementation(() => new Promise(() => {})); // never resolves
    const user = userEvent.setup();

    render(<MenuForm {...defaultProps} />);

    const nameInput = screen.getByLabelText('nameFr');
    await user.type(nameInput, 'Test Menu');

    fireEvent.click(screen.getByText('create'));

    await waitFor(() => {
      const button = screen.getByText('create').closest('button');
      expect(button).toBeDisabled();
    });
  });
});
