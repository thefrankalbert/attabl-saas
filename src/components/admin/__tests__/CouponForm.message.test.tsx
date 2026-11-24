// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Verification visuelle du lot B2b-2 (defaut 5): enregistrer un coupon
// EXISTANT affichait "Coupon cree avec succes". La modification doit dire
// qu'elle a modifie, la creation qu'elle a cree.

const toast = vi.fn();
const create = vi.fn(async () => ({ success: true }));
const update = vi.fn(async () => ({ success: true }));
vi.mock('@/app/actions/coupons', () => ({
  actionCreateCoupon: (...a: unknown[]) => create(...(a as [])),
  actionUpdateCoupon: (...a: unknown[]) => update(...(a as [])),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'fr-FR' }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/components/admin/AdminModal', () => ({
  default: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div>{children}</div> : null,
}));

import CouponForm from '../CouponForm';
import type { Coupon } from '@/types/admin.types';

const existing = {
  id: 'c1',
  tenant_id: 't1',
  code: 'NOEL',
  discount_type: 'fixed',
  discount_value: 500,
  min_order_amount: 0,
  max_discount_amount: null,
  valid_from: null,
  valid_until: null,
  max_uses: null,
  current_uses: 0,
  is_active: true,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
} as unknown as Coupon;

afterEach(() => {
  toast.mockClear();
  create.mockClear();
  update.mockClear();
});

function submit(buttonName: string) {
  fireEvent.submit(
    screen.getByRole('button', { name: buttonName }).closest('form') as HTMLFormElement,
  );
}

describe('CouponForm: message de succes', () => {
  it('modification: "couponUpdated", jamais "couponCreated"', async () => {
    render(
      <CouponForm
        tenantId="t1"
        isOpen
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        currency="XOF"
        timeZone="Africa/Ouagadougou"
        initialData={existing}
      />,
    );
    submit('save');
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'couponUpdated' }));
    expect(toast).not.toHaveBeenCalledWith({ title: 'couponCreated' });
  });

  it('temoin: creation: "couponCreated"', async () => {
    render(
      <CouponForm
        tenantId="t1"
        isOpen
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        currency="XOF"
        timeZone="Africa/Ouagadougou"
        initialData={null}
      />,
    );
    fireEvent.change(screen.getByLabelText('codeField'), { target: { value: 'NOEL' } });
    fireEvent.change(screen.getByLabelText('discountValue'), { target: { value: '15' } });
    submit('createCoupon');
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'couponCreated' }));
  });
});
