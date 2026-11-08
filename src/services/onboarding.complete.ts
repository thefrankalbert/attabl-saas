import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError, isTenantNameConflictError } from './errors';
import { createTableConfigService } from './table-config.service';
import { logger } from '@/lib/logger';
import { onboardingDataToQRConfig } from '@/lib/qr/onboarding-qr-config';
import { qrDesignConfigSchema } from '@/lib/validations/qr-design.schema';
import {
  detailsForType,
  establishmentDetailsSchema,
  type EstablishmentDetails,
} from '@/lib/validations/establishment-details.schema';
import type { OnboardingCompleteData, MenuItem } from './onboarding.types';

/** Name of the QR design created from the onboarding choice. */
const ONBOARDING_QR_DESIGN_NAME = 'Mon QR';

/**
 * How long a launch may hold the lock before another attempt may take it over.
 * A real launch takes seconds; this only frees a lock left by a crashed run.
 * Generous on purpose: a run still writing when its lock expires would let a
 * second run in (the race this lock exists to prevent).
 */
const LAUNCH_LOCK_TTL_MS = 10 * 60 * 1000;

/**
 * Completes the onboarding flow.
 *
 * ONE LAUNCH AT A TIME. Every creation step reads then inserts, with nothing in
 * the schema to stop a duplicate (no unique constraint on tables or on
 * categories per menu). Two launches at once (two tabs, or a mobile retry while
 * the first request still runs) both saw "0 tables" and both created them, and
 * the failing one's cleanup could delete the other's dishes. A conditional
 * UPDATE claims the tenant first: only one request wins it. The claim lives in
 * `onboarding_completed_at` while `onboarding_completed` is still false; a
 * crashed run's claim expires after LAUNCH_LOCK_TTL_MS.
 *
 * ORDER MATTERS. `onboarding_completed` is set LAST, once every resource exists.
 * Set first (as before), a failure while creating the tables or the menu left a
 * tenant marked "finished" with no tables or no dishes.
 *
 * RETRY-SAFE. Each creation step checks what already exists, so a retry after a
 * partial failure never duplicates the dining room, tables, menu or QR design.
 *
 * LOCKED ONCE DONE. A completed tenant is returned as is: nothing is rewritten.
 */
export async function completeOnboarding(
  supabase: SupabaseClient,
  tenantId: string,
  data: OnboardingCompleteData,
): Promise<{ slug?: string }> {
  const { data: existingTenant, error: readError } = await supabase
    .from('tenants')
    .select('onboarding_completed, slug')
    .eq('id', tenantId)
    .maybeSingle();

  if (readError) {
    throw new ServiceError('Lecture du restaurant impossible', 'INTERNAL', readError);
  }
  if (!existingTenant) {
    throw new ServiceError('Restaurant introuvable', 'NOT_FOUND');
  }
  if (existingTenant.onboarding_completed) {
    return { slug: existingTenant.slug };
  }

  const stamp = await claimLaunch(supabase, tenantId);

  try {
    await runLaunch(supabase, tenantId, data);
  } catch (err) {
    // Free the claim so the user can retry right away. Only OUR claim (same
    // stamp): a run whose expired lock was taken over must not free the new
    // owner's lock. Never on a completed launch either.
    const { error: releaseError } = await supabase
      .from('tenants')
      .update({ onboarding_completed_at: null })
      .eq('id', tenantId)
      .eq('onboarding_completed', false)
      .eq('onboarding_completed_at', stamp);
    if (releaseError) {
      logger.error('Failed to release onboarding launch lock', releaseError, { tenantId });
    }
    throw err;
  }

  return { slug: existingTenant.slug ?? data.tenantSlug };
}

/**
 * Atomically takes the launch lock, or throws CONFLICT if another run holds it.
 *
 * Two single-filter UPDATEs, each atomic: a free lock (NULL), else an expired
 * one. Not one `.or(...)`: PostgREST rejects an `or` filter on this PATCH with
 * 42703 "column tenants.<col> does not exist" (measured 2026-11-08 on the
 * local stack, service role included), which made EVERY launch fail.
 * Two runs racing on a free lock: only one UPDATE matches the NULL row; the
 * other's second UPDATE needs an expired timestamp, which a fresh one is not.
 */
