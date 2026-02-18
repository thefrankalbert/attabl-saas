# Multi-Restaurant Owner Hub — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable restaurant owners to manage multiple establishments from a centralized hub with KPIs, and add new restaurants via a step-by-step wizard.

**Architecture:** New `restaurant_groups` table links owners to their restaurants. Login flow detects multi-tenant owners and redirects to the hub. Hub uses a single PostgreSQL RPC (`get_owner_dashboard`) for all KPIs. Wizard creates new restaurants via a dedicated API endpoint.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + RLS), TanStack Query, Zod, Tailwind CSS v4 + shadcn/ui, TypeScript 5 strict.

---

## Task 1: Database Migration — `restaurant_groups` table + RLS + RPC

**Files:**

- Create: `supabase/migrations/20260218_restaurant_groups.sql`

**Step 1: Write the migration SQL file**

```sql
-- supabase/migrations/20260218_restaurant_groups.sql
-- Multi-Restaurant Owner Hub: restaurant_groups table, RLS, RPC, data migration

-- ─── 1. Create restaurant_groups table ──────────────────────
CREATE TABLE restaurant_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Mon Groupe',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_groups_owner_unique UNIQUE (owner_user_id)
);

CREATE INDEX idx_restaurant_groups_owner ON restaurant_groups(owner_user_id);

-- ─── 2. Add group_id to tenants ─────────────────────────────
ALTER TABLE tenants ADD COLUMN group_id uuid REFERENCES restaurant_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_tenants_group_id ON tenants(group_id);

-- ─── 3. RLS on restaurant_groups ────────────────────────────
ALTER TABLE restaurant_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_can_select_own_group"
  ON restaurant_groups FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE POLICY "owner_can_insert_own_group"
  ON restaurant_groups FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "owner_can_update_own_group"
  ON restaurant_groups FOR UPDATE
  USING (owner_user_id = auth.uid());

-- Service role bypass for admin operations (signup, API routes)
CREATE POLICY "service_role_full_access"
  ON restaurant_groups FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 4. Additional tenant policy for group owners ───────────
CREATE POLICY "group_owner_can_read_tenants"
  ON tenants FOR SELECT
  USING (
    group_id IN (
      SELECT id FROM restaurant_groups WHERE owner_user_id = auth.uid()
    )
  );

-- ─── 5. RPC: get_owner_dashboard ────────────────────────────
CREATE OR REPLACE FUNCTION get_owner_dashboard(p_user_id uuid)
RETURNS TABLE(
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  tenant_plan text,
  tenant_status text,
  tenant_logo_url text,
  tenant_is_active boolean,
  orders_today bigint,
  revenue_today numeric,
  orders_month bigint,
  revenue_month numeric
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    t.id,
    t.name,
    t.slug,
    t.subscription_plan,
    t.subscription_status,
    t.logo_url,
    t.is_active,
    COUNT(o.id) FILTER (WHERE o.created_at >= CURRENT_DATE),
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= CURRENT_DATE), 0),
    COUNT(o.id) FILTER (WHERE o.created_at >= date_trunc('month', CURRENT_DATE)),
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at >= date_trunc('month', CURRENT_DATE)), 0)
  FROM restaurant_groups g
  JOIN tenants t ON t.group_id = g.id
  LEFT JOIN orders o ON o.tenant_id = t.id
  WHERE g.owner_user_id = p_user_id
  GROUP BY t.id, t.name, t.slug, t.subscription_plan, t.subscription_status, t.logo_url, t.is_active
  ORDER BY t.name;
$$;

-- ─── 6. Migrate existing data ──────────────────────────────
-- Create groups for existing owners
INSERT INTO restaurant_groups (owner_user_id, name)
SELECT DISTINCT au.user_id, 'Mon Groupe'
FROM admin_users au
JOIN tenants t ON t.id = au.tenant_id
WHERE t.group_id IS NULL
  AND au.role IN ('owner', 'superadmin')
  AND NOT EXISTS (
    SELECT 1 FROM restaurant_groups rg WHERE rg.owner_user_id = au.user_id
  );

-- Link existing tenants to their owner's group
UPDATE tenants t
SET group_id = rg.id
FROM admin_users au
JOIN restaurant_groups rg ON rg.owner_user_id = au.user_id
WHERE t.id = au.tenant_id
  AND t.group_id IS NULL
  AND au.role IN ('owner', 'superadmin');
```

