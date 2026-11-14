import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Coupure du restaurant (audit A-02): une Server Action est un endpoint POST
 * adressable, donc gater la page ne gate pas la mutation. Pour CHAQUE ecriture
 * des fichiers ci-dessous, quand `assertTenantServing` refuse, l'action rend le
 * message de coupure (et non "Permissions insuffisantes") et n'ecrit rien: ni
 * service, ni client Supabase.
 */

const LOCK_MESSAGE = 'Ce restaurant est temporairement indisponible';

const { mockAssertServing, dbSpy, serverClientSpy, adminClientSpy } = vi.hoisted(() => ({
  mockAssertServing: vi.fn(),
  dbSpy: vi.fn(),
  serverClientSpy: vi.fn(),
  adminClientSpy: vi.fn(),
}));

vi.mock('@/lib/billing/assert-tenant-serving', async () => {
  const { AuthError } = await import('@/lib/auth/get-session');
  class TenantLockedError extends AuthError {
    constructor(message = 'Ce restaurant est temporairement indisponible') {
      super(message, 403);
    }
  }
  return { assertTenantServing: mockAssertServing, TenantLockedError };
});

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({
  uploadLimiter: { check: async () => ({ success: true }) },
  assignmentLimiter: { check: async () => ({ success: true }) },
  restaurantCreateLimiter: { check: async () => ({ success: true }) },
  getClientIpFromHeaders: () => '127.0.0.1',
}));
vi.mock('@/lib/plans/assert-feature', () => ({ isFeatureEntitled: async () => true }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    serverClientSpy();
    return {};
  },
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    adminClientSpy();
    return {};
  },
}));
vi.mock('@/lib/auth/get-session', () => {
  class AuthError extends Error {
    status: number;
    constructor(message: string, status = 403) {
      super(message);
      this.status = status;
    }
  }
  const supabase = { from: dbSpy, rpc: dbSpy };
  const user = { id: 'u-1', email: 'o@x.test' };
  return {
    AuthError,
    getAuthenticatedUserForTenant: async (tenantId: string) => ({
      tenantId,
      supabase,
      user,
      role: 'owner',
      adminUserId: 'a-1',
    }),
    getAuthenticatedUserWithTenant: async () => ({
      tenantId: '22222222-2222-4222-a222-222222222222',
      supabase,
      user,
      role: 'owner',
    }),
  };
});

import { LOSS_REASONS } from '@/types/inventory.types';
import { TenantLockedError } from '@/lib/billing/assert-tenant-serving';
import * as ads from '@/app/actions/ads';
import * as announcements from '@/app/actions/announcements';
import * as categories from '@/app/actions/categories';
import * as coupons from '@/app/actions/coupons';
import * as inventory from '@/app/actions/inventory';
import * as menuItems from '@/app/actions/menu-items';
import * as menus from '@/app/actions/menus';
import * as modifiers from '@/app/actions/modifiers';
import * as paymentMethods from '@/app/actions/payment-methods';
import * as qrDesign from '@/app/actions/qr-design';
import * as stockCount from '@/app/actions/stock-count';
import * as suggestions from '@/app/actions/suggestions';
import * as suppliers from '@/app/actions/suppliers';
import * as tableReassign from '@/app/actions/table-reassign';
import * as tables from '@/app/actions/tables';
import * as tenantSettings from '@/app/actions/tenant-settings';
import * as venues from '@/app/actions/venues';

const T = '22222222-2222-4222-a222-222222222222';
const X = '33333333-3333-4333-a333-333333333333';
const Y = '44444444-4444-4444-a444-444444444444';

type Call = [name: string, run: () => Promise<unknown>];

const adPayload = {
  tenant_id: T,
  image_url: 'https://x.test/a.png',
  link: null,
  sort_order: 1,
  is_active: true,
};
const announcementPayload = { title: 'Fete', start_date: '2026-01-01', is_active: true };
const categoryPayload = { name: 'Entrees', tenant_id: T };
const couponPayload = { code: 'BIENVENUE', discount_type: 'fixed' as const, discount_value: 500 };

