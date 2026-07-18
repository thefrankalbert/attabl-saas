# Multi-espaces - Socle : gestion des espaces de restauration - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre a un etablissement (tenant) de creer/renommer/desactiver plusieurs espaces de restauration depuis Parametres > Espaces, borne par le plan (belt applicatif + SQL).

**Architecture:** Architecture 3 couches du projet. UI (route serveur dediee `settings/espaces` + client `EspacesManager`) -> Server Actions (`actions/venues.ts`, gate `settings.edit`) -> Service (`restaurant-group.service.ts` etendu) -> DB `venues`. Le backend d'entitlement (`canAddVenue`, `maxVenues`) et la garde de propriete (`assertVenueOwnedByTenant`) existent deja et sont reutilises. Un trigger SQL `BEFORE INSERT` sur `venues` replique la limite cote base (defense en profondeur), calque sur `enforce_qr_customization_entitlement`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (SDK), Zod, shadcn/ui (Card/Dialog/Button/Input/Label), sonner (toasts), next-intl, Vitest.

**Spec de reference:** `docs/superpowers/specs/2026-07-17-multi-etablissements-socle-design.md`

## Global Constraints

- **Vocabulaire (ACTE)** : UI/copy/route = "espace" (espace de restauration). Code/DB = `venue` (colonne `venue_id`, helpers existants inchanges). "Etablissement" = le tenant, ne PAS l'employer pour une venue.
- **Table `venues`** colonnes reelles : `id, tenant_id, name, name_en (nullable), slug (NOT NULL), type (defaut), is_active (defaut true), has_own_menu, created_at`. PAS de colonne `is_default`. "Espace principal" = le plus ancien (`created_at` min).
- **Slug venue** : `slug` est NOT NULL. `slug.service.generateUniqueSlug` vise la table `tenants` (INCORRECT pour une venue). Generer un slug unique SCOPE au tenant sur la table `venues` (voir Task 2), en reutilisant `normalizeToSlug` (pur).
- **Securite** : `tenant_id` derive de la session (`getAuthenticatedUserWithTenant`), jamais du client. Mutations gated `settings.edit`. `assertVenueOwnedByTenant` sur rename/deactivate. Filtrer `.eq('tenant_id', tenantId)` sur chaque requete.
- **Server Actions** : `'use server'`, prefixe `action`, retournent `{ success: true, ... } | { success: false, error }` (jamais throw vers le client), `revalidatePath` apres mutation, catch `AuthError` -> message.
- **rate-limit.ts est un fichier PROTEGE** : NE PAS y ajouter de limiter. Reutiliser `restaurantCreateLimiter` (existant) pour create.
- **ServiceError** : `new ServiceError(message: string, code: 'VALIDATION'|'NOT_FOUND'|'INTERNAL'|'AUTH'|'UNAUTHORIZED', cause?: unknown)`.
- **Typographie ASCII stricte** : pas de em-dash, smart quotes, ellipsis unicode, guillemets francais - dans le code, les commentaires ET les i18n. Les accents francais (e, a...) sont autorises.
- **Copy ATTABL** : direct, concret, chaleureux. Interdits : "solution", "plateforme", "optimisez", "configurez votre espace", "n'hesitez pas". CTA = action + benefice.
- **shadcn obligatoire** : `<Button>`, `<Input>`, `<Label>` de `@/components/ui/*` (jamais natif). Ne pas modifier `src/components/ui/*`.
- **Viewport** : page enfant = `h-full` (jamais `h-dvh`/`h-screen`/`min-h-screen`). Un seul scrollable = `main#main-content` (deja fourni par le shell).
- **5 portes CI** avant "termine" : `pnpm typecheck` / `pnpm lint --max-warnings 0` / `pnpm format:check` / `pnpm test` / `pnpm build`.
- **Aucun fichier > 400 lignes, une responsabilite par fichier.**

---

### Task 1: Schema Zod de validation d'un espace

**Files:**

- Create: `src/lib/validations/venue.schema.ts`
- Test: `src/lib/validations/__tests__/venue.schema.test.ts`

**Interfaces:**

- Produces: `venueNameSchema` (Zod string), `createVenueSchema` (`{ name: string }`), `renameVenueSchema` (`{ id: string (uuid); name: string }`), `deactivateVenueSchema` (`{ id: string (uuid) }`). Types exportes : `CreateVenueInput`, `RenameVenueInput`, `DeactivateVenueInput`.

- [ ] **Step 1: Ecrire le test qui echoue**

```typescript
// src/lib/validations/__tests__/venue.schema.test.ts
import { describe, it, expect } from 'vitest';
import {
  createVenueSchema,
  renameVenueSchema,
  deactivateVenueSchema,
} from '@/lib/validations/venue.schema';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('venue.schema', () => {
  it('accepte un nom valide', () => {
    expect(createVenueSchema.safeParse({ name: 'Panorama' }).success).toBe(true);
  });

  it('rejette un nom vide', () => {
    expect(createVenueSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejette un nom trop long (> 60)', () => {
    expect(createVenueSchema.safeParse({ name: 'x'.repeat(61) }).success).toBe(false);
  });

  it('trim le nom', () => {
    const parsed = createVenueSchema.safeParse({ name: '  Lobby bar  ' });
    expect(parsed.success && parsed.data.name).toBe('Lobby bar');
  });

  it('rename exige un uuid valide', () => {
    expect(renameVenueSchema.safeParse({ id: 'nope', name: 'Pool' }).success).toBe(false);
    expect(renameVenueSchema.safeParse({ id: UUID, name: 'Pool' }).success).toBe(true);
  });

  it('deactivate exige un uuid valide', () => {
    expect(deactivateVenueSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(deactivateVenueSchema.safeParse({ id: 'x' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test pour verifier qu'il echoue**

Run: `pnpm test src/lib/validations/__tests__/venue.schema.test.ts`
Expected: FAIL (module `venue.schema` introuvable).

- [ ] **Step 3: Ecrire le schema**

```typescript
// src/lib/validations/venue.schema.ts
import { z } from 'zod';