**Step 2: Apply the migration**

Run: `pnpm db:migrate`
Expected: Migration applied successfully. Check Supabase dashboard to verify:

- `restaurant_groups` table exists with RLS enabled
- `tenants.group_id` column exists
- `get_owner_dashboard` function exists
- Existing tenants have `group_id` populated

**Step 3: Commit**

```bash
git add supabase/migrations/20260218_restaurant_groups.sql
git commit -m "feat: add restaurant_groups table with RLS and owner dashboard RPC"
```

---

## Task 2: TypeScript Types for `restaurant_groups`

**Files:**

- Create: `src/types/restaurant-group.types.ts`

**Step 1: Create the types file**

```typescript
// src/types/restaurant-group.types.ts

export interface RestaurantGroup {
  id: string;
  owner_user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface OwnerDashboardRow {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_plan: string | null;
  tenant_status: string | null;
  tenant_logo_url: string | null;
  tenant_is_active: boolean;
  orders_today: number;
  revenue_today: number;
  orders_month: number;
  revenue_month: number;
}

export interface OwnerDashboardGlobals {
  totalRestaurants: number;
  totalOrdersToday: number;
  totalRevenueToday: number;
  totalOrdersMonth: number;
  totalRevenueMonth: number;
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors

**Step 3: Commit**

```bash
git add src/types/restaurant-group.types.ts
git commit -m "feat: add TypeScript types for restaurant_groups and owner dashboard"
```

---

## Task 3: Zod Schemas for Restaurant Creation Wizard

**Files:**

- Create: `src/lib/validations/restaurant.schema.ts`
- Create: `src/lib/validations/__tests__/restaurant.schema.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/validations/__tests__/restaurant.schema.test.ts
import { describe, it, expect } from 'vitest';
import {
  createRestaurantStep1Schema,
  createRestaurantStep2Schema,
  createRestaurantSchema,
} from '../restaurant.schema';