const writes: Call[] = [
  ['actionCreateAd', () => ads.actionCreateAd(T, adPayload)],
  ['actionDeleteAd', () => ads.actionDeleteAd(T, X)],
  ['actionToggleAdActive', () => ads.actionToggleAdActive(T, X, true)],

  [
    'actionCreateAnnouncement',
    () => announcements.actionCreateAnnouncement(T, announcementPayload),
  ],
  [
    'actionUpdateAnnouncement',
    () => announcements.actionUpdateAnnouncement(T, X, announcementPayload),
  ],
  ['actionDeleteAnnouncement', () => announcements.actionDeleteAnnouncement(T, X)],
  [
    'actionToggleAnnouncementActive',
    () => announcements.actionToggleAnnouncementActive(T, X, true),
  ],

  ['actionToggleCategoryActive', () => categories.actionToggleCategoryActive(T, X, true)],
  ['actionCreateCategory', () => categories.actionCreateCategory(T, categoryPayload)],
  ['actionUpdateCategory', () => categories.actionUpdateCategory(T, X, categoryPayload)],
  ['actionDeleteCategory', () => categories.actionDeleteCategory(T, X)],
  ['actionReorderCategories', () => categories.actionReorderCategories(T, [])],
  ['actionAssignCategoryToMenu', () => categories.actionAssignCategoryToMenu(T, X, Y)],

  ['actionCreateCoupon', () => coupons.actionCreateCoupon(T, couponPayload)],
  ['actionUpdateCoupon', () => coupons.actionUpdateCoupon(T, X, couponPayload)],
  ['actionDeleteCoupon', () => coupons.actionDeleteCoupon(T, X)],
  ['actionToggleCouponActive', () => coupons.actionToggleCouponActive(T, X, true)],

  [
    'actionAdjustStock',
    () =>
      inventory.actionAdjustStock(T, {
        ingredient_id: X,
        quantity: 1,
        movement_type: 'manual_add',
      }),
  ],
  [
    'actionReceiveStock',
    () => inventory.actionReceiveStock(T, { ingredient_id: X, quantity: 1, inPurchaseUnit: false }),
  ],
  [
    'actionRecordLoss',
    () =>
      inventory.actionRecordLoss(T, {
        ingredient_id: X,
        quantity: 1,
        reason_code: LOSS_REASONS[0],
      }),
  ],
  [
    'actionCreateIngredient',
    () => inventory.actionCreateIngredient(T, { name: 'Tomate', unit: 'kg' }),
  ],
  ['actionUpdateIngredient', () => inventory.actionUpdateIngredient(T, X, { name: 'Oignon' })],
  ['actionSetRecipe', () => inventory.actionSetRecipe(T, X, [])],
  ['actionSetOpeningStock', () => inventory.actionSetOpeningStock(T, X, 1)],

  ['actionCreateMenuItem', () => menuItems.actionCreateMenuItem(T, {})],
  ['actionUpdateMenuItem', () => menuItems.actionUpdateMenuItem(T, X, {})],
  ['actionDeleteMenuItem', () => menuItems.actionDeleteMenuItem(T, X)],
  ['actionToggleMenuItemAvailable', () => menuItems.actionToggleMenuItemAvailable(T, X, true)],
  ['actionToggleMenuItemFeatured', () => menuItems.actionToggleMenuItemFeatured(T, X, true)],
  ['actionUpdateMenuItemPrice', () => menuItems.actionUpdateMenuItemPrice(T, X, 1000)],

  ['actionCreateMenu', () => menus.actionCreateMenu(T, { name: 'Carte du soir' })],
  ['actionUpdateMenu', () => menus.actionUpdateMenu(T, { id: X })],
  ['actionDeleteMenu', () => menus.actionDeleteMenu(T, X)],
  ['actionReorderMenus', () => menus.actionReorderMenus(T, [X])],

  [
    'actionCreateModifier',
    () =>
      modifiers.actionCreateModifier(T, {
        tenant_id: T,
        menu_item_id: X,
        name: 'Sans piment',
        price: 0,
        is_available: true,
        display_order: 0,
      }),
  ],
  ['actionDeleteModifier', () => modifiers.actionDeleteModifier(T, X)],
  ['actionToggleModifierAvailable', () => modifiers.actionToggleModifierAvailable(T, X, true)],

  ['actionUpdatePaymentMethods', () => paymentMethods.actionUpdatePaymentMethods(['cash'])],

  ['actionSaveQrDesign', () => qrDesign.actionSaveQrDesign({})],
  ['actionDeleteQrDesign', () => qrDesign.actionDeleteQrDesign(X)],
  ['actionAssignQrDesign', () => qrDesign.actionAssignQrDesign({})],

  ['actionOpenStockCount', () => stockCount.actionOpenStockCount(T, {})],
  ['actionSaveStockCountLines', () => stockCount.actionSaveStockCountLines(T, X, [])],
  ['actionCommitStockCount', () => stockCount.actionCommitStockCount(T, X)],
  ['actionCancelStockCount', () => stockCount.actionCancelStockCount(T, X)],

  [
    'actionCreateSuggestion',
    () =>
      suggestions.actionCreateSuggestion(T, {
        tenant_id: T,
        menu_item_id: X,
        suggested_item_id: Y,
        suggestion_type: 'upsell',
        display_order: 0,
      }),
  ],
  ['actionDeactivateSuggestion', () => suggestions.actionDeactivateSuggestion(T, X)],
  ['actionBulkDeactivateSuggestions', () => suggestions.actionBulkDeactivateSuggestions(T, [X])],
  ['actionGenerateAndSaveSuggestions', () => suggestions.actionGenerateAndSaveSuggestions(T)],

  ['actionCreateSupplier', () => suppliers.actionCreateSupplier(T, { name: 'Marche central' })],
  ['actionUpdateSupplier', () => suppliers.actionUpdateSupplier(T, X, { name: 'Autre nom' })],
  ['actionDeleteSupplier', () => suppliers.actionDeleteSupplier(T, X)],

  ['actionReassignOrderTable', () => tableReassign.actionReassignOrderTable(X, 'T12')],

  ['actionCreateZone', () => tables.actionCreateZone(T, X, 'Terrasse', 'TER', 0)],
  ['actionUpdateZoneName', () => tables.actionUpdateZoneName(T, X, 'Salle')],
  ['actionDeleteZone', () => tables.actionDeleteZone(T, X)],
  [
    'actionInsertTables',
    () =>
      tables.actionInsertTables(T, [
        { zone_id: X, table_number: '1', display_name: 'Table 1', capacity: 2, is_active: true },
      ]),
  ],
  ['actionToggleTableActive', () => tables.actionToggleTableActive(T, X, true)],
  ['actionUpdateTableCapacity', () => tables.actionUpdateTableCapacity(T, X, 4)],
  ['actionUpdateTableDisplayName', () => tables.actionUpdateTableDisplayName(T, X, 'Table 9')],
  ['actionDeleteTable', () => tables.actionDeleteTable(T, X)],

  ['actionUpdateTenantSettings', () => tenantSettings.actionUpdateTenantSettings(new FormData())],

  ['actionCreateVenue', () => venues.actionCreateVenue({})],
  ['actionRenameVenue', () => venues.actionRenameVenue({})],
  ['actionReactivateVenue', () => venues.actionReactivateVenue({})],
  ['actionDeactivateVenue', () => venues.actionDeactivateVenue({})],
];

