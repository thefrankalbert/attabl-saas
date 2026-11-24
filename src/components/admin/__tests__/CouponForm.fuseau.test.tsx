// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// B35, contre-audit 1 (defaut 2): le formulaire relisait les bornes dans le
// fuseau de l'APPAREIL. La fin "31/12" d'un restaurant burkinabe (UTC+0)
// s'affichait "01/01" a Douala (UTC+1), et chaque sauvegarde sans rien changer
// allongeait le coupon d'un jour. Ici: ouvrir puis sauvegarder ne change
// aucune date, que l'appareil soit a UTC+1 ou a UTC-5.

const update = vi.fn(async () => ({ success: true }));
vi.mock('@/app/actions/coupons', () => ({
  actionCreateCoupon: vi.fn(),
  actionUpdateCoupon: (...a: unknown[]) => update(...(a as [])),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k, useLocale: () => 'fr' }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/admin/AdminModal', () => ({
  default: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div>{children}</div> : null,
}));

import CouponForm from '../CouponForm';
import { zonedDayBounds } from '@/lib/timezones';
import type { Coupon } from '@/types/admin.types';

function coupon(restaurantTz: string): Coupon {
  return {
    id: 'c1',
    tenant_id: 't1',
    code: 'NOEL',
    discount_type: 'fixed',
    discount_value: 500,
    min_order_amount: 0,
    max_discount_amount: null,
    // Bornes telles que le serveur les enregistre pour un restaurant burkinabe.
    valid_from: zonedDayBounds('2026-12-01', restaurantTz)!.start,
    valid_until: zonedDayBounds('2026-12-31', restaurantTz)!.end,
    max_uses: null,
    current_uses: 0,
    is_active: true,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  } as unknown as Coupon;
}

const tzAvant = process.env.TZ;
afterEach(() => {
  process.env.TZ = tzAvant;
  update.mockClear();
});

describe.each([
  ['Africa/Douala (UTC+1)', 'Africa/Douala'],
  ['America/Bogota (UTC-5)', 'America/Bogota'],
])('CouponForm sur un appareil a %s', (_label, deviceTz) => {
  it.each([
    ['restaurant burkinabe (UTC+0)', 'Africa/Ouagadougou'],
    ['restaurant camerounais (UTC+1)', 'Africa/Douala'],
  ])(
    '%s: ouvrir puis sauvegarder sans rien changer renvoie les memes jours',
    async (_r, restaurantTz) => {
      process.env.TZ = deviceTz;
      render(
        <CouponForm
          tenantId="t1"
          isOpen
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          currency="XOF"
          timeZone={restaurantTz}
          initialData={coupon(restaurantTz)}
        />,
      );
      fireEvent.submit(
        screen.getByRole('button', { name: 'save' }).closest('form') as HTMLFormElement,
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      const payload = (update.mock.calls[0] as unknown[])[2] as {
        valid_from: string;
        valid_until: string;
      };
      expect(payload.valid_from).toBe('2026-12-01');
      expect(payload.valid_until).toBe('2026-12-31');
    },
  );
});