async function claimLaunch(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const now = new Date();
  const stamp = now.toISOString();
  const staleBefore = new Date(now.getTime() - LAUNCH_LOCK_TTL_MS).toISOString();

  const free = await supabase
    .from('tenants')
    .update({ onboarding_completed_at: stamp })
    .eq('id', tenantId)
    .eq('onboarding_completed', false)
    .is('onboarding_completed_at', null)
    .select('id');
  if (free.error) {
    throw new ServiceError('Lancement impossible', 'INTERNAL', free.error);
  }
  if (free.data && free.data.length > 0) return stamp;

  const expired = await supabase
    .from('tenants')
    .update({ onboarding_completed_at: stamp })
    .eq('id', tenantId)
    .eq('onboarding_completed', false)
    .lt('onboarding_completed_at', staleBefore)
    .select('id');
  if (expired.error) {
    throw new ServiceError('Lancement impossible', 'INTERNAL', expired.error);
  }
  if (expired.data && expired.data.length > 0) return stamp;

  // Zero rows has two causes, told apart by a read: a live lock held by
  // another run (wait and retry), or an UPDATE refused by RLS
  // (has_tenant_write_permission): that one would answer "in progress" forever.
  const { data: current, error: readError } = await supabase
    .from('tenants')
    .select('onboarding_completed, onboarding_completed_at')
    .eq('id', tenantId)
    .maybeSingle();
  if (readError) {
    throw new ServiceError('Lancement impossible', 'INTERNAL', readError);
  }
  // `timestamp` without time zone: PostgREST returns it without a zone; it was
  // written as UTC, so read it back as UTC before comparing instants.
  const lockedAt = current?.onboarding_completed_at
    ? Date.parse(
        /[zZ]|[+-]\d\d:?\d\d$/.test(current.onboarding_completed_at)
          ? current.onboarding_completed_at
          : `${current.onboarding_completed_at}Z`,
      )
    : null;
  const heldByAnother =
    !!current &&
    (current.onboarding_completed === true ||
      (lockedAt !== null && lockedAt >= Date.parse(staleBefore)));
  if (heldByAnother) {
    throw new ServiceError('ONBOARDING_IN_PROGRESS', 'CONFLICT');
  }
  throw new ServiceError('Permissions insuffisantes', 'UNAUTHORIZED');
}

async function runLaunch(
  supabase: SupabaseClient,
  tenantId: string,
  data: OnboardingCompleteData,
): Promise<void> {
  // 1. Tenant fields (everything except the "completed" flag, written last).
  const tenantUpdate: Record<string, unknown> = {
    establishment_type: data.establishmentType,
    address: data.address,
    city: data.city,
    country: data.country,
    phone: data.phone,
    table_count: data.tableCount,
    logo_url: data.logoUrl,
    primary_color: data.primaryColor,
    secondary_color: data.secondaryColor,
    description: data.description,
    establishment_details: pickEstablishmentDetails(data),
  };
  if (data.tenantName) {
    tenantUpdate.name = data.tenantName;
  }
  if (data.currency) {
    tenantUpdate.currency = data.currency;
    // `supported_currencies` restait au defaut de la base ('{XAF}') meme quand
    // le restaurant choisissait une autre devise. Or la vitrine lit CETTE
    // colonne pour proposer un changement de devise au convive: un restaurant
    // en XOF se serait vu proposer le XAF.
    tenantUpdate.supported_currencies = [data.currency];
  }
  if (data.language) {
    tenantUpdate.default_locale = data.language;
  }

  const { error: tenantError } = await supabase
    .from('tenants')
    .update(tenantUpdate)
    .eq('id', tenantId);
  if (tenantError) {
    if (isTenantNameConflictError(tenantError)) {
      throw new ServiceError('RESTAURANT_NAME_TAKEN', 'CONFLICT', tenantError);
    }
    logger.error('Failed to update tenant during onboarding completion', tenantError, {
      tenantId,
    });
    throw new ServiceError('Failed to update tenant', 'INTERNAL', tenantError);
  }

  // 2. Main venue (get or create).
  const venueId = await getOrCreateVenue(supabase, tenantId, data.tenantSlug);

  // 3. Tables, menu and QR design - independent, in parallel. `allSettled`, not
  //    `all`: `all` rejects on the first failure while the other branches keep
  //    writing, so the lock would be released under running writes.
  const results = await Promise.allSettled([
    createTablesIfMissing(supabase, tenantId, venueId, data),
    createMenuIfMissing(supabase, tenantId, data.menuItems),
    createQrDesignIfMissing(supabase, tenantId, data),
  ]);
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;

  // 4. Only now: the onboarding is finished.
  const now = new Date().toISOString();
  const { error: completeError } = await supabase
    .from('tenants')
    .update({ onboarding_completed: true, onboarding_completed_at: now })
    .eq('id', tenantId);
  if (completeError) {
    logger.error('Failed to mark onboarding completed', completeError, { tenantId });
    throw new ServiceError('Failed to complete onboarding', 'INTERNAL', completeError);
  }

  // The draft is no longer needed. A failure here does not undo anything: the
  // tenant flag above is the source of truth for "finished".
  const { error: progressError } = await supabase.from('onboarding_progress').upsert(
    {
      tenant_id: tenantId,
      step: 5,
      completed: true,
      completed_at: now,
      updated_at: now,
      draft: null,
    },
    { onConflict: 'tenant_id' },
  );
  if (progressError) {
    logger.error('Failed to update onboarding progress', progressError, { tenantId });
  }
}

