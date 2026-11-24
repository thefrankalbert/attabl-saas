import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit de mise en production (2026-11-23): actionCreateCategory acceptait un
 * nom de 408 caracteres. Le nom est desormais borne a 100 caracteres, a la
 * creation comme a la modification, AVANT toute ecriture.
 */

const { createCategory, updateCategory } = vi.hoisted(() => ({
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/lib/billing/assert-tenant-serving', () => ({
  assertTenantServing: vi.fn(async () => undefined),
  TenantLockedError: class extends Error {},
}));
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: vi.fn(async () => ({
    user: { id: 'u1' },
    supabase: {},
    role: 'owner',
  })),
  AuthError: class extends Error {
    status = 403;
  },
}));
vi.mock('@/services/category.service', () => ({
  createCategoryService: () => ({ createCategory, updateCategory }),
}));
vi.mock('@/services/audit.service', () => ({ createAuditService: () => ({ log: vi.fn() }) }));
vi.mock('@/services/storage-cleanup.service', () => ({
  getStorageCleanup: () => ({ imageUrlsOf: async () => [], release: async () => undefined }),
}));

const T = '22222222-2222-4222-a222-222222222222';
const C = '33333333-3333-4333-a333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
  createCategory.mockResolvedValue({ id: C });
  updateCategory.mockResolvedValue(undefined);
});

// La carte est requise a la modification (menu_id, null = hors carte: audit B33).
describe('nom de categorie: 100 caracteres au plus', () => {
  it('creation: un nom de 100 caracteres passe (temoin positif)', async () => {
    const { actionCreateCategory } = await import('@/app/actions/categories');
    const r = await actionCreateCategory(T, { name: 'a'.repeat(100), tenant_id: T });
    expect(r.success).toBe(true);
    expect(createCategory).toHaveBeenCalledTimes(1);
  });

  it('creation: un nom de 408 caracteres est refuse sans ecriture (temoin negatif)', async () => {
    const { actionCreateCategory } = await import('@/app/actions/categories');
    const r = await actionCreateCategory(T, { name: 'a'.repeat(408), tenant_id: T });
    expect(r.error).toBe('Maximum 100 caractères');
    expect(createCategory).not.toHaveBeenCalled();
  });

  it('creation: un nom anglais de 101 caracteres est refuse', async () => {
    const { actionCreateCategory } = await import('@/app/actions/categories');
    const r = await actionCreateCategory(T, {
      name: 'Entrees',
      name_en: 'b'.repeat(101),
      tenant_id: T,
    });
    expect(r.error).toBe('Maximum 100 caractères');
    expect(createCategory).not.toHaveBeenCalled();
  });

  it('modification: un nom de 408 caracteres est refuse sans ecriture', async () => {
    const { actionUpdateCategory } = await import('@/app/actions/categories');
    const r = await actionUpdateCategory(T, C, {
      name: 'a'.repeat(408),
      tenant_id: T,
      menu_id: null,
    });
    expect(r.error).toBe('Maximum 100 caractères');
    expect(updateCategory).not.toHaveBeenCalled();
  });

  it('modification: un nom valide passe', async () => {
    const { actionUpdateCategory } = await import('@/app/actions/categories');
    const r = await actionUpdateCategory(T, C, { name: 'Desserts', tenant_id: T, menu_id: null });
    expect(r.success).toBe(true);
    expect(updateCategory).toHaveBeenCalledTimes(1);
  });

  it('creation: le nom est enregistre sans les espaces autour', async () => {
    const { actionCreateCategory } = await import('@/app/actions/categories');
    await actionCreateCategory(T, { name: '  Entrees  ', name_en: '  Starters ', tenant_id: T });
    expect(createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Entrees', name_en: 'Starters' }),
      undefined,
    );
  });

  it('modification: le nom est enregistre sans les espaces autour', async () => {
    const { actionUpdateCategory } = await import('@/app/actions/categories');
    await actionUpdateCategory(T, C, { name: '  Desserts ', tenant_id: T, menu_id: null });
    expect(updateCategory).toHaveBeenCalledWith(C, expect.objectContaining({ name: 'Desserts' }));
  });
});
