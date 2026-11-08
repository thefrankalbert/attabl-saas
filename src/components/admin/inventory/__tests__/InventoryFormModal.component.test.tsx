// @vitest-environment happy-dom
/**
 * The unit of an ingredient is freely editable, and NOTHING converts the numbers
 * behind it: current_stock and every recipe line are bare numbers in that unit.
 * Switching "Riz" from kg to g turns 60 kg of stock into 60 g and 0.2 kg per
 * portion into 0.2 g, silently. These tests pin down WHEN the warning shows:
 * only while editing, only once the unit actually differs.
 */
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { IngredientUnit } from '@/types/inventory.types';

// Interpolating stub: `key => key` would hide a missing {from}/{to} placeholder,
// which is an IntlError at runtime. Here the values must really come through.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')}`
      : key,
}));

vi.mock('@/components/admin/AdminModal', () => ({
  default: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div>{children}</div> : null,
}));

import InventoryFormModal, {
  type ModalMode,
} from '@/components/admin/inventory/InventoryFormModal';

const WARNING = 'unitChangeWarning';

function renderModal(opts: {
  mode: ModalMode;
  formUnit: IngredientUnit;
  originalUnit?: IngredientUnit;
}) {
  return render(
    <InventoryFormModal
      isOpen
      mode={opts.mode}
      onClose={vi.fn()}
      formName="Riz"
      setFormName={vi.fn()}
      formUnit={opts.formUnit}
      setFormUnit={vi.fn()}
      formStock="0"
      setFormStock={vi.fn()}
      formMinAlert="0"
      setFormMinAlert={vi.fn()}
      formCostPerUnit="0"
      setFormCostPerUnit={vi.fn()}
      formCategory=""
      setFormCategory={vi.fn()}
      formPurchaseUnit=""
      setFormPurchaseUnit={vi.fn()}
      formUnitsPerPurchase="1"
      setFormUnitsPerPurchase={vi.fn()}
      confirmDeactivate={false}
      setConfirmDeactivate={vi.fn()}
      isSubmitting={false}
      handleSave={vi.fn()}
      handleDeactivate={vi.fn()}
      originalUnit={opts.originalUnit}
    />,
  );
}

describe('InventoryFormModal - unit change warning', () => {
  it('warns when editing and the unit now differs from the stored one', () => {
    renderModal({ mode: 'edit', formUnit: 'g', originalUnit: 'kg' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(WARNING);
    // Both units must reach the message: a dropped placeholder would leave the
    // owner reading a sentence that never says what changes into what.
    expect(alert).toHaveTextContent('from=kg');
    expect(alert).toHaveTextContent('to=g');
  });

  it('blocks saving until the owner acknowledges the unit change', () => {
    renderModal({ mode: 'edit', formUnit: 'g', originalUnit: 'kg' });
    const save = screen.getByRole('button', { name: /save/i });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(save).toBeEnabled();
  });

  it('leaves saving available when the unit is untouched', () => {
    renderModal({ mode: 'edit', formUnit: 'kg', originalUnit: 'kg' });
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
  });

  it('stays quiet while the unit is unchanged', () => {
    renderModal({ mode: 'edit', formUnit: 'kg', originalUnit: 'kg' });
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });

  it('stays quiet when creating an ingredient (nothing to reinterpret yet)', () => {
    renderModal({ mode: 'add', formUnit: 'g', originalUnit: 'kg' });
    expect(screen.queryByText(WARNING)).not.toBeInTheDocument();
  });
});