/**
 * Validation d'un espace de restauration (table `venues`).
 * "Espace" cote UI ; `venue` cote DB/code.
 */
export const venueNameSchema = z
  .string()
  .trim()
  .min(1, 'Le nom de l espace est requis.')
  .max(60, 'Le nom ne peut pas depasser 60 caracteres.');

export const createVenueSchema = z.object({
  name: venueNameSchema,
});

export const renameVenueSchema = z.object({
  id: z.string().uuid('Identifiant invalide.'),
  name: venueNameSchema,
});

export const deactivateVenueSchema = z.object({
  id: z.string().uuid('Identifiant invalide.'),
});

export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type RenameVenueInput = z.infer<typeof renameVenueSchema>;
export type DeactivateVenueInput = z.infer<typeof deactivateVenueSchema>;
```

- [ ] **Step 4: Lancer le test pour verifier qu'il passe**

Run: `pnpm test src/lib/validations/__tests__/venue.schema.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/venue.schema.ts src/lib/validations/__tests__/venue.schema.test.ts
git commit -m "feat(espaces): schema Zod de validation d un espace"
```

---

### Task 2: Methodes de service create/rename/deactivate + slug venue

**Files:**

- Modify: `src/services/restaurant-group.service.ts` (ajouter 3 methodes + 1 helper slug prive a l interface)
- Test: `src/services/__tests__/restaurant-group.service.test.ts` (creer)

**Interfaces:**

- Consumes: `createPlanEnforcementService(supabase).canAddVenue(tenant)` de `@/services/plan-enforcement.service`; `createTableConfigGuards(supabase).assertVenueOwnedByTenant(tenantId, venueId)` de `@/services/table-config.guards`; `createSlugService(supabase).normalizeToSlug(name)` de `@/services/slug.service`; type `Tenant` de `@/types/admin.types`.
- Produces (ajoutes a `RestaurantGroupService`) :
  - `createVenue(tenant: Tenant, name: string): Promise<{ id: string; name: string; slug: string }>`
  - `renameVenue(tenantId: string, venueId: string, name: string): Promise<void>`
  - `deactivateVenue(tenantId: string, venueId: string): Promise<void>`

- [ ] **Step 1: Ecrire les tests qui echouent**

```typescript
// src/services/__tests__/restaurant-group.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRestaurantGroupService } from '@/services/restaurant-group.service';
import { ServiceError } from '@/services/errors';
import type { Tenant } from '@/types/admin.types';

// canAddVenue lit getPlanLimits(plan,status,trialEndsAt) puis compte les venues is_active.
// On mock le client Supabase par methode.

function tenant(plan: string): Tenant {
  return {
    id: 'tenant-1',
    subscription_plan: plan,
    subscription_status: 'active',
    trial_ends_at: null,
  } as unknown as Tenant;
}