/** Keeps only the validated type-specific details present in the payload. */
function pickEstablishmentDetails(data: OnboardingCompleteData): EstablishmentDetails {
  const candidate: Record<string, unknown> = {};
  for (const key of Object.keys(establishmentDetailsSchema.shape)) {
    const value = (data as Record<string, unknown>)[key];
    if (value !== undefined) candidate[key] = value;
  }
  const parsed = establishmentDetailsSchema.safeParse(candidate);
  if (!parsed.success) {
    // The route schema already validated these fields: reaching this is a bug.
    throw new ServiceError('Details etablissement invalides', 'VALIDATION');
  }
  // The draft keeps the answers of every type the user clicked through.
  return detailsForType(data.establishmentType, parsed.data);
}

async function getOrCreateVenue(
  supabase: SupabaseClient,
  tenantId: string,
  tenantSlug: string | undefined,
): Promise<string> {
  // A tenant can have several venues; take the earliest (main) one.
  const { data: existingVenue, error: venueReadError } = await supabase
    .from('venues')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (venueReadError) {
    throw new ServiceError('Lecture de la salle impossible', 'INTERNAL', venueReadError);
  }
  if (existingVenue) return existingVenue.id;

  const { data: newVenue, error: venueInsertError } = await supabase
    .from('venues')
    .insert({ tenant_id: tenantId, name: tenantSlug || 'Principal' })
    .select('id')
    .single();
  if (venueInsertError || !newVenue) {
    throw new ServiceError('Creation de la salle impossible', 'INTERNAL', venueInsertError);
  }
  return newVenue.id;
}

async function createTablesIfMissing(
  supabase: SupabaseClient,
  tenantId: string,
  venueId: string,
  data: OnboardingCompleteData,
): Promise<void> {
  // Guard on TABLES, not zones: Settings > Espaces can create an empty zone,
  // and such a zone must not make the onboarding skip the user's tables.
  const { count, error } = await supabase
    .from('tables')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) {
    throw new ServiceError('Lecture des tables impossible', 'INTERNAL', error);
  }
  if ((count ?? 0) > 0) return; // already created (previous attempt or Settings)

  const tableService = createTableConfigService(supabase);
  if (data.tableZones && data.tableZones.length > 0 && data.tableConfigMode !== 'skip') {
    const zonesWithDefaults = data.tableZones.map((z) => ({
      ...z,
      defaultCapacity: z.defaultCapacity ?? 2,
    }));
    await tableService.createZonesAndTables(tenantId, venueId, zonesWithDefaults);
  } else {
    await tableService.createDefaultConfig(tenantId, venueId, data.tableCount || 10);
  }
}

