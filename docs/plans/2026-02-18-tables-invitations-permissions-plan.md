# Tables, Invitations & Permissions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add table configuration (onboarding + admin page), email invitation system with magic links, and granular role permissions with a per-tenant override matrix.

**Architecture:** The onboarding gains a new step 2 (tables) that creates zones + tables in DB. A dedicated admin page provides full CRUD. Invitations use a `invitations` table with crypto tokens + Resend emails. Permissions use a default matrix with tenant-level (`role_permissions`) and individual-level (`custom_permissions`) overrides, resolved via a `hasPermission()` helper.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + RLS), Resend (transactional email), Zod, TanStack Query, Tailwind CSS v4 + shadcn/ui, TypeScript 5 strict.

---

## Task 1: Database Migration — `invitations`, `role_permissions`, `custom_permissions`

**Files:**

- Create: `supabase/migrations/20260218_invitations_permissions.sql`

**Step 1: Write the migration SQL file**

```sql
-- supabase/migrations/20260218_invitations_permissions.sql
-- Tables, Invitations & Permissions: new tables + column

-- ─── 1. Invitations table ─────────────────────────────────
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'chef', 'waiter')),
  custom_permissions JSONB,
  invited_by UUID NOT NULL REFERENCES admin_users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_tenant ON invitations(tenant_id);
CREATE INDEX idx_invitations_email ON invitations(email);

-- RLS for invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_admins_can_view_invitations"
  ON invitations FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "tenant_admins_can_insert_invitations"
  ON invitations FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM admin_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "tenant_admins_can_update_invitations"
  ON invitations FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "service_role_full_access_invitations"
  ON invitations FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 2. Role permissions table ────────────────────────────
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'chef', 'waiter')),
  permissions JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES admin_users(id),
  CONSTRAINT role_permissions_unique UNIQUE (tenant_id, role)
);

-- RLS for role_permissions
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members_can_view_role_permissions"
  ON role_permissions FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "owner_can_manage_role_permissions"
  ON role_permissions FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "service_role_full_access_role_permissions"
  ON role_permissions FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 3. Add custom_permissions to admin_users ─────────────
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT NULL;
```

**Step 2: Commit**

```bash
git add supabase/migrations/20260218_invitations_permissions.sql
git commit -m "feat: add invitations, role_permissions tables and custom_permissions column"
```

---

## Task 2: TypeScript Types — Invitations & Permissions

**Files:**

- Create: `src/types/invitation.types.ts`
- Create: `src/types/permission.types.ts`
- Modify: `src/types/admin.types.ts` (add `custom_permissions` to `AdminUser`)

**Step 1: Create invitation types**

```typescript
// src/types/invitation.types.ts

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface Invitation {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  custom_permissions: Record<string, boolean> | null;
  invited_by: string;
  token: string;
  expires_at: string;
  status: InvitationStatus;
  created_at: string;
  accepted_at: string | null;
}
```

**Step 2: Create permission types**

```typescript
// src/types/permission.types.ts

export const PERMISSION_CODES = [
  'menu.view',
  'menu.edit',
  'orders.view',
  'orders.manage',
  'reports.view',
  'pos.use',
  'inventory.view',
  'inventory.edit',
  'team.view',
  'team.manage',
  'settings.view',
  'settings.edit',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export type PermissionMap = Partial<Record<PermissionCode, boolean>>;

export interface RolePermissions {
  id: string;
  tenant_id: string;
  role: string;
  permissions: PermissionMap;
  updated_at: string;
  updated_by: string | null;
}

export const DEFAULT_PERMISSIONS: Record<string, Record<PermissionCode, boolean>> = {
  owner: {
    'menu.view': true,
    'menu.edit': true,
    'orders.view': true,
    'orders.manage': true,
    'reports.view': true,
    'pos.use': true,
    'inventory.view': true,
    'inventory.edit': true,
    'team.view': true,
    'team.manage': true,
    'settings.view': true,
    'settings.edit': true,
  },
  admin: {
    'menu.view': true,
    'menu.edit': true,
    'orders.view': true,
    'orders.manage': true,
    'reports.view': true,
    'pos.use': true,
    'inventory.view': true,
    'inventory.edit': true,
    'team.view': true,
    'team.manage': true,
    'settings.view': true,
    'settings.edit': true,
  },
  manager: {
    'menu.view': true,
    'menu.edit': true,
    'orders.view': true,
    'orders.manage': true,
    'reports.view': true,
    'pos.use': true,
    'inventory.view': true,
    'inventory.edit': true,
    'team.view': true,
    'team.manage': false,
    'settings.view': false,
    'settings.edit': false,
  },
  cashier: {
    'menu.view': true,
    'menu.edit': false,
    'orders.view': true,
    'orders.manage': true,
    'reports.view': false,
    'pos.use': true,
    'inventory.view': false,
    'inventory.edit': false,
    'team.view': false,
    'team.manage': false,
    'settings.view': false,
    'settings.edit': false,
  },
  chef: {
    'menu.view': true,
    'menu.edit': false,
    'orders.view': true,
    'orders.manage': true,
    'reports.view': false,
    'pos.use': false,
    'inventory.view': true,
    'inventory.edit': false,
    'team.view': false,
    'team.manage': false,
    'settings.view': false,
    'settings.edit': false,
  },
  waiter: {
    'menu.view': true,
    'menu.edit': false,
    'orders.view': true,
    'orders.manage': false,
    'reports.view': false,
    'pos.use': false,
    'inventory.view': false,
    'inventory.edit': false,
    'team.view': false,
    'team.manage': false,
    'settings.view': false,
    'settings.edit': false,
  },
};
```