describe('restaurant-group.service - espaces (venues)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createVenue : Starter (maxVenues=1) avec deja 1 venue actif -> VALIDATION', async () => {
    // count venues actifs = 1 pour canAddVenue
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: 1, error: null })),
          })),
        })),
      })),
    } as never;
    const svc = createRestaurantGroupService(supabase);
    await expect(svc.createVenue(tenant('starter'), 'Panorama')).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it('createVenue : Business insere name + slug scope-tenant unique + is_active', async () => {
    const inserted: Record<string, unknown>[] = [];
    // 1er from('venues') = canAddVenue count (0) ; 2e = slug lookup (aucun) ; 3e = insert
    let call = 0;
    const supabase = {
      from: vi.fn(() => {
        call += 1;
        if (call === 1) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
              })),
            })),
          };
        }
        if (call === 2) {
          // slug uniqueness lookup: retourne aucune ligne
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                like: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          };
        }
        return {
          insert: vi.fn((rows: Record<string, unknown>[]) => {
            inserted.push(rows[0]);
            return {
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { id: 'venue-2', name: rows[0].name, slug: rows[0].slug },
                    error: null,
                  }),
                ),
              })),
            };
          }),
        };
      }),
    } as never;
    const svc = createRestaurantGroupService(supabase);
    const res = await svc.createVenue(tenant('business'), 'Lobby bar');
    expect(res.slug).toBe('lobby-bar');
    expect(inserted[0]).toMatchObject({
      tenant_id: 'tenant-1',
      name: 'Lobby bar',
      slug: 'lobby-bar',
      is_active: true,
    });
  });

  it('deactivateVenue : refuse le dernier espace actif (count < 2) -> VALIDATION', async () => {
    // from('venues') 1: assertVenueOwnedByTenant (maybeSingle -> found) ; 2: count actifs = 1
    let call = 0;
    const supabase = {
      from: vi.fn(() => {
        call += 1;
        if (call === 1) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'v1' }, error: null })),
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ count: 1, error: null })),
            })),
          })),
        };
      }),
    } as never;
    const svc = createRestaurantGroupService(supabase);
    await expect(svc.deactivateVenue('tenant-1', 'v1')).rejects.toBeInstanceOf(ServiceError);
  });

  it('renameVenue : venue d un autre tenant -> NOT_FOUND (garde propriete)', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
      })),
    } as never;
    const svc = createRestaurantGroupService(supabase);
    await expect(svc.renameVenue('tenant-1', 'foreign', 'Pool')).rejects.toBeInstanceOf(
      ServiceError,
    );
  });
});
```

- [ ] **Step 2: Lancer les tests pour verifier qu'ils echouent**

Run: `pnpm test src/services/__tests__/restaurant-group.service.test.ts`
Expected: FAIL (`createVenue`/`renameVenue`/`deactivateVenue` non definis).

- [ ] **Step 3: Etendre le service**

Dans `src/services/restaurant-group.service.ts` : ajouter les imports en haut, etendre l interface `RestaurantGroupService`, et implementer les 3 methodes dans l objet retourne par `createRestaurantGroupService`.

Ajouter aux imports existants (haut du fichier) :

```typescript
import type { Tenant } from '@/types/admin.types';
import { createPlanEnforcementService } from './plan-enforcement.service';
import { createTableConfigGuards } from './table-config.guards';
import { createSlugService } from './slug.service';
```

Etendre l interface (apres `addRestaurantToGroup(...)`) :

```typescript
export interface RestaurantGroupService {
  getOrCreateGroup(userId: string): Promise<{ id: string }>;
  addRestaurantToGroup(input: AddRestaurantInput): Promise<AddRestaurantResult>;
  createVenue(tenant: Tenant, name: string): Promise<{ id: string; name: string; slug: string }>;
  renameVenue(tenantId: string, venueId: string, name: string): Promise<void>;
  deactivateVenue(tenantId: string, venueId: string): Promise<void>;
}
```

Ajouter les 3 methodes dans l objet retourne (a la suite de `addRestaurantToGroup`) :

```typescript
    /**
     * Cree un espace (venue) pour le tenant.
     * - canAddVenue applique la limite de plan (paywall applicatif).
     * - slug genere unique DANS le tenant (la colonne slug est NOT NULL ;
     *   generateUniqueSlug du slug.service vise `tenants`, pas `venues`, donc on
     *   fait l unicite nous-memes ici).
     */
    async createVenue(
      tenant: Tenant,
      name: string,
    ): Promise<{ id: string; name: string; slug: string }> {
      await createPlanEnforcementService(supabase).canAddVenue(tenant);

      const base = createSlugService(supabase).normalizeToSlug(name) || 'espace';

      // Unicite scope-tenant : lire les slugs existants du tenant qui partagent la base.
      const { data: existing, error: slugErr } = await supabase
        .from('venues')
        .select('slug')
        .eq('tenant_id', tenant.id)
        .like('slug', `${base}%`);

      if (slugErr) {
        throw new ServiceError('Erreur verification espace', 'INTERNAL', slugErr);
      }

      const taken = new Set((existing ?? []).map((v) => v.slug as string));
      let slug = base;
      for (let i = 2; taken.has(slug); i++) {
        slug = `${base}-${i}`;
      }

      const { data: created, error } = await supabase
        .from('venues')
        .insert([{ tenant_id: tenant.id, name, slug, is_active: true }])
        .select('id, name, slug')
        .single();

      if (error || !created) {
        throw new ServiceError('Erreur creation espace', 'INTERNAL', error);
      }

      return { id: created.id as string, name: created.name as string, slug: created.slug as string };
    },

    /**
     * Renomme un espace. Le slug reste inchange (ne pas casser d eventuels liens).
     */
    async renameVenue(tenantId: string, venueId: string, name: string): Promise<void> {
      await createTableConfigGuards(supabase).assertVenueOwnedByTenant(tenantId, venueId);

      const { error } = await supabase
        .from('venues')
        .update({ name })
        .eq('id', venueId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur renommage espace', 'INTERNAL', error);
      }
    },

    /**
     * Desactive un espace. Refuse si c est le dernier espace actif du tenant
     * (un tenant doit toujours garder au moins un espace).
     */
    async deactivateVenue(tenantId: string, venueId: string): Promise<void> {
      await createTableConfigGuards(supabase).assertVenueOwnedByTenant(tenantId, venueId);

      const { count, error: countErr } = await supabase
        .from('venues')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (countErr) {
        throw new ServiceError('Erreur verification espace', 'INTERNAL', countErr);
      }

      if ((count ?? 0) < 2) {
        throw new ServiceError('Impossible de desactiver le dernier espace', 'VALIDATION');
      }

      const { error } = await supabase
        .from('venues')
        .update({ is_active: false })
        .eq('id', venueId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur desactivation espace', 'INTERNAL', error);
      }
    },
```

- [ ] **Step 4: Lancer les tests pour verifier qu ils passent**

Run: `pnpm test src/services/__tests__/restaurant-group.service.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: typecheck + lint cibles**

Run: `pnpm typecheck && pnpm lint --max-warnings 0`
Expected: 0 erreur, 0 warning.

- [ ] **Step 6: Commit**

```bash
git add src/services/restaurant-group.service.ts src/services/__tests__/restaurant-group.service.test.ts
git commit -m "feat(espaces): createVenue/renameVenue/deactivateVenue dans restaurant-group.service"
```

---

### Task 3: Flip du copy de limite (etablissement -> espace)

**Files:**

- Modify: `src/services/plan-enforcement.service.ts:198-202` (message de `canAddVenue`)

**Interfaces:**

- Aucune signature ne change. Seul le texte du message `ServiceError` de `canAddVenue` passe de "etablissement(s)" a "espace(s)".

- [ ] **Step 1: Verifier s il existe un test qui asserte le message actuel**

Run: `grep -rn "etablissement" src/services/__tests__ src/**/__tests__ 2>/dev/null`
Expected: si un test asserte "etablissement(s)", le noter pour le mettre a jour au Step 3. (Le test de `canAddVenue` existant asserte surtout le code `VALIDATION`, pas le texte exact - verifier.)

- [ ] **Step 2: Modifier le message**

Dans `src/services/plan-enforcement.service.ts`, methode `canAddVenue`, remplacer le bloc `throw` (lignes ~199-202) :

```typescript
if ((count || 0) >= limits.maxVenues) {
  throw new ServiceError(
    `Limite atteinte : ${limits.maxVenues} espace(s) maximum pour votre plan ${tenant.subscription_plan || 'starter'}. Passez au plan superieur pour en ajouter plus.`,
    'VALIDATION',
  );
}
```

(Note : ASCII strict - "superieur" sans accent circonflexe reste OK ; le fichier utilise deja des accents e/a, conserver la coherence avec les autres messages du fichier qui ecrivent "superieur".)

- [ ] **Step 3: Mettre a jour tout test qui asserte l ancien texte**

Si le Step 1 a trouve un test assertant "etablissement", remplacer la sous-chaine attendue par "espace". Sinon, aucun changement de test.

