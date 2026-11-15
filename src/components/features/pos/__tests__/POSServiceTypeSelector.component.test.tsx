// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { POSServiceTypeSelector } from '../POSServiceTypeSelector';

// Test en direct 2026-11-15: un restaurant voyait "Room service" a sa caisse.
// Le bouton n'a de sens que pour un etablissement qui a des chambres.

let establishmentType = 'restaurant';
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ canAccess: () => true }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { establishment_type: establishmentType } }),
}));

function renderSelector() {
  return render(
    <POSServiceTypeSelector
      serviceType="dine_in"
      setServiceType={() => {}}
      selectedTable=""
      roomNumber=""
      setRoomNumber={() => {}}
      deliveryAddress=""
      setDeliveryAddress={() => {}}
      onOpenTablePicker={() => {}}
    />,
  );
}

describe('POSServiceTypeSelector - service en chambre', () => {
  afterEach(cleanup);

  it('un restaurant ne voit pas le service en chambre', () => {
    establishmentType = 'restaurant';
    renderSelector();
    expect(screen.queryByRole('button', { name: 'serviceRoomService' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'serviceDelivery' })).toBeInTheDocument();
  });

  it('un hotel voit le service en chambre', () => {
    establishmentType = 'hotel';
    renderSelector();
    expect(screen.getByRole('button', { name: 'serviceRoomService' })).toBeInTheDocument();
  });

  it('le type de service choisi est annonce comme enfonce', () => {
    establishmentType = 'restaurant';
    renderSelector();
    expect(screen.getByRole('button', { name: 'serviceOnSite' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'serviceTakeaway' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
