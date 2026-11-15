// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaymentMethodsSettings } from '../PaymentMethodsSettings';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/app/actions/payment-methods', () => ({ actionUpdatePaymentMethods: vi.fn() }));

describe('PaymentMethodsSettings', () => {
  beforeEach(() => toastError.mockReset());

  it('does not submit the surrounding settings form when saved', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PaymentMethodsSettings initialMethods={['cash', 'card']} />
      </form>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'savePaymentMethods' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('explains why the last payment method cannot be turned off', () => {
    render(<PaymentMethodsSettings initialMethods={['cash']} />);

    const cash = screen.getByRole('switch', { name: 'paymentMethod.cash.label' });
    fireEvent.click(cash);

    expect(toastError).toHaveBeenCalledWith('paymentMethodsAtLeastOne');
    expect(cash).toHaveAttribute('data-state', 'checked');
  });
});