- [ ] **Step 4: Lancer les tests de plan-enforcement**

Run: `pnpm test plan-enforcement`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/plan-enforcement.service.ts
git commit -m "fix(espaces): message de limite dit espace(s) au lieu d etablissement(s)"
```

---

### Task 4: Server Actions venues (create/rename/deactivate)

**Files:**

- Create: `src/app/actions/venues.ts`
- Test: `src/app/actions/__tests__/venues.action.test.ts`

**Interfaces:**

- Consumes: `getAuthenticatedUserWithTenant('settings.edit')`, `AuthError` de `@/lib/auth/get-session`; `restaurantCreateLimiter`, `getClientIpFromHeaders` de `@/lib/rate-limit`; `createRestaurantGroupService` (Task 2); schemas de Task 1; `Tenant` de `@/types/admin.types`; `ServiceError` de `@/services/errors`.
- Produces:
  - `actionCreateVenue(input: unknown): Promise<{ success: true; data: { id: string; name: string; slug: string } } | { success: false; error: string }>`
  - `actionRenameVenue(input: unknown): Promise<{ success: true } | { success: false; error: string }>`
  - `actionDeactivateVenue(input: unknown): Promise<{ success: true } | { success: false; error: string }>`

- [ ] **Step 1: Ecrire le test qui echoue**

```typescript
// src/app/actions/__tests__/venues.action.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.fn();
const mockCreateVenue = vi.fn();
const mockRenameVenue = vi.fn();
const mockDeactivateVenue = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/rate-limit', () => ({
  restaurantCreateLimiter: { check: vi.fn(() => Promise.resolve({ success: true })) },
  getClientIpFromHeaders: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: (...a: unknown[]) => mockAuth(...a),
  AuthError: class AuthError extends Error {},
}));
vi.mock('@/services/restaurant-group.service', () => ({
  createRestaurantGroupService: () => ({
    createVenue: mockCreateVenue,
    renameVenue: mockRenameVenue,
    deactivateVenue: mockDeactivateVenue,
  }),
}));

import { actionCreateVenue, actionRenameVenue, actionDeactivateVenue } from '@/app/actions/venues';

const UUID = '11111111-1111-1111-1111-111111111111';

function authOk() {
  mockAuth.mockResolvedValue({
    tenantId: 'tenant-1',
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  subscription_plan: 'business',
                  subscription_status: 'active',
                  trial_ends_at: null,
                },
                error: null,
              }),
          }),
        }),
      }),
    },
  });
}

