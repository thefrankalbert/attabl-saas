// @vitest-environment happy-dom
/**
 * Menu "+/-" d'un produit: le type "Stock d'ouverture" doit REMPLACER le stock
 * (10 puis ouverture 5 = 5), pas s'y ajouter (10 puis 5 donnait 15). Il passe donc
 * par actionSetOpeningStock; les autres types gardent actionAdjustStock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Ingredient } from '@/types/inventory.types';

const { mockAdjust, mockSetOpening, mockReceive, mockLoss, mockCreate, mockUpdate, mockToast } =
  vi.hoisted(() => ({
    mockAdjust: vi.fn(),
    mockSetOpening: vi.fn(),
    mockReceive: vi.fn(),
    mockLoss: vi.fn(),
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
    mockToast: vi.fn(),
  }));

vi.mock('@/app/actions/inventory', () => ({
  actionAdjustStock: mockAdjust,
  actionSetOpeningStock: mockSetOpening,
  actionReceiveStock: mockReceive,
  actionRecordLoss: mockLoss,
  actionCreateIngredient: mockCreate,
  actionUpdateIngredient: mockUpdate,
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { useInventoryActions } from '../use-inventory-actions';

const TENANT = 'tenant-1';
const ING: Ingredient = {
  id: 'ing-1',
  tenant_id: TENANT,
  name: 'Farine',
  unit: 'kg',
  current_stock: 10,
  min_stock_alert: 2,
  cost_per_unit: 1200,
  category: null,
  is_active: true,
  purchase_unit: null,
  units_per_purchase: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as Ingredient;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function setup() {
  return renderHook(() => useInventoryActions(TENANT), { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAdjust.mockResolvedValue({ success: true });
  mockSetOpening.mockResolvedValue({ success: true });
  mockLoss.mockResolvedValue({ success: true });
  mockCreate.mockResolvedValue({ success: true });
});

describe("handleAdjust: stock d'ouverture", () => {
  it('le type "opening" REMPLACE le stock via actionSetOpeningStock', async () => {
    const { result } = setup();
    act(() => result.current.openAdjust(ING));
    act(() => {
      result.current.setAdjustType('opening');
      result.current.setAdjustQty('5');
    });
    await act(async () => {
      await result.current.handleAdjust();
    });

    expect(mockSetOpening).toHaveBeenCalledWith(TENANT, 'ing-1', 5);
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it('accepte une ouverture a 0 (remise a zero du stock)', async () => {
    const { result } = setup();
    act(() => result.current.openAdjust(ING));
    act(() => {
      result.current.setAdjustType('opening');
      result.current.setAdjustQty('0');
    });
    await act(async () => {
      await result.current.handleAdjust();
    });

    expect(mockSetOpening).toHaveBeenCalledWith(TENANT, 'ing-1', 0);
  });

  it('temoin negatif: un ajout manuel passe toujours par actionAdjustStock', async () => {
    const { result } = setup();
    act(() => result.current.openAdjust(ING));
    act(() => result.current.setAdjustQty('5'));
    await act(async () => {
      await result.current.handleAdjust();
    });

    expect(mockAdjust).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ ingredient_id: 'ing-1', quantity: 5, movement_type: 'manual_add' }),
    );
    expect(mockSetOpening).not.toHaveBeenCalled();
  });

  it('refuse une quantite nulle pour un ajout, avec un message', async () => {
    const { result } = setup();
    act(() => result.current.openAdjust(ING));
    act(() => result.current.setAdjustQty('0'));
    await act(async () => {
      await result.current.handleAdjust();
    });

    expect(mockAdjust).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'quantityMustBePositive' }),
    );
  });

  it('refuse une quantite trop grande avec un message', async () => {
    const { result } = setup();
    act(() => result.current.openAdjust(ING));
    act(() => result.current.setAdjustQty('99999999999'));
    await act(async () => {
      await result.current.handleAdjust();
    });

    expect(mockAdjust).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'quantityTooLarge' }));
  });
});

describe('handleRecordLoss', () => {
  it('refuse une perte nulle ou negative avec un message, sans appeler le serveur', async () => {
    const { result } = setup();
    act(() => result.current.openLoss(ING));
    act(() => result.current.setLossQty('0'));
    await act(async () => {
      await result.current.handleRecordLoss();
    });

    expect(mockLoss).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'lossQuantityMustBePositive' }),
    );
  });

  it('enregistre une perte positive', async () => {
    const { result } = setup();
    act(() => result.current.openLoss(ING));
    act(() => result.current.setLossQty('1.5'));
    await act(async () => {
      await result.current.handleRecordLoss();
    });

    expect(mockLoss).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ ingredient_id: 'ing-1', quantity: 1.5 }),
    );
  });
});

describe('handleSave: validations qui disent quoi corriger', () => {
  it('refuse "Unites par achat" a 0 au lieu de le corriger en 1 en silence', async () => {
    const { result } = setup();
    act(() => result.current.openAdd());
    act(() => {
      result.current.setFormName('Farine');
      result.current.setFormUnitsPerPurchase('0');
    });
    await act(async () => {
      await result.current.handleSave();
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'purchaseFactorInvalid' }),
    );
  });

  it('temoin: un facteur valide (ou vide) est accepte', async () => {
    const { result } = setup();
    act(() => result.current.openAdd());
    act(() => {
      result.current.setFormName('Farine');
      result.current.setFormUnitsPerPurchase('25');
    });
    await act(async () => {
      await result.current.handleSave();
    });

    expect(mockCreate).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ units_per_purchase: 25 }),
    );
  });

  it('refuse un nom de plus de 100 caracteres avec un message', async () => {
    const { result } = setup();
    act(() => result.current.openAdd());
    act(() => result.current.setFormName('x'.repeat(101)));
    await act(async () => {
      await result.current.handleSave();
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'nameTooLong' }));
  });
});