**Step 3: Add `custom_permissions` to AdminUser interface**

In `src/types/admin.types.ts`, add to the `AdminUser` interface:

```typescript
custom_permissions?: Record<string, boolean> | null;
```

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/invitation.types.ts src/types/permission.types.ts src/types/admin.types.ts
git commit -m "feat: add invitation and permission TypeScript types"
```

---

## Task 3: Permission Helper — `hasPermission()` with Tests

**Files:**

- Create: `src/lib/permissions.ts`
- Create: `src/lib/__tests__/permissions.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/permissions.test.ts
import { describe, it, expect } from 'vitest';
import { hasPermission, getEffectivePermissions } from '../permissions';
import type { AdminUser } from '@/types/admin.types';
import type { RolePermissions } from '@/types/permission.types';

const makeUser = (role: string, custom?: Record<string, boolean> | null): AdminUser =>
  ({
    id: 'u1',
    user_id: 'auth-1',
    tenant_id: 't1',
    email: 'test@test.com',
    role,
    is_active: true,
    created_at: new Date().toISOString(),
    custom_permissions: custom ?? null,
  }) as AdminUser;

const makeRoleOverride = (role: string, perms: Record<string, boolean>): RolePermissions => ({
  id: 'rp1',
  tenant_id: 't1',
  role,
  permissions: perms,
  updated_at: new Date().toISOString(),
  updated_by: null,
});

describe('hasPermission', () => {
  describe('default matrix (no overrides)', () => {
    it('owner has all permissions', () => {
      const user = makeUser('owner');
      expect(hasPermission(user, 'menu.edit')).toBe(true);
      expect(hasPermission(user, 'settings.edit')).toBe(true);
      expect(hasPermission(user, 'team.manage')).toBe(true);
    });

    it('waiter can view menu and orders but not manage orders', () => {
      const user = makeUser('waiter');
      expect(hasPermission(user, 'menu.view')).toBe(true);
      expect(hasPermission(user, 'orders.view')).toBe(true);
      expect(hasPermission(user, 'orders.manage')).toBe(false);
    });

    it('chef can view inventory but not edit it', () => {
      const user = makeUser('chef');
      expect(hasPermission(user, 'inventory.view')).toBe(true);
      expect(hasPermission(user, 'inventory.edit')).toBe(false);
    });

    it('cashier can use POS but not view reports', () => {
      const user = makeUser('cashier');
      expect(hasPermission(user, 'pos.use')).toBe(true);
      expect(hasPermission(user, 'reports.view')).toBe(false);
    });

    it('manager cannot manage team or settings', () => {
      const user = makeUser('manager');
      expect(hasPermission(user, 'team.manage')).toBe(false);
      expect(hasPermission(user, 'settings.edit')).toBe(false);
    });
  });

  describe('role-level overrides', () => {
    it('role override grants permission not in defaults', () => {
      const user = makeUser('waiter');
      const override = makeRoleOverride('waiter', { 'orders.manage': true });
      expect(hasPermission(user, 'orders.manage', override)).toBe(true);
    });

    it('role override revokes permission from defaults', () => {
      const user = makeUser('manager');
      const override = makeRoleOverride('manager', { 'reports.view': false });
      expect(hasPermission(user, 'reports.view', override)).toBe(false);
    });

    it('role override does not affect unspecified permissions', () => {
      const user = makeUser('cashier');
      const override = makeRoleOverride('cashier', { 'reports.view': true });
      expect(hasPermission(user, 'reports.view', override)).toBe(true);
      expect(hasPermission(user, 'pos.use', override)).toBe(true); // default still applies
    });
  });

  describe('individual overrides (custom_permissions)', () => {
    it('individual override takes precedence over role override', () => {
      const user = makeUser('waiter', { 'orders.manage': false });
      const roleOverride = makeRoleOverride('waiter', { 'orders.manage': true });
      expect(hasPermission(user, 'orders.manage', roleOverride)).toBe(false);
    });

    it('individual override takes precedence over defaults', () => {
      const user = makeUser('waiter', { 'inventory.view': true });
      expect(hasPermission(user, 'inventory.view')).toBe(true);
    });

    it('individual override does not affect other permissions', () => {
      const user = makeUser('waiter', { 'inventory.view': true });
      expect(hasPermission(user, 'orders.manage')).toBe(false); // still default
    });
  });

  describe('owner immutability', () => {
    it('owner always has all permissions regardless of overrides', () => {
      const user = makeUser('owner');
      const override = makeRoleOverride('owner', { 'settings.edit': false });
      expect(hasPermission(user, 'settings.edit', override)).toBe(true);
    });
  });

  describe('unknown role', () => {
    it('returns false for unknown role', () => {
      const user = makeUser('unknown_role');
      expect(hasPermission(user, 'menu.view')).toBe(false);
    });
  });
});