async function createMenuIfMissing(
  supabase: SupabaseClient,
  tenantId: string,
  menuItems: MenuItem[] | undefined,
): Promise<void> {
  const validItems = (menuItems ?? []).filter((item) => item.name && item.name.trim());
  if (validItems.length === 0) return;

  // menus.slug is NOT NULL and unique per tenant. The onboarding owns the
  // 'carte-principale' menu: reuse it if an earlier attempt left it.
  const { data: existingMenu, error: menuReadError } = await supabase
    .from('menus')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('slug', 'carte-principale')
    .maybeSingle();
  if (menuReadError) {
    throw new ServiceError('Lecture de la carte impossible', 'INTERNAL', menuReadError);
  }

  let menuId: string;
  let createdMenu = false;
  if (existingMenu) {
    // Guard on THIS menu's categories only: categories the user created by hand
    // in another menu (the admin is reachable before the onboarding ends) must
    // not make the onboarding drop the dishes typed here.
    const { count, error: countError } = await supabase
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('menu_id', existingMenu.id);
    if (countError) {
      throw new ServiceError('Lecture des rubriques impossible', 'INTERNAL', countError);
    }
    if ((count ?? 0) > 0) return; // menu already filled by a previous attempt
    menuId = existingMenu.id;
  } else {
    const { data: newMenu, error: menuError } = await supabase
      .from('menus')
      .insert({
        tenant_id: tenantId,
        name: 'Carte Principale',
        name_en: 'Main Menu',
        slug: 'carte-principale',
        is_active: true,
        display_order: 1,
      })
      .select('id')
      .single();
    if (menuError || !newMenu) {
      logger.error('Failed to create default menu during onboarding', menuError, { tenantId });
      throw new ServiceError('Creation de la carte impossible', 'INTERNAL', menuError);
    }
    menuId = newMenu.id;
    createdMenu = true;
  }

  // Group items by category, keeping the typed order.
  const itemsByCategory = new Map<string, MenuItem[]>();
  for (const item of validItems) {
    const catName = item.category?.trim() || 'Menu';
    const existing = itemsByCategory.get(catName) || [];
    existing.push(item);
    itemsByCategory.set(catName, existing);
  }

  try {
    const categoryEntries = Array.from(itemsByCategory.entries());
    // allSettled: the cleanup below must not run while other categories are
    // still being inserted.
    const settled = await Promise.allSettled(
      categoryEntries.map(async ([categoryName, items], categoryIndex) => {
        const { data: category, error: catError } = await supabase
          .from('categories')
          .insert({
            tenant_id: tenantId,
            menu_id: menuId,
            name: categoryName,
            is_active: true,
            // categories has no `sort_order` column (only display_order).
            display_order: categoryIndex + 1,
          })
          .select('id')
          .single();
        if (catError || !category) {
          throw new ServiceError('Creation des rubriques impossible', 'INTERNAL', catError);
        }

        // PAS de `display_order` ici: la table `menu_items` n'a pas cette
        // colonne (PGRST204 rejetait tout le lot). L'ordre de saisie est
        // conserve par l'insertion sequentielle du lot (tri par created_at).
        const { error: itemsError } = await supabase.from('menu_items').insert(
          items.map((item) => ({
            tenant_id: tenantId,
            category_id: category.id,
            name: item.name,
            price: item.price || 0,
            image_url: item.imageUrl || null,
            is_available: true,
          })),
        );
        if (itemsError) {
          throw new ServiceError('Creation des plats impossible', 'INTERNAL', itemsError);
        }
      }),
    );
    const failedCategory = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failedCategory) throw failedCategory.reason;
  } catch (err) {
    // The dishes used to be lost in silence (logged, onboarding "succeeded").
    // Undo this attempt so the retry starts clean: deleting the menu cascades
    // to its categories and their items (ON DELETE CASCADE).
    logger.error('Failed to create onboarding menu', err, { tenantId });
    const cleanup = createdMenu
      ? supabase.from('menus').delete().eq('id', menuId).eq('tenant_id', tenantId)
      : supabase.from('categories').delete().eq('menu_id', menuId).eq('tenant_id', tenantId);
    const { error: cleanupError } = await cleanup;
    if (cleanupError) {
      logger.error('Failed to clean up partial onboarding menu', cleanupError, { tenantId });
    }
    throw err instanceof ServiceError
      ? err
      : new ServiceError('Creation de la carte impossible', 'INTERNAL', err);
  }
}

async function createQrDesignIfMissing(
  supabase: SupabaseClient,
  tenantId: string,
  data: OnboardingCompleteData,
): Promise<void> {
  const config = onboardingDataToQRConfig(data);
  const parsed = qrDesignConfigSchema.safeParse(config);
  if (!parsed.success) {
    // The conversion produced a shape the QR page would refuse: a bug, not a
    // user error. Fail loudly rather than save a design that cannot be read.
    throw new ServiceError('Design QR invalide', 'INTERNAL', parsed.error);
  }

  const { data: existing, error: readError } = await supabase
    .from('qr_designs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .maybeSingle();
  if (readError) {
    throw new ServiceError('Lecture du design QR impossible', 'INTERNAL', readError);
  }
  if (existing) return; // the user (or a previous attempt) already has one

  const { error: insertError } = await supabase.from('qr_designs').insert({
    tenant_id: tenantId,
    name: ONBOARDING_QR_DESIGN_NAME,
    config: parsed.data,
    is_default: true,
  });
  if (!insertError) return;

  // QR customization is a plan entitlement (trigger
  // enforce_qr_customization_entitlement: active trial or Pro and above). A
  // restaurant outside it keeps the standard QR, exactly as the QR page would
  // tell them; that must not block the launch of the restaurant.
  if (
    insertError.code === '23514' &&
    insertError.message.includes('QR customization requires the Pro plan')
  ) {
    logger.info('Onboarding QR design not saved: plan without QR customization', { tenantId });
    return;
  }
  throw new ServiceError('Enregistrement du design QR impossible', 'INTERNAL', insertError);
}