describe('createRestaurantStep1Schema', () => {
  it('accepts valid step 1 input', () => {
    const result = createRestaurantStep1Schema.safeParse({
      name: 'Le Radisson',
      type: 'restaurant',
      slug: 'le-radisson',
    });
    expect(result.success).toBe(true);
  });

  it('rejects name shorter than 2 characters', () => {
    const result = createRestaurantStep1Schema.safeParse({
      name: 'A',
      type: 'restaurant',
      slug: 'a',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid establishment type', () => {
    const result = createRestaurantStep1Schema.safeParse({
      name: 'Le Radisson',
      type: 'nightclub',
      slug: 'le-radisson',
    });
    expect(result.success).toBe(false);
  });

  it('rejects slug with uppercase or special characters', () => {
    const result = createRestaurantStep1Schema.safeParse({
      name: 'Le Radisson',
      type: 'restaurant',
      slug: 'Le Radisson!',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid establishment types', () => {
    const types = [
      'restaurant',
      'hotel',
      'bar-cafe',
      'boulangerie',
      'dark-kitchen',
      'food-truck',
      'quick-service',
    ];
    for (const type of types) {
      const result = createRestaurantStep1Schema.safeParse({
        name: 'Test',
        type,
        slug: 'test',
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('createRestaurantStep2Schema', () => {
  it('accepts trial plan', () => {
    const result = createRestaurantStep2Schema.safeParse({ plan: 'trial' });
    expect(result.success).toBe(true);
  });

  it('accepts essentiel plan', () => {
    const result = createRestaurantStep2Schema.safeParse({ plan: 'essentiel' });
    expect(result.success).toBe(true);
  });

  it('accepts premium plan', () => {
    const result = createRestaurantStep2Schema.safeParse({ plan: 'premium' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid plan', () => {
    const result = createRestaurantStep2Schema.safeParse({ plan: 'enterprise' });
    expect(result.success).toBe(false);
  });
});

describe('createRestaurantSchema (merged)', () => {
  it('accepts complete valid input', () => {
    const result = createRestaurantSchema.safeParse({
      name: 'Le Radisson',
      type: 'hotel',
      slug: 'le-radisson',
      plan: 'premium',
    });
    expect(result.success).toBe(true);
  });

  it('rejects input missing plan', () => {
    const result = createRestaurantSchema.safeParse({
      name: 'Le Radisson',
      type: 'hotel',
      slug: 'le-radisson',
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/validations/__tests__/restaurant.schema.test.ts`
Expected: FAIL — module not found

**Step 3: Write the schema implementation**

```typescript
// src/lib/validations/restaurant.schema.ts
import { z } from 'zod';

export const ESTABLISHMENT_TYPES = [
  'restaurant',
  'hotel',
  'bar-cafe',
  'boulangerie',
  'dark-kitchen',
  'food-truck',
  'quick-service',
] as const;

export const PLAN_OPTIONS = ['trial', 'essentiel', 'premium'] as const;

export const createRestaurantStep1Schema = z.object({
  name: z.string().min(2, 'Minimum 2 caractères').max(100, 'Maximum 100 caractères'),
  type: z.enum(ESTABLISHMENT_TYPES, {
    errorMap: () => ({ message: "Type d'établissement invalide" }),
  }),
  slug: z
    .string()
    .min(2, 'Minimum 2 caractères')
    .max(50, 'Maximum 50 caractères')
    .regex(/^[a-z0-9-]+$/, 'Slug invalide : lettres minuscules, chiffres et tirets uniquement'),
});

export const createRestaurantStep2Schema = z.object({
  plan: z.enum(PLAN_OPTIONS, {
    errorMap: () => ({ message: 'Plan invalide' }),
  }),
});

export const createRestaurantSchema = createRestaurantStep1Schema.merge(
  createRestaurantStep2Schema,
);

export type CreateRestaurantStep1Input = z.infer<typeof createRestaurantStep1Schema>;
export type CreateRestaurantStep2Input = z.infer<typeof createRestaurantStep2Schema>;
export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/validations/__tests__/restaurant.schema.test.ts`
Expected: PASS — all 10 tests pass

**Step 5: Commit**

```bash
git add src/lib/validations/restaurant.schema.ts src/lib/validations/__tests__/restaurant.schema.test.ts
git commit -m "feat: add Zod schemas for restaurant creation wizard with tests"
```

---

## Task 4: Restaurant Group Service

**Files:**

- Create: `src/services/restaurant-group.service.ts`
- Create: `src/services/__tests__/restaurant-group.service.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/services/__tests__/restaurant-group.service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createRestaurantGroupService } from '../restaurant-group.service';

function createMockSupabase(
  options: {
    groupExists?: boolean;
    groupInsertError?: boolean;
    tenantInsertError?: boolean;
    adminInsertError?: boolean;
    slugExists?: boolean;
  } = {},
) {
  const tableResponses: Record<string, Record<string, unknown>> = {
    restaurant_groups: options.groupInsertError
      ? { data: null, error: { message: 'Insert failed' } }
      : { data: { id: 'group-123', owner_user_id: 'user-abc' }, error: null },
    tenants: options.tenantInsertError
      ? { data: null, error: { message: 'Tenant insert failed' } }
      : {
          data: { id: 'tenant-xyz', slug: 'le-radisson', name: 'Le Radisson' },
          error: null,
        },
    admin_users: options.adminInsertError
      ? { error: { message: 'Admin insert failed' } }
      : { error: null },
    venues: { error: null },
  };

  const from = vi.fn((table: string) => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue(
            table === 'restaurant_groups'
              ? options.groupExists
                ? { data: { id: 'group-123', owner_user_id: 'user-abc' }, error: null }
                : { data: null, error: { code: 'PGRST116' } }
              : table === 'tenants'
                ? options.slugExists
                  ? { data: { slug: 'le-radisson' }, error: null }
                  : { data: null, error: { code: 'PGRST116' } }
                : { data: null, error: null },
          ),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(tableResponses[table] || { data: null, error: null }),
      }),
      ...tableResponses[table],
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  }));

  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('restaurant-group.service', () => {
  describe('getOrCreateGroup', () => {
    it('returns existing group if one exists', async () => {
      const supabase = createMockSupabase({ groupExists: true });
      const service = createRestaurantGroupService(supabase);
      const group = await service.getOrCreateGroup('user-abc');
      expect(group.id).toBe('group-123');
    });

    it('creates a new group if none exists', async () => {
      const supabase = createMockSupabase({ groupExists: false });
      const service = createRestaurantGroupService(supabase);
      const group = await service.getOrCreateGroup('user-abc');
      expect(group.id).toBe('group-123');
      expect(supabase.from).toHaveBeenCalledWith('restaurant_groups');
    });

    it('throws on insert error', async () => {
      const supabase = createMockSupabase({ groupExists: false, groupInsertError: true });
      const service = createRestaurantGroupService(supabase);
      await expect(service.getOrCreateGroup('user-abc')).rejects.toThrow('Insert failed');
    });
  });

  describe('addRestaurantToGroup', () => {
    it('creates tenant, admin_user, and venue', async () => {
      const supabase = createMockSupabase({ groupExists: true });
      const service = createRestaurantGroupService(supabase);
      const result = await service.addRestaurantToGroup({
        groupId: 'group-123',
        userId: 'user-abc',
        email: 'owner@test.com',
        name: 'Le Radisson',
        slug: 'le-radisson',
        type: 'hotel',
        plan: 'premium',
      });
      expect(result.tenantId).toBe('tenant-xyz');
      expect(result.slug).toBe('le-radisson');
    });

    it('throws on tenant insert error', async () => {
      const supabase = createMockSupabase({ groupExists: true, tenantInsertError: true });
      const service = createRestaurantGroupService(supabase);
      await expect(
        service.addRestaurantToGroup({
          groupId: 'group-123',
          userId: 'user-abc',
          email: 'owner@test.com',
          name: 'Le Radisson',
          slug: 'le-radisson',
          type: 'hotel',
          plan: 'premium',
        }),
      ).rejects.toThrow('Tenant insert failed');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/services/__tests__/restaurant-group.service.test.ts`
Expected: FAIL — module not found

**Step 3: Write the service implementation**

```typescript
// src/services/restaurant-group.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';

interface AddRestaurantInput {
  groupId: string;
  userId: string;
  email: string;
  name: string;
  slug: string;
  type: string;
  plan: string;
}

interface AddRestaurantResult {
  tenantId: string;
  slug: string;
}

/**
 * Restaurant group service — manages owner groups and adding restaurants.
 *
 * Each owner has exactly one group. All their restaurants belong to that group.
 * The group is created automatically on first signup or first restaurant addition.
 */
export function createRestaurantGroupService(supabase: SupabaseClient) {
  return {
    /**
     * Get the owner's existing group, or create one if it doesn't exist.
     * Idempotent: safe to call multiple times.
     */
    async getOrCreateGroup(userId: string): Promise<{ id: string }> {
      // Try to find existing group
      const { data: existing } = await supabase
        .from('restaurant_groups')
        .select('id')
        .eq('owner_user_id', userId)
        .single();

      if (existing) {
        return { id: existing.id };
      }

      // Create new group
      const { data: created, error } = await supabase
        .from('restaurant_groups')
        .insert({ owner_user_id: userId, name: 'Mon Groupe' })
        .select('id')
        .single();

      if (error || !created) {
        throw new ServiceError(
          `Erreur création groupe: ${error?.message || 'Données manquantes'}`,
          'INTERNAL',
          error,
        );
      }

      return { id: created.id };
    },

    /**
     * Add a new restaurant to an existing group.
     *
     * Steps:
     * 1. Create tenant with group_id and trial period
     * 2. Create admin_users entry (role: owner)
     * 3. Create default venue (best-effort)
     */
    async addRestaurantToGroup(input: AddRestaurantInput): Promise<AddRestaurantResult> {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      // 1. Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          slug: input.slug,
          name: input.name,
          group_id: input.groupId,
          subscription_plan: input.plan === 'trial' ? 'essentiel' : input.plan,
          subscription_status: input.plan === 'trial' ? 'trial' : 'pending',
          trial_ends_at: input.plan === 'trial' ? trialEndsAt.toISOString() : null,
          is_active: true,
        })
        .select('id, slug')
        .single();

      if (tenantError || !tenant) {
        throw new ServiceError(
          `Erreur création restaurant: ${tenantError?.message || 'Données manquantes'}`,
          'INTERNAL',
          tenantError,
        );
      }

      // 2. Create admin_users entry (rollback tenant on failure)
      const { error: adminError } = await supabase.from('admin_users').insert({
        tenant_id: tenant.id,
        user_id: input.userId,
        email: input.email,
        full_name: input.name,
        role: 'owner',
        is_active: true,
      });

      if (adminError) {
        await supabase.from('tenants').delete().eq('id', tenant.id);
        throw new ServiceError(
          `Erreur création admin: ${adminError.message}`,
          'INTERNAL',
          adminError,
        );
      }

      // 3. Create default venue (best-effort, no rollback)
      await supabase.from('venues').insert({
        tenant_id: tenant.id,
        slug: 'main',
        name: 'Salle principale',
        name_en: 'Main Dining',
        type: input.type,
        is_active: true,
      });

      return { tenantId: tenant.id, slug: tenant.slug };
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test src/services/__tests__/restaurant-group.service.test.ts`
Expected: PASS — all 5 tests pass

**Step 5: Run full test suite**

Run: `pnpm test`
Expected: All 176+ tests pass

**Step 6: Commit**

```bash
git add src/services/restaurant-group.service.ts src/services/__tests__/restaurant-group.service.test.ts
git commit -m "feat: add restaurant-group service with tests"
```

---

## Task 5: Modify Signup Service to Create Groups

**Files:**

- Modify: `src/services/signup.service.ts` (lines 145-176, 188-217)
- Modify: `src/services/__tests__/signup.service.test.ts`

**Step 1: Update signup.service.ts — add group creation to completeEmailSignup**

In `src/services/signup.service.ts`, after line 156 (after `tenant` is created), before line 158 (admin user creation), add group creation:

```typescript
// 3b. Create restaurant group and link tenant
const { data: group } = await supabase
  .from('restaurant_groups')
  .insert({ owner_user_id: userId, name: 'Mon Groupe' })
  .select('id')
  .single();

if (group) {
  await supabase.from('tenants').update({ group_id: group.id }).eq('id', tenant.id);
}
```

Do the same in `completeOAuthSignup` — after line 197 (tenant created), before line 199 (admin user creation):

```typescript
// 2b. Create restaurant group and link tenant
const { data: group } = await supabase
  .from('restaurant_groups')
  .insert({ owner_user_id: input.userId, name: 'Mon Groupe' })
  .select('id')
  .single();

if (group) {
  await supabase.from('tenants').update({ group_id: group.id }).eq('id', tenant.id);
}
```

**Step 2: Update signup service test mock**

In `src/services/__tests__/signup.service.test.ts`, the mock `from()` function needs to handle `restaurant_groups` table. Add `restaurant_groups` to the `tableResponses`:

```typescript
    restaurant_groups: { data: { id: 'group-abc-123' }, error: null },
```

And ensure the `update` mock chain is available (it already should be from the `delete` mock pattern).

**Step 3: Run tests**

Run: `pnpm test src/services/__tests__/signup.service.test.ts`
Expected: All existing signup tests still pass

**Step 4: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/services/signup.service.ts src/services/__tests__/signup.service.test.ts
git commit -m "feat: create restaurant_group automatically during signup"
```

---

## Task 6: TanStack Query Hook — `useOwnerDashboard`

**Files:**

- Create: `src/hooks/queries/useOwnerDashboard.ts`
- Modify: `src/hooks/queries/index.ts`

**Step 1: Create the hook**

```typescript
// src/hooks/queries/useOwnerDashboard.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { OwnerDashboardRow, OwnerDashboardGlobals } from '@/types/restaurant-group.types';

interface OwnerDashboardData {
  restaurants: OwnerDashboardRow[];
  globals: OwnerDashboardGlobals;
}

/**
 * Fetch owner dashboard data via the get_owner_dashboard RPC.
 * Returns per-restaurant KPIs and aggregated globals.
 */
export function useOwnerDashboard(userId: string) {
  return useQuery<OwnerDashboardData>({
    queryKey: ['owner-dashboard', userId],
    queryFn: async () => {
      const supabase = createClient();

      const { data, error } = await supabase.rpc('get_owner_dashboard', {
        p_user_id: userId,
      });

      if (error) {
        throw new Error(`Erreur chargement dashboard: ${error.message}`);
      }

      const restaurants = (data as OwnerDashboardRow[]) || [];

      const globals: OwnerDashboardGlobals = {
        totalRestaurants: restaurants.length,
        totalOrdersToday: restaurants.reduce((sum, r) => sum + Number(r.orders_today), 0),
        totalRevenueToday: restaurants.reduce((sum, r) => sum + Number(r.revenue_today), 0),
        totalOrdersMonth: restaurants.reduce((sum, r) => sum + Number(r.orders_month), 0),
        totalRevenueMonth: restaurants.reduce((sum, r) => sum + Number(r.revenue_month), 0),
      };

      return { restaurants, globals };
    },
    enabled: !!userId,
    refetchInterval: 30_000, // Refresh every 30 seconds
  });
}
```

**Step 2: Add export to index.ts**

Add at the end of `src/hooks/queries/index.ts`:

```typescript
export { useOwnerDashboard } from './useOwnerDashboard';
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/hooks/queries/useOwnerDashboard.ts src/hooks/queries/index.ts
git commit -m "feat: add useOwnerDashboard TanStack Query hook"
```

---

## Task 7: Modify Login Flow — Remove `.single()` Bottleneck

**Files:**

- Modify: `src/components/auth/AuthForm.tsx` (lines 131-166)

**Step 1: Replace the login flow in AuthForm.tsx**

Replace lines 131-166 (inside the `else` block for login flow) with:

```typescript
// Login flow — query all admin_users (supports multi-restaurant)
const { data: adminUsers } = await supabase
  .from('admin_users')
  .select('tenant_id, is_super_admin, role, tenants(slug, onboarding_completed)')
  .eq('user_id', authData.user.id);

if (!adminUsers || adminUsers.length === 0) {
  throw new Error('Aucun restaurant associé à ce compte');
}

// Check if any entry is super admin
const isSuperAdmin = adminUsers.some(
  (au) => au.is_super_admin === true || au.role === 'super_admin',
);

if (isSuperAdmin) {
  window.location.href = '/admin/tenants';
  return;
}

// Multi-restaurant owner → redirect to hub
if (adminUsers.length > 1) {
  window.location.href = '/admin/tenants';
  return;
}

// Single restaurant — direct redirect
const singleAdmin = adminUsers[0];
const tenantsData = singleAdmin.tenants as unknown as {
  slug: string;
  onboarding_completed: boolean;
} | null;

const tenantSlug = tenantsData?.slug;
const onboardingCompleted = tenantsData?.onboarding_completed;

if (!tenantSlug) {
  throw new Error('Restaurant non trouvé');
}

if (onboardingCompleted === false) {
  window.location.href = '/onboarding';
  return;
}

const origin = window.location.origin;
window.location.href = `${origin}/sites/${tenantSlug}/admin`;
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/auth/AuthForm.tsx
git commit -m "feat: support multi-restaurant login flow (remove .single() bottleneck)"
```

---

## Task 8: API Route — `POST /api/restaurants/create`

**Files:**

- Create: `src/app/api/restaurants/create/route.ts`

**Step 1: Create the API route**

```typescript
// src/app/api/restaurants/create/route.ts
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createRestaurantSchema } from '@/lib/validations/restaurant.schema';
import { createRestaurantGroupService } from '@/services/restaurant-group.service';
import { createSlugService } from '@/services/slug.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';

export async function POST(request: Request) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // 2. Parse and validate input
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parseResult = createRestaurantSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => issue.message);
      return NextResponse.json({ error: 'Données invalides', details: errors }, { status: 400 });
    }

    const { name, type, slug: requestedSlug, plan } = parseResult.data;

    // 3. Use admin client for operations that bypass RLS
    const adminSupabase = createAdminClient();
    const slugService = createSlugService(adminSupabase);
    const groupService = createRestaurantGroupService(adminSupabase);

    // 4. Generate unique slug (verify the requested slug is available)
    const slug = await slugService.generateUniqueSlug(requestedSlug);

    // 5. Get or create the owner's group
    const group = await groupService.getOrCreateGroup(user.id);

    // 6. Add restaurant to group
    const result = await groupService.addRestaurantToGroup({
      groupId: group.id,
      userId: user.id,
      email: user.email || '',
      name,
      slug,
      type,
      plan,
    });

    logger.info('Restaurant created', { tenantId: result.tenantId, slug: result.slug });

    return NextResponse.json({
      tenantId: result.tenantId,
      slug: result.slug,
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json({ error: err.message }, { status: serviceErrorToStatus(err.code) });
    }

    logger.error('Restaurant creation failed', err);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/api/restaurants/create/route.ts
git commit -m "feat: add POST /api/restaurants/create endpoint"
```

---

## Task 9: Hub UI — Rewrite `/admin/tenants` Page

**Files:**

- Modify: `src/app/admin/tenants/page.tsx` (complete rewrite)

This task uses the @frontend-design skill for the hub UI implementation.

**Step 1: Rewrite the page**

Replace the entire content of `src/app/admin/tenants/page.tsx` with the new hub that:

- Detects super admin vs owner mode
- Calls `get_owner_dashboard` RPC for owner mode
- Shows global KPI cards (CA jour, CA mois, Commandes today, Nb restaurants)
- Shows per-restaurant cards with individual KPIs
- Has "Gérer →" button that navigates to the restaurant's dashboard
- Has "Ajouter un établissement" dashed card
- Has header with ATTABL logo, user greeting, and logout button
- Falls back to the current super-admin view for is_super_admin users

The page detects the user mode:

1. Check `is_super_admin` → show all tenants (admin mode, keep existing logic)
2. Otherwise → call `get_owner_dashboard` RPC and show owner hub

The owner hub KPI cards show:

- Revenue today (sum of all restaurants)
- Revenue this month (sum of all restaurants)
- Orders today (sum of all restaurants)
- Number of restaurants

Each restaurant card shows:

- Name + slug subdomain
- Plan badge + status badge
- Orders today + revenue today
- "Gérer →" button

Format currency as `XX XXX F` (West African CFA).

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS

**Step 4: Visually verify in browser**

Open: `http://localhost:3000/admin/tenants`
Expected: Hub page with KPI cards, restaurant cards, add button

**Step 5: Commit**

```bash
git add src/app/admin/tenants/page.tsx
git commit -m "feat: rewrite /admin/tenants as multi-restaurant owner hub"
```

---

## Task 10: Add Restaurant Wizard Component

**Files:**

- Create: `src/components/admin/AddRestaurantWizard.tsx`

**Step 1: Create the wizard component**

A 3-step wizard with:

- Step 1: Name + Type (dropdown) + Slug (auto-generated, editable)
- Step 2: Plan selection (Trial / Essentiel / Premium cards)
- Step 3: Summary + Confirm button

Each step is validated by its respective Zod schema before "Next" is enabled.
The wizard calls `POST /api/restaurants/create` on confirmation.
On success: redirect to `/onboarding` for the new restaurant.

The wizard component receives an `onClose` callback to dismiss.
It uses `useState` for step tracking and form data.
It calls the schemas directly for per-step validation.

Slug is auto-generated from name using a simple function:

```typescript
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/AddRestaurantWizard.tsx
git commit -m "feat: add 3-step restaurant creation wizard component"
```

---

## Task 11: Integrate Wizard into Hub Page

**Files:**

- Modify: `src/app/admin/tenants/page.tsx`

**Step 1: Add wizard state and import**

Add `import { AddRestaurantWizard } from '@/components/admin/AddRestaurantWizard';` and a `showWizard` state variable. When the "Ajouter" card is clicked, set `showWizard = true`. Render the wizard as an overlay/modal when `showWizard` is true.

On wizard close/success, `setShowWizard(false)` and refetch the dashboard data.

**Step 2: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Visually verify wizard flow**

1. Open `http://localhost:3000/admin/tenants`
2. Click "Ajouter un établissement"
3. Fill Step 1 (name, type, slug)
4. Select plan in Step 2
5. Review and confirm in Step 3

**Step 4: Commit**

```bash
git add src/app/admin/tenants/page.tsx
git commit -m "feat: integrate restaurant wizard into owner hub"
```

---

## Task 12: Final Verification — All CI Gates

**Files:** None (verification only)

**Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS, 0 errors

**Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS, 0 errors, 0 warnings

**Step 3: Run format check**

Run: `pnpm format:check`
Expected: PASS. If FAIL, run `pnpm format` then re-check.

**Step 4: Run all tests**

Run: `pnpm test`
Expected: All tests pass (166 existing + ~15 new = ~181 tests)

**Step 5: Run build**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 6: Commit any formatting fixes**

If `pnpm format` made changes:

```bash
git add -A
git commit -m "style: format cleanup for multi-restaurant hub"
```

**Step 7: Push and verify CI**

```bash
git push origin claude/adoring-davinci
```

Expected: GitHub Actions CI passes all 5 quality gates