describe('getEffectivePermissions', () => {
  it('returns full map for owner', () => {
    const user = makeUser('owner');
    const perms = getEffectivePermissions(user);
    expect(Object.values(perms).every(Boolean)).toBe(true);
  });

  it('merges role overrides into defaults', () => {
    const user = makeUser('waiter');
    const override = makeRoleOverride('waiter', { 'orders.manage': true });
    const perms = getEffectivePermissions(user, override);
    expect(perms['orders.manage']).toBe(true);
    expect(perms['menu.view']).toBe(true);
  });

  it('individual overrides take final precedence', () => {
    const user = makeUser('waiter', { 'orders.manage': false });
    const override = makeRoleOverride('waiter', { 'orders.manage': true });
    const perms = getEffectivePermissions(user, override);
    expect(perms['orders.manage']).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/__tests__/permissions.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/lib/permissions.ts
import type { AdminUser } from '@/types/admin.types';
import {
  DEFAULT_PERMISSIONS,
  PERMISSION_CODES,
  type PermissionCode,
  type PermissionMap,
  type RolePermissions,
} from '@/types/permission.types';

/**
 * Check if an admin user has a specific permission.
 *
 * Resolution order:
 * 1. Individual override (custom_permissions on admin_users) — highest priority
 * 2. Role override (role_permissions per tenant) — medium priority
 * 3. Default matrix (hardcoded) — fallback
 *
 * Owner role always returns true (immutable).
 */
export function hasPermission(
  adminUser: AdminUser,
  permission: PermissionCode,
  roleOverrides?: RolePermissions | null,
): boolean {
  // Owner is immutable — always has all permissions
  if (adminUser.role === 'owner') {
    return true;
  }

  // 1. Check individual override
  if (adminUser.custom_permissions?.[permission] !== undefined) {
    return adminUser.custom_permissions[permission];
  }

  // 2. Check role override for this tenant
  if (roleOverrides?.permissions?.[permission] !== undefined) {
    return roleOverrides.permissions[permission] as boolean;
  }

  // 3. Fall back to default matrix
  const defaults = DEFAULT_PERMISSIONS[adminUser.role];
  if (!defaults) {
    return false;
  }

  return defaults[permission] ?? false;
}

/**
 * Get the full effective permissions map for a user.
 * Useful for UI rendering (show/hide sidebar items, buttons, etc.)
 */
export function getEffectivePermissions(
  adminUser: AdminUser,
  roleOverrides?: RolePermissions | null,
): Record<PermissionCode, boolean> {
  const result = {} as Record<PermissionCode, boolean>;

  for (const perm of PERMISSION_CODES) {
    result[perm] = hasPermission(adminUser, perm, roleOverrides);
  }

  return result;
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/__tests__/permissions.test.ts`
Expected: PASS — all tests pass

**Step 5: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/lib/permissions.ts src/lib/__tests__/permissions.test.ts
git commit -m "feat: add hasPermission helper with 3-level override resolution and tests"
```

---

## Task 4: Zod Schemas — Invitations & Table Configuration

**Files:**

- Create: `src/lib/validations/invitation.schema.ts`
- Create: `src/lib/validations/table-config.schema.ts`
- Create: `src/lib/validations/__tests__/invitation.schema.test.ts`
- Create: `src/lib/validations/__tests__/table-config.schema.test.ts`

**Step 1: Write the failing tests for invitation schema**

```typescript
// src/lib/validations/__tests__/invitation.schema.test.ts
import { describe, it, expect } from 'vitest';
import { createInvitationSchema, acceptInvitationSchema } from '../invitation.schema';

describe('createInvitationSchema', () => {
  it('accepts valid invitation input', () => {
    const result = createInvitationSchema.safeParse({
      email: 'team@restaurant.com',
      role: 'waiter',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = createInvitationSchema.safeParse({
      email: 'not-an-email',
      role: 'waiter',
    });
    expect(result.success).toBe(false);
  });

  it('rejects owner role', () => {
    const result = createInvitationSchema.safeParse({
      email: 'owner@test.com',
      role: 'owner',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all invitable roles', () => {
    const roles = ['admin', 'manager', 'cashier', 'chef', 'waiter'];
    for (const role of roles) {
      const result = createInvitationSchema.safeParse({
        email: 'test@test.com',
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts optional custom_permissions', () => {
    const result = createInvitationSchema.safeParse({
      email: 'test@test.com',
      role: 'waiter',
      custom_permissions: { 'orders.manage': true },
    });
    expect(result.success).toBe(true);
  });
});

describe('acceptInvitationSchema', () => {
  it('accepts valid accept input with password', () => {
    const result = acceptInvitationSchema.safeParse({
      token: 'abc123def456',
      full_name: 'Jean Dupont',
      password: 'SecurePass123!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = acceptInvitationSchema.safeParse({
      token: 'abc',
      full_name: 'Jean',
      password: '123',
    });
    expect(result.success).toBe(false);
  });

  it('accepts without password (existing user)', () => {
    const result = acceptInvitationSchema.safeParse({
      token: 'abc123def456',
    });
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Write the failing tests for table config schema**

```typescript
// src/lib/validations/__tests__/table-config.schema.test.ts
import { describe, it, expect } from 'vitest';
import { zoneSchema, tableConfigSchema, addTablesSchema } from '../table-config.schema';

describe('zoneSchema', () => {
  it('accepts valid zone', () => {
    const result = zoneSchema.safeParse({
      name: 'Interieur',
      prefix: 'INT',
      tableCount: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = zoneSchema.safeParse({
      name: '',
      prefix: 'INT',
      tableCount: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects prefix longer than 5 chars', () => {
    const result = zoneSchema.safeParse({
      name: 'Interieur',
      prefix: 'INTERIEUR',
      tableCount: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero tables', () => {
    const result = zoneSchema.safeParse({
      name: 'Terrasse',
      prefix: 'TER',
      tableCount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional capacity', () => {
    const result = zoneSchema.safeParse({
      name: 'VIP',
      prefix: 'VIP',
      tableCount: 4,
      defaultCapacity: 6,
    });
    expect(result.success).toBe(true);
  });
});

describe('tableConfigSchema', () => {
  it('accepts array of zones', () => {
    const result = tableConfigSchema.safeParse({
      zones: [
        { name: 'Interieur', prefix: 'INT', tableCount: 10 },
        { name: 'Terrasse', prefix: 'TER', tableCount: 8 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty zones array', () => {
    const result = tableConfigSchema.safeParse({ zones: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 zones', () => {
    const zones = Array.from({ length: 21 }, (_, i) => ({
      name: `Zone ${i}`,
      prefix: `Z${i}`,
      tableCount: 1,
    }));
    const result = tableConfigSchema.safeParse({ zones });
    expect(result.success).toBe(false);
  });
});

describe('addTablesSchema', () => {
  it('accepts valid add tables input', () => {
    const result = addTablesSchema.safeParse({
      zone_id: '123e4567-e89b-12d3-a456-426614174000',
      count: 5,
      capacity: 4,
    });
    expect(result.success).toBe(true);
  });

  it('rejects count above 50', () => {
    const result = addTablesSchema.safeParse({
      zone_id: '123e4567-e89b-12d3-a456-426614174000',
      count: 51,
      capacity: 2,
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `pnpm test src/lib/validations/__tests__/invitation.schema.test.ts src/lib/validations/__tests__/table-config.schema.test.ts`
Expected: FAIL — modules not found

**Step 4: Write the invitation schema**

```typescript
// src/lib/validations/invitation.schema.ts
import { z } from 'zod';

const INVITABLE_ROLES = ['admin', 'manager', 'cashier', 'chef', 'waiter'] as const;

export const createInvitationSchema = z.object({
  email: z
    .string()
    .email('Adresse email invalide')
    .max(255, "L'email ne doit pas depasser 255 caracteres"),
  role: z.enum(INVITABLE_ROLES, {
    errorMap: () => ({ message: 'Role invalide (owner ne peut pas etre invite)' }),
  }),
  custom_permissions: z.record(z.string(), z.boolean()).optional(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  full_name: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres').max(100).optional(),
  password: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caracteres')
    .max(100)
    .optional(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
```

**Step 5: Write the table config schema**

```typescript
// src/lib/validations/table-config.schema.ts
import { z } from 'zod';

export const zoneSchema = z.object({
  name: z.string().min(1, 'Le nom de la zone est requis').max(50, 'Maximum 50 caracteres'),
  prefix: z
    .string()
    .min(1, 'Le prefixe est requis')
    .max(5, 'Maximum 5 caracteres')
    .regex(/^[A-Z0-9]+$/, 'Le prefixe doit etre en majuscules (lettres et chiffres)'),
  tableCount: z.number().int().min(1, 'Minimum 1 table').max(100, 'Maximum 100 tables par zone'),
  defaultCapacity: z
    .number()
    .int()
    .min(1, 'Minimum 1 place')
    .max(20, 'Maximum 20 places')
    .optional()
    .default(2),
});

export const tableConfigSchema = z.object({
  zones: z.array(zoneSchema).min(1, 'Au moins une zone est requise').max(20, 'Maximum 20 zones'),
});

export const addTablesSchema = z.object({
  zone_id: z.string().uuid('ID de zone invalide'),
  count: z.number().int().min(1, 'Minimum 1 table').max(50, 'Maximum 50 tables a la fois'),
  capacity: z
    .number()
    .int()
    .min(1, 'Minimum 1 place')
    .max(20, 'Maximum 20 places')
    .optional()
    .default(2),
});

export const updateZoneSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  prefix: z
    .string()
    .min(1)
    .max(5)
    .regex(/^[A-Z0-9]+$/)
    .optional(),
  display_order: z.number().int().min(0).optional(),
});

export const updateTableSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  capacity: z.number().int().min(1).max(20).optional(),
  is_active: z.boolean().optional(),
});

export type ZoneInput = z.infer<typeof zoneSchema>;
export type TableConfigInput = z.infer<typeof tableConfigSchema>;
export type AddTablesInput = z.infer<typeof addTablesSchema>;
```

**Step 6: Run tests to verify they pass**

Run: `pnpm test src/lib/validations/__tests__/invitation.schema.test.ts src/lib/validations/__tests__/table-config.schema.test.ts`
Expected: PASS — all tests pass

**Step 7: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 8: Commit**

```bash
git add src/lib/validations/invitation.schema.ts src/lib/validations/table-config.schema.ts src/lib/validations/__tests__/invitation.schema.test.ts src/lib/validations/__tests__/table-config.schema.test.ts
git commit -m "feat: add Zod schemas for invitations and table configuration with tests"
```

---

## Task 5: Invitation Service with Tests

**Files:**

- Create: `src/services/invitation.service.ts`
- Create: `src/services/__tests__/invitation.service.test.ts`

**Step 1: Write the failing tests**

Write tests covering:

- `createInvitation()` — generates token, inserts into DB, returns invitation
- `createInvitation()` with existing ATTABL user — adds directly to admin_users
- `validateToken()` — returns invitation for valid token, throws for expired/invalid
- `acceptInvitation()` — creates auth user + admin_users + updates invitation status
- `acceptInvitation()` for existing user — just adds admin_users record
- `cancelInvitation()` — updates status to cancelled
- `resendInvitation()` — regenerates token, resets expiry

The service uses dependency injection (receives SupabaseClient). Token generation uses `crypto.randomBytes(32).toString('hex')` (64 chars). Expiry is `Date.now() + 72h`.

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/services/__tests__/invitation.service.test.ts`
Expected: FAIL — module not found

**Step 3: Write the service implementation**

```typescript
// src/services/invitation.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { ServiceError } from './errors';
import type { Invitation } from '@/types/invitation.types';

interface CreateInvitationInput {
  tenantId: string;
  email: string;
  role: string;
  invitedBy: string;
  customPermissions?: Record<string, boolean>;
}

interface AcceptInvitationInput {
  token: string;
  fullName?: string;
  password?: string;
}

const TOKEN_EXPIRY_HOURS = 72;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function getExpiresAt(): string {
  const date = new Date();
  date.setHours(date.getHours() + TOKEN_EXPIRY_HOURS);
  return date.toISOString();
}

export function createInvitationService(supabase: SupabaseClient) {
  return {
    async createInvitation(input: CreateInvitationInput): Promise<Invitation> {
      // Check if email already has an ATTABL account
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find((u) => u.email === input.email);

      if (existingUser) {
        // User already exists — add directly to admin_users
        const { error: adminError } = await supabase.from('admin_users').insert({
          user_id: existingUser.id,
          tenant_id: input.tenantId,
          email: input.email,
          role: input.role,
          is_active: true,
          custom_permissions: input.customPermissions || null,
          created_by: input.invitedBy,
        });

        if (adminError) {
          throw new ServiceError(
            `Erreur ajout membre: ${adminError.message}`,
            'INTERNAL',
            adminError,
          );
        }

        // Return a synthetic "accepted" invitation
        return {
          id: 'direct-add',
          tenant_id: input.tenantId,
          email: input.email,
          role: input.role,
          custom_permissions: input.customPermissions || null,
          invited_by: input.invitedBy,
          token: '',
          expires_at: new Date().toISOString(),
          status: 'accepted',
          created_at: new Date().toISOString(),
          accepted_at: new Date().toISOString(),
        };
      }

      // New user — create invitation with token
      const token = generateToken();
      const expiresAt = getExpiresAt();

      const { data: invitation, error } = await supabase
        .from('invitations')
        .insert({
          tenant_id: input.tenantId,
          email: input.email,
          role: input.role,
          custom_permissions: input.customPermissions || null,
          invited_by: input.invitedBy,
          token,
          expires_at: expiresAt,
          status: 'pending',
        })
        .select()
        .single();

      if (error || !invitation) {
        throw new ServiceError(
          `Erreur creation invitation: ${error?.message || 'Donnees manquantes'}`,
          'INTERNAL',
          error,
        );
      }

      return invitation as Invitation;
    },

    async validateToken(token: string): Promise<Invitation> {
      const { data: invitation, error } = await supabase
        .from('invitations')
        .select('*, tenants(name, logo_url, slug)')
        .eq('token', token)
        .eq('status', 'pending')
        .single();

      if (error || !invitation) {
        throw new ServiceError('Invitation introuvable ou deja utilisee', 'NOT_FOUND');
      }

      // Check expiry
      if (new Date(invitation.expires_at) < new Date()) {
        // Mark as expired
        await supabase.from('invitations').update({ status: 'expired' }).eq('id', invitation.id);

        throw new ServiceError('Cette invitation a expire', 'VALIDATION');
      }

      return invitation as Invitation;
    },

    async acceptInvitation(input: AcceptInvitationInput): Promise<{ tenantSlug: string }> {
      const invitation = await this.validateToken(input.token);

      let userId: string;

      // Check if user already exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find((u) => u.email === invitation.email);

      if (existingUser) {
        userId = existingUser.id;
      } else {
        // Create new auth user
        if (!input.password || !input.fullName) {
          throw new ServiceError('Nom et mot de passe requis pour un nouveau compte', 'VALIDATION');
        }

        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: invitation.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { full_name: input.fullName },
        });

        if (authError || !authUser.user) {
          throw new ServiceError(
            `Erreur creation compte: ${authError?.message || 'Erreur inconnue'}`,
            'INTERNAL',
            authError,
          );
        }

        userId = authUser.user.id;
      }

      // Add to admin_users
      const { error: adminError } = await supabase.from('admin_users').insert({
        user_id: userId,
        tenant_id: invitation.tenant_id,
        email: invitation.email,
        full_name: input.fullName || invitation.email,
        role: invitation.role,
        is_active: true,
        custom_permissions: invitation.custom_permissions,
        created_by: invitation.invited_by,
      });

      if (adminError) {
        throw new ServiceError(
          `Erreur ajout au restaurant: ${adminError.message}`,
          'INTERNAL',
          adminError,
        );
      }

      // Mark invitation as accepted
      await supabase
        .from('invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invitation.id);

      // Get tenant slug for redirect
      const { data: tenant } = await supabase
        .from('tenants')
        .select('slug')
        .eq('id', invitation.tenant_id)
        .single();

      return { tenantSlug: tenant?.slug || '' };
    },

    async cancelInvitation(invitationId: string): Promise<void> {
      const { error } = await supabase
        .from('invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId)
        .eq('status', 'pending');

      if (error) {
        throw new ServiceError(`Erreur annulation: ${error.message}`, 'INTERNAL', error);
      }
    },

    async resendInvitation(invitationId: string): Promise<Invitation> {
      const token = generateToken();
      const expiresAt = getExpiresAt();

      const { data: invitation, error } = await supabase
        .from('invitations')
        .update({
          token,
          expires_at: expiresAt,
          status: 'pending',
        })
        .eq('id', invitationId)
        .select()
        .single();

      if (error || !invitation) {
        throw new ServiceError(
          `Erreur renvoi: ${error?.message || 'Invitation introuvable'}`,
          'INTERNAL',
          error,
        );
      }

      return invitation as Invitation;
    },

    async getPendingInvitations(tenantId: string): Promise<Invitation[]> {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        throw new ServiceError(`Erreur chargement: ${error.message}`, 'INTERNAL', error);
      }

      // Lazy check: mark expired invitations
      const now = new Date();
      const valid: Invitation[] = [];

      for (const inv of (data || []) as Invitation[]) {
        if (new Date(inv.expires_at) < now) {
          await supabase.from('invitations').update({ status: 'expired' }).eq('id', inv.id);
        } else {
          valid.push(inv);
        }
      }

      return valid;
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test src/services/__tests__/invitation.service.test.ts`
Expected: PASS — all tests pass

**Step 5: Commit**

```bash
git add src/services/invitation.service.ts src/services/__tests__/invitation.service.test.ts
git commit -m "feat: add invitation service with token generation, validation, and tests"
```

---

## Task 6: Table Configuration Service with Tests

**Files:**

- Create: `src/services/table-config.service.ts`
- Create: `src/services/__tests__/table-config.service.test.ts`

**Step 1: Write the failing tests**

Write tests covering:

- `createZonesAndTables()` — creates zones + auto-numbered tables from config input
- `createDefaultConfig()` — creates 1 default zone + N tables (for skip mode)
- `addTablesToZone()` — adds tables with auto-numbering continuation
- `getNextTableNumber()` — finds the next available number for a zone prefix

The service uses dependency injection (receives SupabaseClient).

Auto-numbering logic:

- Finds existing tables for the zone's prefix
- Extracts the max number
- Continues from max + 1

**Step 2: Run tests to verify they fail**

**Step 3: Write the service implementation**

The service should have these methods:

- `createZonesAndTables(tenantId, venueId, zones[])` — bulk create from onboarding
- `createDefaultConfig(tenantId, venueId, tableCount)` — skip mode: "Salle principale" + N tables
- `addTablesToZone(tenantId, zoneId, prefix, count, capacity)` — add more tables
- `generateTableNumber(prefix, index)` — `${prefix}-${index}` format

**Step 4: Run tests to verify they pass**

**Step 5: Commit**

```bash
git add src/services/table-config.service.ts src/services/__tests__/table-config.service.test.ts
git commit -m "feat: add table configuration service with auto-numbering and tests"
```

---

## Task 7: Invitation Email Template (Resend)

**Files:**

- Modify: `src/services/email.service.ts`

**Step 1: Add `sendInvitationEmail` function**

Add a new export to `src/services/email.service.ts`:

```typescript
interface InvitationEmailData {
  restaurantName: string;
  restaurantLogoUrl?: string;
  role: string;
  inviteUrl: string;
}

export async function sendInvitationEmail(to: string, data: InvitationEmailData): Promise<boolean> {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured — skipping invitation email');
    return false;
  }

  const roleLabels: Record<string, string> = {
    admin: 'Administrateur',
    manager: 'Manager',
    cashier: 'Caissier',
    chef: 'Chef Cuisine',
    waiter: 'Serveur',
  };

  const roleLabel = roleLabels[data.role] || data.role;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1f2937;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        ${data.restaurantLogoUrl ? `<img src="${data.restaurantLogoUrl}" alt="" style="height:48px;margin-bottom:12px;border-radius:8px" />` : ''}
        <h1 style="color:white;margin:0;font-size:22px">${data.restaurantName}</h1>
      </div>
      <div style="background:white;padding:32px 24px;border:1px solid #e5e7eb;border-top:none">
        <h2 style="color:#111827;margin:0 0 16px;font-size:18px">Vous avez ete invite !</h2>
        <p style="color:#374151;margin:0 0 8px;line-height:1.6">
          Vous avez ete invite a rejoindre l'equipe de <strong>${data.restaurantName}</strong> sur ATTABL
          en tant que <strong>${roleLabel}</strong>.
        </p>
        <p style="color:#6b7280;margin:0 0 24px;font-size:14px">
          Cette invitation expire dans 72 heures.
        </p>
        <div style="text-align:center;margin:32px 0">
          <a href="${data.inviteUrl}" style="display:inline-block;background:#CCFF00;color:#000;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px">
            Accepter l'invitation
          </a>
        </div>
        <p style="color:#9ca3af;font-size:13px;margin:0;text-align:center">
          Si vous n'avez pas demande cette invitation, vous pouvez ignorer cet email.
        </p>
      </div>
      <div style="background:#f9fafb;padding:16px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none">
        <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">
          Envoye par ATTABL — Menus digitaux pour restaurants et hotels
        </p>
      </div>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `Rejoignez l'equipe de ${data.restaurantName} sur ATTABL`,
      html,
    });

    if (error) {
      logger.error('Resend invitation error', error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Failed to send invitation email', err);
    return false;
  }
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/services/email.service.ts
git commit -m "feat: add invitation email template via Resend"
```

---

## Task 8: API Routes — Invitations CRUD

**Files:**

- Create: `src/app/api/invitations/route.ts` (GET list + POST create)
- Create: `src/app/api/invitations/[id]/route.ts` (DELETE cancel)
- Create: `src/app/api/invitations/[id]/resend/route.ts` (POST resend)
- Create: `src/app/api/invitations/accept/route.ts` (POST accept)

**Step 1: Create the routes**

Each route follows the pattern: Rate limiting -> Auth check -> Zod validation -> Service call -> JSON response.

- `POST /api/invitations` — creates invitation + sends email via `sendInvitationEmail()`
- `GET /api/invitations?tenant_id=xxx` — returns pending invitations
- `DELETE /api/invitations/[id]` — cancels invitation
- `POST /api/invitations/[id]/resend` — resends invitation + email
- `POST /api/invitations/accept` — public route (no auth), validates token, creates user

The accept route uses the `createAdminClient()` since it needs to create auth users. All other routes use `createClient()` (server) for auth check + `createAdminClient()` for operations.

**Step 2: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/api/invitations/
git commit -m "feat: add invitation API routes (CRUD + accept)"
```

---

## Task 9: Accept Invitation Page — `/auth/accept-invite`

**Files:**

- Create: `src/app/auth/accept-invite/page.tsx`

**Step 1: Create the page**

This is a Client Component page that:

1. Reads `?token=xxx` from URL search params
2. On mount, calls `POST /api/invitations/accept` with just the token to validate
3. If token valid: shows restaurant name, role, and form (full_name + password)
4. If token invalid/expired: shows error message + link to contact owner
5. On submit: calls `POST /api/invitations/accept` with full data
6. On success: redirects to `/sites/{slug}/admin`

The page follows the ATTABL design charter (#CCFF00 accent, dark header, clean white form).

**Step 2: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Add `/auth/accept-invite` to middleware MAIN_DOMAIN_PATHS**

In `src/middleware.ts`, add `'/auth/accept-invite'` to the `MAIN_DOMAIN_PATHS` array so it is not treated as a tenant subdomain route.

**Step 4: Commit**

```bash
git add src/app/auth/accept-invite/page.tsx src/middleware.ts
git commit -m "feat: add accept-invite page with token validation and account creation"
```

---

## Task 10: Onboarding Step 2 — Table Configuration Component

**Files:**

- Create: `src/components/onboarding/TablesStep.tsx`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/services/onboarding.service.ts`

**Step 1: Create `TablesStep` component**

A Client Component with three modes:

- **Configuration complete**: add zones with editable names, prefixes, table counts, capacities
- **Minimum viable**: add zones with just names + table counts (auto prefix)
- **Skip**: button "Configurer plus tard"

UI elements:

- Mode selector at top (3 cards/buttons)
- Zone list (each zone: name input, prefix input, table count input, capacity dropdown, delete button)
- "+ Ajouter une zone" button
- Auto-deduce prefix from name (first 3 letters uppercase)
- Preview: show generated table numbers (INT-1, INT-2...)

Props: `data: OnboardingData`, `updateData: (data) => void`

The component stores zone data in `data.tableZones: ZoneInput[]` (new field on OnboardingData).

**Step 2: Modify onboarding page**

In `src/app/onboarding/page.tsx`:

- Import `TablesStep`
- Update `steps` array: insert step 2 "Vos tables" with `Grid3x3` icon after Establishment
- Renumber: Branding becomes step 3, Menu becomes step 4, Launch becomes step 5
- Update all step references (totalSteps = 5, mobile counter, step rendering)
- Add `tableZones` to `OnboardingData` interface + initial state
- Update `OnboardingData` interface with `tableZones: ZoneInput[]` and `tableConfigMode: 'complete' | 'minimum' | 'skip'`

**Step 3: Modify onboarding service**

In `src/services/onboarding.service.ts`:

- Add handling for step 2 in `saveStep()`: no tenant update needed (tables created on complete)
- Update step numbers: branding is now step 3, menu is step 4
- Update `completeOnboarding()`: after tenant update, create zones + tables using the table-config service
- Update `onboarding_progress` step counts (now 5 steps)

**Step 4: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/onboarding/TablesStep.tsx src/app/onboarding/page.tsx src/services/onboarding.service.ts
git commit -m "feat: add table configuration step to onboarding (step 2/5)"
```

---

## Task 11: Admin Page — Table Management (`/admin/settings/tables`)

**Files:**

- Create: `src/app/sites/[site]/admin/settings/tables/page.tsx`

**Step 1: Create the page**

This is a Client Component page (uses `@frontend-design` skill). Layout:

- **Left column** (w-64): zone list with drag handles, selected zone highlighted, "+ Ajouter une zone" button
- **Main area**: grid of table cards for selected zone, each card shows table_number, display_name (editable), capacity (dropdown), is_active (toggle), delete button
- **Top bar**: zone name (editable), prefix (editable), "Supprimer la zone" button, "+ Ajouter des tables" button

Fetches data:

- `supabase.from('venues').select('id').eq('tenant_id', tenantId).single()` — get venue
- `supabase.from('zones').select('*').eq('venue_id', venueId).order('display_order')` — get zones
- `supabase.from('tables').select('*').eq('zone_id', selectedZoneId).order('table_number')` — get tables

Mutations: direct Supabase calls for updates (inline, no separate API routes — admin page, RLS handles security).

Permissions: check `hasPermission(adminUser, 'settings.edit')` — show read-only if no permission.

**Step 2: Add sidebar link**

In `src/components/admin/AdminSidebar.tsx`, add a "Tables" link under Settings section pointing to `/admin/settings/tables`. Use `Grid3x3` icon from lucide-react.

**Step 3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/sites/[site]/admin/settings/tables/page.tsx src/components/admin/AdminSidebar.tsx
git commit -m "feat: add table management page in admin settings"
```

---

## Task 12: Admin Page — Permissions Matrix (`/admin/settings/permissions`)

**Files:**

- Create: `src/app/sites/[site]/admin/settings/permissions/page.tsx`

**Step 1: Create the page**

A Client Component page accessible only to `owner`. Layout:

- **Header**: "Permissions par role" title + description
- **Matrix grid**: columns = permissions (12), rows = roles (5, excluding owner)
- Each cell is a Switch toggle (on/off)
- Owner row shown at top with all toggles disabled (grayed out)
- "Restaurer les defauts" button per role
- Changes auto-save on toggle (debounced, upsert into `role_permissions`)

Fetches: `supabase.from('role_permissions').select('*').eq('tenant_id', tenantId)`

On toggle change:

- Compute diff from defaults
- If all match defaults, delete the `role_permissions` row
- Otherwise upsert with only the overrides

**Step 2: Add sidebar link**

In `src/components/admin/AdminSidebar.tsx`, add a "Permissions" link under Settings section. Use `ShieldCheck` icon. Only visible to `owner` role.

**Step 3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/sites/[site]/admin/settings/permissions/page.tsx src/components/admin/AdminSidebar.tsx
git commit -m "feat: add permissions matrix page in admin settings"
```

---

## Task 13: Modify UsersClient — Add Invitation Tab

**Files:**

- Modify: `src/components/admin/UsersClient.tsx`

**Step 1: Add invitation tab to the add-member modal**

In the existing "add member" modal in `UsersClient.tsx`:

- Add two tabs at top: "Inviter par email" (new) | "Creation directe" (existing)
- Tab 1 (Invite): email input + role dropdown + optional custom permissions + "Envoyer l'invitation" button. Calls `POST /api/invitations` then `sendInvitationEmail()`.
- Tab 2 (Direct): existing form (email, password, name, role)

**Step 2: Add pending invitations section**

Below the users list, add a "Invitations en attente" section:

- Fetch from `GET /api/invitations?tenant_id=xxx`
- Show each pending invitation: email, role, created_at, expires in X hours
- Actions: "Renvoyer" button, "Annuler" button
- Style: lighter card with dashed border + mail icon

**Step 3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/UsersClient.tsx
git commit -m "feat: add invitation tab and pending invitations to team page"
```

---

## Task 14: Integrate Permissions into Sidebar

**Files:**

- Modify: `src/components/admin/AdminSidebar.tsx`

**Step 1: Use `hasPermission` to show/hide sidebar items**

The sidebar currently shows all items to all roles. Modify it to:

1. Fetch `role_permissions` for the current tenant on mount
2. Use `getEffectivePermissions(adminUser, roleOverrides)` to get the full map
3. Conditionally render sidebar items based on permissions:
   - Menu section: `menu.view`
   - Orders section: `orders.view`
   - Reports section: `reports.view`
   - POS section: `pos.use`
   - Inventory section: `inventory.view`
   - Team section: `team.view`
   - Settings section: `settings.view`

Items the user doesn't have permission for are hidden (not grayed out).

**Step 2: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/admin/AdminSidebar.tsx
git commit -m "feat: integrate permission-based sidebar visibility"
```

---

## Task 15: Final Verification — All CI Gates

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
Expected: All tests pass (182 existing + ~30 new = ~212 tests)

**Step 5: Run build**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 6: Commit any formatting fixes**

If `pnpm format` made changes:

```bash
git add -A
git commit -m "style: format cleanup for tables, invitations, and permissions"
```

**Step 7: Push and verify CI**

```bash
git push origin claude/adoring-davinci
```

Expected: GitHub Actions CI passes all 5 quality gates