describe('venues server actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('actionCreateVenue : nom valide -> success avec data', async () => {
    authOk();
    mockCreateVenue.mockResolvedValue({ id: 'v2', name: 'Pool', slug: 'pool' });
    const res = await actionCreateVenue({ name: 'Pool' });
    expect(res).toEqual({ success: true, data: { id: 'v2', name: 'Pool', slug: 'pool' } });
    expect(mockCreateVenue).toHaveBeenCalled();
  });

  it('actionCreateVenue : nom vide -> success:false', async () => {
    authOk();
    const res = await actionCreateVenue({ name: '' });
    expect(res.success).toBe(false);
    expect(mockCreateVenue).not.toHaveBeenCalled();
  });

  it('actionRenameVenue : uuid invalide -> success:false', async () => {
    authOk();
    const res = await actionRenameVenue({ id: 'x', name: 'Pool' });
    expect(res.success).toBe(false);
  });

  it('actionDeactivateVenue : ok -> success:true', async () => {
    authOk();
    mockDeactivateVenue.mockResolvedValue(undefined);
    const res = await actionDeactivateVenue({ id: UUID });
    expect(res).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Lancer le test pour verifier qu il echoue**

Run: `pnpm test src/app/actions/__tests__/venues.action.test.ts`
Expected: FAIL (module `venues` introuvable).

- [ ] **Step 3: Ecrire les actions**

```typescript
// src/app/actions/venues.ts
'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import { createRestaurantGroupService } from '@/services/restaurant-group.service';
import { ServiceError } from '@/services/errors';
import { restaurantCreateLimiter, getClientIpFromHeaders } from '@/lib/rate-limit';
import {
  createVenueSchema,
  renameVenueSchema,
  deactivateVenueSchema,
} from '@/lib/validations/venue.schema';
import type { Tenant } from '@/types/admin.types';

/**
 * Espaces de restauration (table `venues`) - mutations admin.
 *
 * SECURITY : tenantId derive de la session (jamais du client), gate `settings.edit`.
 * createVenue applique le paywall de plan (canAddVenue) ; rename/deactivate passent
 * par la garde de propriete (assertVenueOwnedByTenant, dans le service).
 */

async function revalidateEspaces(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserWithTenant>>['supabase'],
  tenantId: string,
): Promise<void> {
  const { data } = await supabase.from('tenants').select('slug').eq('id', tenantId).maybeSingle();
  if (data?.slug) revalidatePath(`/sites/${data.slug}/admin/settings/espaces`);
}

export async function actionCreateVenue(input: unknown) {
  try {
    const { success: allowed } = await restaurantCreateLimiter.check(
      getClientIpFromHeaders(await headers()),
    );
    if (!allowed) {
      return { success: false as const, error: 'Trop de tentatives. Reessayez dans un instant.' };
    }

    const { tenantId, supabase } = await getAuthenticatedUserWithTenant('settings.edit');

    const parsed = createVenueSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Nom invalide.' };
    }

    // canAddVenue a besoin du plan effectif du tenant : charger les champs plan.
    const { data: t } = await supabase
      .from('tenants')
      .select('subscription_plan, subscription_status, trial_ends_at')
      .eq('id', tenantId)
      .maybeSingle();

    const tenant = {
      id: tenantId,
      subscription_plan: t?.subscription_plan ?? null,
      subscription_status: t?.subscription_status ?? null,
      trial_ends_at: t?.trial_ends_at ?? null,
    } as Tenant;

    const service = createRestaurantGroupService(supabase);
    const data = await service.createVenue(tenant, parsed.data.name);

    await revalidateEspaces(supabase, tenantId);
    return { success: true as const, data };
  } catch (error) {
    if (error instanceof AuthError) return { success: false as const, error: error.message };
    if (error instanceof ServiceError) return { success: false as const, error: error.message };
    logger.error('Error creating venue', error);
    return { success: false as const, error: 'Impossible de creer l espace.' };
  }
}

export async function actionRenameVenue(input: unknown) {
  try {
    const { tenantId, supabase } = await getAuthenticatedUserWithTenant('settings.edit');

    const parsed = renameVenueSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false as const,
        error: parsed.error.issues[0]?.message ?? 'Entree invalide.',
      };
    }

    const service = createRestaurantGroupService(supabase);
    await service.renameVenue(tenantId, parsed.data.id, parsed.data.name);

    await revalidateEspaces(supabase, tenantId);
    return { success: true as const };
  } catch (error) {
    if (error instanceof AuthError) return { success: false as const, error: error.message };
    if (error instanceof ServiceError) return { success: false as const, error: error.message };
    logger.error('Error renaming venue', error);
    return { success: false as const, error: 'Impossible de renommer l espace.' };
  }
}

export async function actionDeactivateVenue(input: unknown) {
  try {
    const { tenantId, supabase } = await getAuthenticatedUserWithTenant('settings.edit');

    const parsed = deactivateVenueSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false as const,
        error: parsed.error.issues[0]?.message ?? 'Entree invalide.',
      };
    }

    const service = createRestaurantGroupService(supabase);
    await service.deactivateVenue(tenantId, parsed.data.id);

    await revalidateEspaces(supabase, tenantId);
    return { success: true as const };
  } catch (error) {
    if (error instanceof AuthError) return { success: false as const, error: error.message };
    if (error instanceof ServiceError) return { success: false as const, error: error.message };
    logger.error('Error deactivating venue', error);
    return { success: false as const, error: 'Impossible de desactiver l espace.' };
  }
}
```

- [ ] **Step 4: Lancer le test pour verifier qu il passe**

Run: `pnpm test src/app/actions/__tests__/venues.action.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: typecheck + lint**

Run: `pnpm typecheck && pnpm lint --max-warnings 0`
Expected: 0 erreur, 0 warning.

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/venues.ts src/app/actions/__tests__/venues.action.test.ts
git commit -m "feat(espaces): server actions create/rename/deactivate venue (gate settings.edit)"
```

---

### Task 5: Belt SQL - trigger de limite sur venues + test de parite

**Files:**

- Create: `supabase/migrations/20260717120000_venues_plan_limit_trigger.sql`
- Test: `src/lib/plans/__tests__/venues-entitlement-parity.test.ts`

**Interfaces:**

- Consumes: matrice `PLAN_LIMITS[*].maxVenues` de `@/lib/plans/features`.
- Produces: fonction SQL `enforce_venue_plan_limit()` + trigger `trg_enforce_venue_plan_limit` sur `venues`.

- [ ] **Step 1: Ecrire la migration**

Calquee sur `20260711080000_qr_customization_db_paywall.sql` (plan effectif : trial actif -> pro). Le CASE numerique doit correspondre a `PLAN_LIMITS.maxVenues` TS : starter=1, pro=2, business=10, enterprise=illimite.

```sql
-- Venues (espaces de restauration) - plan limit enforcement at the data layer
-- ============================================================================
-- The admin action actionCreateVenue gates creation with canAddVenue (per-plan
-- maxVenues in src/lib/plans/features.ts). This trigger mirrors that limit at the
-- database layer so an INSERT via PostgREST (anon key, bypassing the action) is
-- denied too. Effective plan matches getEffectivePlan(): active trial -> pro,
-- else the tenant's own plan, else starter.
--
-- maxVenues parity (must match PLAN_LIMITS): starter=1, pro=2, business=10,
-- enterprise=unlimited. Guarded by venues-entitlement-parity.test.ts.
--
-- SECURITY DEFINER so the trigger can read `tenants` regardless of the writer RLS.
-- Only counts is_active venues (matches canAddVenue).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_venue_plan_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan       text;
  v_status     text;
  v_trial_ends timestamptz;
  v_effective  text;
  v_max        int;
  v_count      int;
BEGIN
  SELECT subscription_plan, subscription_status, trial_ends_at
    INTO v_plan, v_status, v_trial_ends
  FROM tenants
  WHERE id = NEW.tenant_id;

  -- Effective plan (mirror getEffectivePlan)
  IF v_status = 'trial' AND v_trial_ends IS NOT NULL AND v_trial_ends > now() THEN
    v_effective := 'pro';
  ELSIF v_plan IN ('starter', 'pro', 'business', 'enterprise') THEN
    v_effective := v_plan;
  ELSE
    v_effective := 'starter';
  END IF;

  -- Per-plan cap (mirror PLAN_LIMITS.maxVenues ; NULL = unlimited)
  v_max := CASE v_effective
    WHEN 'starter'    THEN 1
    WHEN 'pro'        THEN 2
    WHEN 'business'   THEN 10
    WHEN 'enterprise' THEN NULL
    ELSE 1
  END;

  IF v_max IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM venues
    WHERE tenant_id = NEW.tenant_id AND is_active = true;

    IF v_count >= v_max THEN
      RAISE EXCEPTION 'Venue limit reached for plan %', v_effective
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_venue_plan_limit ON public.venues;

CREATE TRIGGER trg_enforce_venue_plan_limit
  BEFORE INSERT ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_venue_plan_limit();

REVOKE EXECUTE ON FUNCTION public.enforce_venue_plan_limit() FROM PUBLIC, anon, authenticated;
```

- [ ] **Step 2: Ecrire le test de parite qui echoue**

```typescript
// src/lib/plans/__tests__/venues-entitlement-parity.test.ts
import { describe, it, expect } from 'vitest';
import { getPlanLimits } from '@/lib/plans/features';
import type { SubscriptionPlan } from '@/types/billing';

/**
 * Guardrail contre la derive entre la matrice TS (PLAN_LIMITS.maxVenues) et le
 * CASE du trigger SQL enforce_venue_plan_limit
 * (supabase/migrations/20260717120000_venues_plan_limit_trigger.sql).
 * Si maxVenues change, ce test casse et force une migration correctrice.
 */
const SQL_MAX_VENUES: Record<SubscriptionPlan, number> = {
  starter: 1,
  pro: 2,
  business: 10,
  enterprise: -1, // NULL cote SQL = illimite ; -1 cote TS
};

describe('venue plan-limit parity (TS PLAN_LIMITS vs SQL trigger CASE)', () => {
  it('maxVenues TS == plafond SQL pour chaque plan (non-trial)', () => {
    (Object.keys(SQL_MAX_VENUES) as SubscriptionPlan[]).forEach((plan) => {
      const ts = getPlanLimits(plan, 'active', null).maxVenues;
      expect(ts).toBe(SQL_MAX_VENUES[plan]);
    });
  });

  it('trial actif = plafond pro (2) meme sur starter', () => {
    const future = new Date(Date.now() + 30 * 864e5).toISOString();
    expect(getPlanLimits('starter', 'trial', future).maxVenues).toBe(2);
  });
});
```

- [ ] **Step 3: Lancer le test**

Run: `pnpm test src/lib/plans/__tests__/venues-entitlement-parity.test.ts`
Expected: PASS (la matrice TS actuelle correspond deja au CASE SQL).

- [ ] **Step 4: Commit (migration NON appliquee ici)**

La migration sera appliquee en prod par l utilisateur apres merge (via MCP `apply_migration` ou `supabase db push`), pas pendant l implementation. Note : additive et sans risque (nouveau trigger).

```bash
git add supabase/migrations/20260717120000_venues_plan_limit_trigger.sql src/lib/plans/__tests__/venues-entitlement-parity.test.ts
git commit -m "feat(espaces): trigger SQL de limite venues + test de parite TS<->SQL"
```

---

### Task 6: UI - route settings/espaces + EspacesManager + i18n + entree onglet

**Files:**

- Create: `src/app/sites/[site]/admin/settings/espaces/page.tsx` (Server)
- Create: `src/app/sites/[site]/admin/settings/espaces/loading.tsx`
- Create: `src/components/admin/settings/EspacesManager.tsx` (Client)
- Modify: `src/lib/settings-tabs.ts` (ajouter `'espaces'` a la liste - pour la coherence du type d onglet)
- Modify: `src/components/admin/settings/SettingsForm.tsx` (ajouter l onglet "Espaces" qui NAVIGUE vers la route dediee)
- Modify: `src/messages/fr-FR.json` et `src/messages/en-US.json` (namespace `espaces` + cle onglet `settings.tabEspaces`)

**Interfaces:**

- Consumes: actions de Task 4 (`actionCreateVenue`, `actionRenameVenue`, `actionDeactivateVenue`); `getPlanLimits` de `@/lib/plans/features`; `getTenant` de `@/lib/cache`; `requireAdminPermission` de `@/lib/auth/require-admin-permission`.
- Produces: type `EspaceRow = { id: string; name: string; is_active: boolean; created_at: string; tableCount: number }` (defini dans `EspacesManager.tsx` et importe par la page).

- [ ] **Step 1: Ecrire le composant client EspacesManager**

```tsx
// src/components/admin/settings/EspacesManager.tsx
'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Power, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { actionCreateVenue, actionRenameVenue, actionDeactivateVenue } from '@/app/actions/venues';

export type EspaceRow = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  tableCount: number;
};

interface EspacesManagerProps {
  espaces: EspaceRow[];
  /** Nombre max autorise par le plan (-1 = illimite). */
  maxEspaces: number;
  /** Nombre d espaces actifs (compte pour le paywall). */
  activeCount: number;
  /** URL de l abonnement pour l upsell. */
  subscriptionUrl: string;
}

export function EspacesManager({
  espaces,
  maxEspaces,
  activeCount,
  subscriptionUrl,
}: EspacesManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  const atLimit = maxEspaces !== -1 && activeCount >= maxEspaces;
  const activeEspaces = espaces.filter((e) => e.is_active);
  // "Principal" = le plus ancien espace (aucune colonne is_default en base).
  const principalId = [...espaces].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.id;

  function handleAdd() {
    startTransition(async () => {
      const res = await actionCreateVenue({ name: addName });
      if (res.success) {
        toast.success('Espace cree.');
        setAddOpen(false);
        setAddName('');
        window.location.reload();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleRename() {
    if (!renameId) return;
    startTransition(async () => {
      const res = await actionRenameVenue({ id: renameId, name: renameName });
      if (res.success) {
        toast.success('Espace renomme.');
        setRenameId(null);
        window.location.reload();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDeactivate(id: string) {
    if (activeEspaces.length < 2) {
      toast.error('Impossible de desactiver le dernier espace.');
      return;
    }
    startTransition(async () => {
      const res = await actionDeactivateVenue({ id });
      if (res.success) {
        toast.success('Espace desactive.');
        window.location.reload();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="h-full flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-app-text">
            Espaces de restauration
          </h2>
          <p className="mt-1 text-sm text-app-text-secondary">
            Un espace = un lieu de service avec sa carte. Panorama, lobby bar, pool...
          </p>
        </div>
        {atLimit ? (
          <div className="flex flex-col items-end gap-1">
            <Button disabled className="min-h-[44px]">
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un espace
            </Button>
            <a href={subscriptionUrl} className="text-xs text-status-info hover:underline">
              Limite du plan atteinte. Passer au plan superieur
            </a>
          </div>
        ) : (
          <Button className="min-h-[44px]" onClick={() => setAddOpen(true)} disabled={isPending}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter un espace
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 content-start">
        {espaces.map((e) => (
          <Card key={e.id} className="p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-app-text truncate">{e.name}</p>
                <p className="text-xs text-app-text-secondary">
                  {e.tableCount} table{e.tableCount > 1 ? 's' : ''}
                  {!e.is_active ? ' - inactif' : ''}
                </p>
              </div>
              {e.id === principalId && (
                <span className="shrink-0 rounded-full bg-status-info-bg px-2 py-0.5 text-xs text-status-info">
                  Principal
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() => {
                  setRenameId(e.id);
                  setRenameName(e.name);
                }}
                disabled={isPending}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Renommer
              </Button>
              {e.is_active &&
                (e.id === principalId && activeEspaces.length < 2 ? (
                  <Button variant="ghost" size="sm" className="min-h-[44px]" disabled>
                    <Lock className="mr-2 h-3.5 w-3.5" />
                    Requis
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-[44px]"
                    onClick={() => handleDeactivate(e.id)}
                    disabled={isPending}
                  >
                    <Power className="mr-2 h-3.5 w-3.5" />
                    Desactiver
                  </Button>
                ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Dialog Ajouter */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvel espace</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="espace-name">Nom de l espace</Label>
            <Input
              id="espace-name"
              value={addName}
              onChange={(ev) => setAddName(ev.target.value)}
              placeholder="Panorama, lobby bar, pool..."
              maxLength={60}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={isPending}>
              Annuler
            </Button>
            <Button onClick={handleAdd} disabled={isPending || addName.trim().length === 0}>
              Creer l espace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Renommer */}
      <Dialog open={renameId !== null} onOpenChange={(o) => !o && setRenameId(null)}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renommer l espace</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="espace-rename">Nom de l espace</Label>
            <Input
              id="espace-rename"
              value={renameName}
              onChange={(ev) => setRenameName(ev.target.value)}
              maxLength={60}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameId(null)} disabled={isPending}>
              Annuler
            </Button>
            <Button onClick={handleRename} disabled={isPending || renameName.trim().length === 0}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

Note ASCII : ne pas utiliser d apostrophe typographique. "l espace" est volontaire (espace insecable non requis). Verifier apres coup avec `pnpm lint`.

- [ ] **Step 2: Ecrire la page serveur (miroir de settings/tables/page.tsx)**

```tsx
// src/app/sites/[site]/admin/settings/espaces/page.tsx
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { redirectToLogin } from '@/lib/auth/redirect-to-main';
import { requireAdminPermission } from '@/lib/auth/require-admin-permission';
import { getPlanLimits } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { EspacesManager, type EspaceRow } from '@/components/admin/settings/EspacesManager';

export const dynamic = 'force-dynamic';

export default async function EspacesPage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  await requireAdminPermission(site, 'settings.view');
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirectToLogin();

  const tenant = await getTenant(site);
  if (!tenant) redirectToLogin();

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenant.id)
    .single();
  if (!adminUser) redirectToLogin();

  const tenantId = tenant.id;

  // Espaces (venues) du tenant + nb de tables par espace.
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, is_active, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  const venueIds = (venues ?? []).map((v) => v.id);

  // Compte des tables par venue via zones -> tables (une requete groupee simple).
  const tableCounts = new Map<string, number>();
  if (venueIds.length > 0) {
    const { data: zones } = await supabase
      .from('zones')
      .select('id, venue_id')
      .in('venue_id', venueIds);
    const zoneToVenue = new Map((zones ?? []).map((z) => [z.id as string, z.venue_id as string]));
    const zoneIds = [...zoneToVenue.keys()];
    if (zoneIds.length > 0) {
      const { data: tables } = await supabase
        .from('tables')
        .select('zone_id')
        .in('zone_id', zoneIds);
      for (const tbl of tables ?? []) {
        const vId = zoneToVenue.get(tbl.zone_id as string);
        if (vId) tableCounts.set(vId, (tableCounts.get(vId) ?? 0) + 1);
      }
    }
  }

  const espaces: EspaceRow[] = (venues ?? []).map((v) => ({
    id: v.id as string,
    name: v.name as string,
    is_active: v.is_active as boolean,
    created_at: v.created_at as string,
    tableCount: tableCounts.get(v.id as string) ?? 0,
  }));

  const limits = getPlanLimits(
    tenant.subscription_plan as SubscriptionPlan | null,
    tenant.subscription_status as SubscriptionStatus | null,
    tenant.trial_ends_at,
  );
  const activeCount = espaces.filter((e) => e.is_active).length;

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full">
      <EspacesManager
        espaces={espaces}
        maxEspaces={limits.maxVenues}
        activeCount={activeCount}
        subscriptionUrl={`/sites/${site}/admin/subscription`}
      />
    </div>
  );
}
```

- [ ] **Step 3: Ecrire loading.tsx (copier le pattern de settings/tables/loading.tsx)**

```tsx
// src/app/sites/[site]/admin/settings/espaces/loading.tsx
export default function Loading() {
  return (
    <div className="flex-1 min-h-0 flex flex-col w-full p-4 sm:p-6">
      <div className="h-6 w-48 rounded bg-app-border/40 animate-pulse" />
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-lg bg-app-border/30 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Ajouter l onglet dans settings-tabs.ts**

Dans `src/lib/settings-tabs.ts`, ajouter `'espaces'` a `SETTINGS_TABS` :

```typescript
const SETTINGS_TABS = [
  'identity',
  'branding',
  'billing',
  'hours',
  'sounds',
  'security',
  'contact',
  'espaces',
] as const;
```

- [ ] **Step 5: Cabler l onglet "Espaces" dans SettingsForm (navigation vers la route dediee)**

Dans `src/components/admin/settings/SettingsForm.tsx` :

5a. Ajouter l entree onglet a `TAB_CONFIG` :

```typescript
const TAB_CONFIG: { key: SettingsTab; labelKey: string }[] = [
  { key: 'identity', labelKey: 'tabIdentity' },
  { key: 'branding', labelKey: 'tabBranding' },
  { key: 'billing', labelKey: 'tabBilling' },
  { key: 'hours', labelKey: 'tabHours' },
  { key: 'sounds', labelKey: 'tabSounds' },
  { key: 'security', labelKey: 'tabSecurity' },
  { key: 'contact', labelKey: 'tabContact' },
  { key: 'espaces', labelKey: 'tabEspaces' },
];
```

5b. Dans `handleTabChange`, faire en sorte que "espaces" navigue vers la route dediee (il n a pas de contenu inline) :

```typescript
const handleTabChange = useCallback(
  (value: string) => {
    if (value === 'espaces') {
      router.push(`${pathname}/espaces`);
      return;
    }
    const params = new URLSearchParams();
    if (value !== 'identity') {
      params.set('tab', value);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  },
  [router, pathname],
);
```

(Aucun `TabsContent value="espaces"` n est ajoute : cliquer l onglet quitte le formulaire vers `/settings/espaces`.)

- [ ] **Step 6: Ajouter les cles i18n**

Dans `src/messages/fr-FR.json`, sous le namespace `settings`, ajouter la cle d onglet :

```json
"tabEspaces": "Espaces"
```

Dans `src/messages/en-US.json`, sous `settings` :

```json
"tabEspaces": "Spaces"
```

(Les libelles internes du composant EspacesManager sont en dur en francais dans cette version du socle - coherent avec d autres ecrans admin recents ; une extraction i18n complete pourra suivre. Verifier qu aucune regle ESLint i18n ne bloque : si `pnpm lint` exige `useTranslations`, extraire les chaines du manager dans un namespace `espaces` fr+en. Voir Step 8.)

- [ ] **Step 7: Typecheck + lint + build**

Run: `pnpm typecheck && pnpm lint --max-warnings 0`
Expected: 0 erreur, 0 warning. Si le lint exige l i18n sur les chaines du manager, passer au Step 8 ; sinon sauter au Step 9.

- [ ] **Step 8: (Conditionnel) Extraire les chaines du manager en i18n**

Si et seulement si le Step 7 signale des chaines non traduites : ajouter un namespace `espaces` dans `fr-FR.json` et `en-US.json` avec les cles (`title`, `subtitle`, `add`, `create`, `rename`, `deactivate`, `required`, `principal`, `limitReached`, `newSpace`, `nameLabel`, `namePlaceholder`, `cancel`, `save`, `tablesCount`, `inactive`, `toastCreated`, `toastRenamed`, `toastDeactivated`, `toastLastSpace`), puis remplacer les chaines en dur du manager par `const t = useTranslations('espaces');` et `t('cle')`. Re-lancer le Step 7.

- [ ] **Step 9: Build**

Run: `pnpm build`
Expected: `build: OK` (compile sans erreur).

- [ ] **Step 10: Verification visuelle OBLIGATOIRE (regle 11-deploy-visual-safety)**

Dev local avec `ALLOW_DEV_AUTH_BYPASS=true`. Ouvrir `/sites/<slug>/admin/settings`, cliquer l onglet "Espaces" -> doit naviguer vers `/sites/<slug>/admin/settings/espaces`. Verifier aux breakpoints **375, 768, 1024, 1280, 1440** en **dark ET light** :

- Liste des espaces (cartes), badge "Principal" sur le plus ancien.
- Bouton "Ajouter un espace" : actif si sous la limite, desactive + lien upsell si a la limite (tester sur un compte Starter avec 1 espace).
- Dialog Ajouter (nom vide -> bouton desactive), Dialog Renommer.
- "Desactiver" masque/verrouille sur le dernier espace actif.
- Aucun debordement horizontal, un seul scrollable.

Documenter par screenshots. Ne PAS considerer la tache finie sans cette observation (cf regle globale verify-visually).

- [ ] **Step 11: Commit**

```bash
git add src/app/sites/\[site\]/admin/settings/espaces/ src/components/admin/settings/EspacesManager.tsx src/lib/settings-tabs.ts src/components/admin/settings/SettingsForm.tsx src/messages/fr-FR.json src/messages/en-US.json
git commit -m "feat(espaces): ecran de gestion des espaces (route settings/espaces + onglet Parametres)"
```

---

## Self-Review

**Spec coverage :**

- Ecran lister/creer/renommer/desactiver -> Task 6. OK.
- Actions serveur create/rename/deactivate -> Task 4. OK.
- Methodes service + garde propriete -> Task 2. OK.
- Flip copy "etablissement" -> "espace" -> Task 3. OK.
- Belt SQL + test de parite -> Task 5. OK.
- Bouton "Ajouter" desactive + upsell a la limite -> Task 6 Step 1 (`atLimit`). OK.
- Jamais desactiver le dernier espace actif -> Task 2 (service) + Task 6 (garde UI). OK.
- Aucun impact tenants existants -> additif (nouveau trigger, nouvel ecran, defaut inchange). OK.
- Slug NOT NULL gere -> Task 2 (slug unique scope-tenant). OK.

**Placeholder scan :** aucun TODO/FIXME/"a completer". Le Step 8 est conditionnel et entierement specifie (liste des cles). OK.

**Type consistency :** `EspaceRow` defini dans EspacesManager, importe par la page (Task 6). Actions retournent `{ success: true, data } | { success: false, error }` (Task 4) et le manager les consomme via `res.success`/`res.data`/`res.error`. `createVenue` retourne `{ id, name, slug }` (Task 2) == data attendu par l action (Task 4). `maxVenues` (-1 = illimite) coherent TS (Task 5) et UI `maxEspaces !== -1` (Task 6). OK.

**Decision UX a valider par l utilisateur (non bloquante) :** l onglet "Espaces" NAVIGUE vers une route dediee plutot que d afficher du contenu inline (evite d imbriquer un manager avec dialogs dans le `<form>` des parametres). Alternative possible : contenu inline dans un `TabsContent`. Choix par defaut = route dediee (plus sur). L utilisateur peut demander l inline.