describe('restaurant coupe: aucune ecriture par Server Action (A-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertServing.mockRejectedValue(new TenantLockedError());
  });

  it.each(writes)('%s refuse avec le message de coupure et n ecrit rien', async (_name, run) => {
    const res = (await run()) as { error?: string; success?: boolean } | undefined;

    expect(mockAssertServing).toHaveBeenCalledWith(T);
    expect(res?.error).toBe(LOCK_MESSAGE);
    expect(res?.success).toBeFalsy();
    expect(dbSpy).not.toHaveBeenCalled();
    expect(serverClientSpy).not.toHaveBeenCalled();
    expect(adminClientSpy).not.toHaveBeenCalled();
  });

  it('classe TOUTE action exportee de src/app/actions (aucune non classee)', () => {
    const dir = join(process.cwd(), 'src/app/actions');
    // Hors perimetre, par decision: console plateforme (deverrouille les
    // restaurants), formulaire public, etat de lecture personnel.
    const exemptFiles = new Set(['platform-admin.ts', 'contact.ts', 'notifications.ts']);
    // Lectures: aucune garde de coupure.
    const reads = new Set([
      'actionGetLossesByReason',
      'actionResolveDesignsForTables',
      'actionGetPaymentSummary',
      'actionListOrderNotes',
      'actionListHouseAccounts',
    ]);
    // Retirer ou desactiver un membre reste permis restaurant coupe (securite).
    const stayOpen = new Set(['actionDeleteAdminUser']);
    // Ecritures verrouillees, prouvees par un autre fichier de test (avec la
    // garde simulee) ou deja existantes: la source doit appeler la garde.
    const lockedElsewhere = new Set([
      'actionCreateAdminUser',
      'actionUpdateAdminUser',
      'actionResetUserPassword',
      'actionUpdateUserEmail',
      'actionDeleteOrders',
      'actionUpdateOrderStatus',
      'actionUpdateItemStatus',
      'actionSetCourseHeld',
      'actionMarkOrderPaid',
      'actionRecordTender',
      'actionRefundOrder',
      'actionCompOrder',
      'actionAddOrderNote',
      'actionCreateHouseAccount',
      'actionAttachOrderToHouseAccount',
      'actionDetachOrder',
      'actionSettleHouseAccount',
      'actionAssignServer',
      'actionReleaseAssignment',
    ]);
    const covered = new Set(writes.map(([name]) => name));

    const unclassified: string[] = [];
    const lockedWithoutGuard: string[] = [];
    const seen = new Set<string>();
    for (const file of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      if (exemptFiles.has(file)) continue;
      const source = readFileSync(join(dir, file), 'utf8');
      const names = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
      for (const name of names) {
        seen.add(name);
        if (covered.has(name) || reads.has(name) || stayOpen.has(name)) continue;
        if (lockedElsewhere.has(name)) {
          if (!/assertTenantServing|tenantLockError/.test(source)) lockedWithoutGuard.push(name);
          continue;
        }
        unclassified.push(`${file}:${name}`);
      }
    }
    expect(unclassified).toEqual([]);
    expect(lockedWithoutGuard).toEqual([]);
    // Pas d'entree fantome: chaque nom classe existe encore dans les sources.
    const classified = [...covered, ...reads, ...stayOpen, ...lockedElsewhere];
    expect(classified.filter((n) => !seen.has(n))).toEqual([]);
  });

  it('les lectures restent ouvertes: aucune garde de coupure', async () => {
    const res = await inventory.actionGetLossesByReason(T);
    expect(mockAssertServing).not.toHaveBeenCalled();
    expect(res.error).not.toBe(LOCK_MESSAGE);
  });

  it('actionResolveDesignsForTables (impression des QR) ne passe pas par la garde', async () => {
    const res = await qrDesign.actionResolveDesignsForTables('pas-un-tableau');
    expect(mockAssertServing).not.toHaveBeenCalled();
    expect(res.error).not.toBe(LOCK_MESSAGE);
  });
});
