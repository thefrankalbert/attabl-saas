# Waiter-Table Assignment — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow servers to claim tables and orders, with auto-assignment, KDS display, and manager oversight.

**Architecture:** New `table_assignments` table + `assignment.service.ts` + API routes + UI components. Leverages existing `orders.server_id` column (already in DB). Follows existing service injection, TanStack Query, and DataTable patterns.

**Tech Stack:** Supabase (PostgreSQL + Realtime), Next.js 16 App Router, TanStack Query, TanStack Table, Zod, Vitest

---

## Task 1: Database Migration — `table_assignments`

**Files:**

- Create: `supabase/migrations/20260218_table_assignments.sql`

**Step 1: Write the migration**

```sql
-- Table assignments: link servers to tables for shift-based service
CREATE TABLE IF NOT EXISTS table_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_id    UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  server_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for active assignment lookups
CREATE INDEX IF NOT EXISTS idx_table_assignments_active
  ON table_assignments(tenant_id, table_id) WHERE (ended_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_table_assignments_server
  ON table_assignments(server_id) WHERE (ended_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_table_assignments_tenant
  ON table_assignments(tenant_id);

-- RLS
ALTER TABLE table_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view assignments"
  ON table_assignments FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can insert assignments"
  ON table_assignments FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can update assignments"
  ON table_assignments FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users WHERE user_id = auth.uid()
    )
  );
```

**Step 2: Apply migration locally**

Run: `~/.local/bin/supabase db push` or use the `scripts/run-migrations.mjs` pattern with `postgres` package.

**Step 3: Commit**

```bash
git add supabase/migrations/20260218_table_assignments.sql
git commit -m "feat: add table_assignments migration for waiter-table system"
```

---

## Task 2: TypeScript Types — Update `Order` + Add `TableAssignment`

**Files:**

- Modify: `src/types/admin.types.ts` (lines 114-145 for Order, append for TableAssignment)

**Step 1: Add fields to `Order` interface (line ~145, before closing brace)**

```typescript
  // Waiter assignment
  server_id?: string;
  cashier_id?: string;
  assigned_to?: string;
  server?: { id: string; full_name: string; role: string };
```

**Step 2: Add `TableAssignment` interface (after Table interface, line ~343)**

```typescript
export interface TableAssignment {
  id: string;
  tenant_id: string;
  table_id: string;
  server_id: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  // Joins
  server?: AdminUser;
  table?: Table;
}
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (0 errors — new fields are all optional)

**Step 4: Commit**

```bash
git add src/types/admin.types.ts
git commit -m "feat: add TableAssignment type, extend Order with server_id fields"
```

---

## Task 3: Zod Validation — Assignment Schemas

**Files:**

- Create: `src/lib/validations/assignment.schema.ts`
- Modify: `src/lib/validations/order.schema.ts` (line ~57, add server_id)

**Step 1: Create assignment schemas**

```typescript
import { z } from 'zod';

export const createAssignmentSchema = z.object({
  table_id: z.string().uuid('Identifiant de table invalide'),
  server_id: z.string().uuid('Identifiant de serveur invalide'),
});

export const claimOrderSchema = z.object({
  server_id: z.string().uuid('Identifiant de serveur invalide'),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type ClaimOrderInput = z.infer<typeof claimOrderSchema>;
```

**Step 2: Add `server_id` to `createOrderSchema` in order.schema.ts**

After `coupon_code` field (line ~56), add:

```typescript
  server_id: z.string().uuid().optional(),
```

**Step 3: Write tests for assignment schema**

Create: `src/lib/validations/__tests__/assignment.schema.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { createAssignmentSchema, claimOrderSchema } from '../assignment.schema';

describe('createAssignmentSchema', () => {
  it('accepts valid input', () => {
    const result = createAssignmentSchema.safeParse({
      table_id: '550e8400-e29b-41d4-a716-446655440000',
      server_id: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing table_id', () => {
    const result = createAssignmentSchema.safeParse({
      server_id: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID', () => {
    const result = createAssignmentSchema.safeParse({
      table_id: 'not-a-uuid',
      server_id: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(false);
  });
});

describe('claimOrderSchema', () => {
  it('accepts valid input', () => {
    const result = claimOrderSchema.safeParse({
      server_id: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing server_id', () => {
    const result = claimOrderSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
```

**Step 4: Run tests**

Run: `pnpm test`
Expected: All pass (150 existing + new assignment tests)

**Step 5: Commit**

```bash
git add src/lib/validations/assignment.schema.ts src/lib/validations/__tests__/assignment.schema.test.ts src/lib/validations/order.schema.ts
git commit -m "feat: add assignment Zod schemas with tests, extend order schema"
```

---

## Task 4: Assignment Service

**Files:**

- Create: `src/services/assignment.service.ts`
- Create: `src/services/__tests__/assignment.service.test.ts`

**Step 1: Write the service tests first (TDD)**

Follow the pattern from `order.service.test.ts`: mock Supabase with chain builders, test each method.

Key tests:

- `assignServerToTable` — creates assignment, returns it
- `assignServerToTable` — throws if server not found
- `releaseAssignment` — sets ended_at
- `releaseAllForServer` — releases all active assignments
- `getActiveServerForTable` — returns most recent server
- `getActiveServerForTable` — returns null when no assignment
- `getActiveAssignments` — returns list filtered by tenant
- `claimOrder` — updates order.server_id

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/services/__tests__/assignment.service.test.ts`
Expected: FAIL (service doesn't exist yet)

**Step 3: Implement the service**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { TableAssignment, AdminUser } from '@/types/admin.types';

export function createAssignmentService(supabase: SupabaseClient) {
  return {
    async assignServerToTable(
      tenantId: string,
      tableId: string,
      serverId: string,
    ): Promise<TableAssignment> {
      // Verify server exists and belongs to tenant
      const { data: server, error: serverErr } = await supabase
        .from('admin_users')
        .select('id, role')
        .eq('id', serverId)
        .eq('tenant_id', tenantId)
        .single();

      if (serverErr || !server) {
        throw new ServiceError('NOT_FOUND', 'Serveur introuvable');
      }

      // Insert assignment
      const { data, error } = await supabase
        .from('table_assignments')
        .insert({
          tenant_id: tenantId,
          table_id: tableId,
          server_id: serverId,
        })
        .select(
          '*, server:admin_users(id, full_name, role), table:tables(id, display_name, table_number)',
        )
        .single();

      if (error) throw new ServiceError('INTERNAL', "Erreur lors de l'assignation");
      return data as TableAssignment;
    },

    async releaseAssignment(assignmentId: string): Promise<void> {
      const { error } = await supabase
        .from('table_assignments')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', assignmentId)
        .is('ended_at', null);

      if (error) throw new ServiceError('INTERNAL', 'Erreur lors de la liberation');
    },

    async releaseAllForServer(tenantId: string, serverId: string): Promise<void> {
      const { error } = await supabase
        .from('table_assignments')
        .update({ ended_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('server_id', serverId)
        .is('ended_at', null);

      if (error) throw new ServiceError('INTERNAL', 'Erreur lors de la liberation');
    },

    async getActiveServerForTable(tenantId: string, tableId: string): Promise<AdminUser | null> {
      const { data, error } = await supabase
        .from('table_assignments')
        .select('server:admin_users(id, full_name, role)')
        .eq('tenant_id', tenantId)
        .eq('table_id', tableId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return data.server as unknown as AdminUser;
    },

    async getActiveAssignments(tenantId: string): Promise<TableAssignment[]> {
      const { data, error } = await supabase
        .from('table_assignments')
        .select(
          '*, server:admin_users(id, full_name, role), table:tables(id, display_name, table_number, zone_id)',
        )
        .eq('tenant_id', tenantId)
        .is('ended_at', null)
        .order('started_at', { ascending: false });

      if (error) throw new ServiceError('INTERNAL', 'Erreur de chargement');
      return (data as TableAssignment[]) ?? [];
    },

    async claimOrder(orderId: string, serverId: string, tenantId: string): Promise<void> {
      const { error } = await supabase
        .from('orders')
        .update({ server_id: serverId })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);

      if (error) throw new ServiceError('INTERNAL', 'Erreur lors du claim');
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All pass

**Step 5: Commit**

```bash
git add src/services/assignment.service.ts src/services/__tests__/assignment.service.test.ts
git commit -m "feat: add assignment service with tests"
```

---

## Task 5: Modify Order Service — Auto-assign server_id

**Files:**

- Modify: `src/services/order.service.ts` (CreateOrderInput + createOrderWithItems)
- Modify: `src/services/__tests__/order.service.test.ts` (add test)

**Step 1: Add `server_id` to `CreateOrderInput` (line ~24)**

```typescript
  server_id?: string;
```

**Step 2: In `createOrderWithItems`, add server_id to the insert object**

In the `.insert({...})` call (around line 180), add:

```typescript
  server_id: input.server_id ?? null,
```

**Step 3: Add auto-assign logic after order creation**

After the order INSERT succeeds, if `server_id` was not provided and `table_number` exists, look up active assignment:

```typescript
// Auto-assign server if table has an active assignment
if (!input.server_id && order.table_number) {
  const { data: assignment } = await supabase
    .from('table_assignments')
    .select('server_id')
    .eq('tenant_id', input.tenantId)
    .eq('table_id', order.table_id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assignment?.server_id) {
    await supabase.from('orders').update({ server_id: assignment.server_id }).eq('id', order.id);
  }
}
```

Note: This uses `table_id` — the order needs to store the table UUID, not just the text `table_number`. If `table_id` is not present (legacy orders), skip auto-assign.

**Step 4: Add test for auto-assign**

Add to order.service.test.ts:

```typescript
it('auto-assigns server_id from active table assignment', async () => {
  // ... mock table_assignments query returning server_id
  // ... verify order.update was called with server_id
});
```

**Step 5: Run tests**

Run: `pnpm test`
Expected: All pass

**Step 6: Commit**

```bash
git add src/services/order.service.ts src/services/__tests__/order.service.test.ts
git commit -m "feat: auto-assign server_id from table_assignments on order creation"
```

---

## Task 6: API Routes — Assignments CRUD

**Files:**

- Create: `src/app/api/assignments/route.ts` (GET + POST)
- Create: `src/app/api/assignments/[id]/route.ts` (DELETE)
- Create: `src/app/api/assignments/release-all/route.ts` (POST)
- Create: `src/app/api/orders/[id]/claim/route.ts` (POST)
- Modify: `src/lib/rate-limit.ts` (add assignmentLimiter)

**Step 1: Add rate limiter**

In `src/lib/rate-limit.ts`, after `excelImportLimiter` (line 105):

```typescript
/** Assignments: 30 requests / minute per IP */
export const assignmentLimiter = createLimiter('assignment', Ratelimit.slidingWindow(30, '1 m'));
```

**Step 2: Create `/api/assignments` route (GET + POST)**

Follow the `menu-import/route.ts` pattern: rate-limit → `auth.getUser()` → tenant slug → Zod validate → service call.

- GET: `assignmentService.getActiveAssignments(tenantId)`
- POST: Zod parse `createAssignmentSchema` → `assignmentService.assignServerToTable(tenantId, table_id, server_id)`

**Step 3: Create `/api/assignments/[id]` route (DELETE)**

- DELETE: `assignmentService.releaseAssignment(params.id)`

**Step 4: Create `/api/assignments/release-all` route (POST)**

- POST: body `{ server_id }` → `assignmentService.releaseAllForServer(tenantId, serverId)`

**Step 5: Create `/api/orders/[id]/claim` route (POST)**

- POST: Zod parse `claimOrderSchema` → `assignmentService.claimOrder(params.id, server_id, tenantId)`

**Step 6: Run typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS

**Step 7: Commit**

```bash
git add src/app/api/assignments/ src/app/api/orders/[id]/claim/ src/lib/rate-limit.ts
git commit -m "feat: add assignment API routes with auth + rate limiting"
```

---

## Task 7: TanStack Query Hooks — Assignments

**Files:**

- Create: `src/hooks/queries/useAssignments.ts`
- Create: `src/hooks/mutations/useAssignment.ts`
- Modify: `src/hooks/queries/index.ts` (add export)
- Modify: `src/hooks/mutations/index.ts` (add export)

**Step 1: Create useAssignments query hook**

Follow `useOrders.ts` pattern:

```typescript
'use client';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TableAssignment } from '@/types/admin.types';

export function useAssignments(tenantId: string) {
  return useQuery<TableAssignment[]>({
    queryKey: ['assignments', tenantId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('table_assignments')
        .select(
          '*, server:admin_users(id, full_name, role), table:tables(id, display_name, table_number, zone_id)',
        )
        .eq('tenant_id', tenantId)
        .is('ended_at', null)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data as TableAssignment[]) ?? [];
    },
    enabled: !!tenantId,
  });
}
```

**Step 2: Create useAssignment mutation hooks**

Follow `useUpdateOrderStatus.ts` pattern:

```typescript
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useAssignServer(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tableId, serverId }: { tableId: string; serverId: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('table_assignments')
        .insert({ tenant_id: tenantId, table_id: tableId, server_id: serverId })
        .select('*, server:admin_users(id, full_name, role), table:tables(id, display_name)')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', tenantId] });
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

export function useReleaseAssignment(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('table_assignments')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', tenantId] });
    },
  });
}

export function useClaimOrder(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, serverId }: { orderId: string; serverId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('orders')
        .update({ server_id: serverId })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['assignments', tenantId] });
    },
  });
}
```

**Step 3: Update barrel exports**

Add to `src/hooks/queries/index.ts`:

```typescript
export { useAssignments } from './useAssignments';
```

Add to `src/hooks/mutations/index.ts`:

```typescript
export { useAssignServer, useReleaseAssignment, useClaimOrder } from './useAssignment';
```

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/hooks/queries/useAssignments.ts src/hooks/mutations/useAssignment.ts src/hooks/queries/index.ts src/hooks/mutations/index.ts
git commit -m "feat: add TanStack Query hooks for assignments"
```

---

## Task 8: KDSTicket — Display Server Name

**Files:**

- Modify: `src/components/admin/KDSTicket.tsx` (line ~334, INFO ROW section)
- Modify: `src/components/admin/KitchenClient.tsx` (join server in query)

**Step 1: Update KitchenClient query to join server name**

In the Supabase query that fetches orders, change `.select('*, order_items(*)')` to:

```typescript
.select('*, order_items(*), server:admin_users!orders_server_id_fkey(id, full_name)')
```

**Step 2: Add server display in KDSTicket INFO ROW**

After the room number block (line ~334), before the timer div:

```tsx
{
  /* Server */
}
{
  order.server && (
    <div className="flex items-center gap-1.5">
      <User className="w-3.5 h-3.5 text-lime-400" />
      <span className="text-xs font-medium text-lime-400">{order.server.full_name}</span>
    </div>
  );
}
```

Add `User` to the lucide-react imports.

**Step 3: Run typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/KDSTicket.tsx src/components/admin/KitchenClient.tsx
git commit -m "feat: display server name on KDS kitchen tickets"
```

---

## Task 9: OrdersClient — Server Column in DataTable

**Files:**

- Modify: `src/components/admin/OrdersClient.tsx` (add column + update query)

**Step 1: Update orders query to join server**

Change the Supabase select to include server join:

```typescript
.select('*, order_items(*), server:admin_users!orders_server_id_fkey(id, full_name)')
```

**Step 2: Add "Serveur" column to the DataTable columns array**

After the `table_number` column:

```typescript
{
  accessorFn: (row) => row.server?.full_name ?? '—',
  id: 'server',
  header: ({ column }) => <SortableHeader column={column} label={t('server')} />,
  cell: ({ getValue }) => (
    <span className="text-sm text-neutral-400">{getValue() as string}</span>
  ),
},
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/OrdersClient.tsx
git commit -m "feat: add Server column to orders DataTable"
```

---

## Task 10: OrderDetails — Display + Reassign Server

**Files:**

- Modify: `src/components/admin/OrderDetails.tsx`

**Step 1: Add server display in order detail modal**

In the info section, add a row showing the assigned server name. If no server, show "Non assigne".

**Step 2: Add reassign dropdown**

For manager/admin/owner roles, show a `<Select>` dropdown of active servers to reassign the order.

**Step 3: Commit**

```bash
git add src/components/admin/OrderDetails.tsx
git commit -m "feat: show server info and reassign option in order details"
```

---

## Task 11: POSClient — Auto-assign cashier_id

**Files:**

- Modify: `src/components/admin/POSClient.tsx` (handleOrder function, line ~245)

**Step 1: Get current user's admin_users.id**

At component mount, query `admin_users` by `user_id = auth.uid()` to get the `admin_users.id`.

**Step 2: In `handleOrder`, add to insert payload**

```typescript
cashier_id: currentAdminUser.id,
server_id: currentAdminUser.id, // POS operator is both cashier and server
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/POSClient.tsx
git commit -m "feat: auto-assign cashier_id and server_id in POS orders"
```

---

## Task 12: ServiceManager Page — Manager View

**Files:**

- Create: `src/app/sites/[site]/admin/service/page.tsx`
- Create: `src/components/admin/ServiceManager.tsx`

**Step 1: Create page route**

Standard admin page pattern: fetch tenant, render `<ServiceManager tenantId={tenant.id} />`.

**Step 2: Create ServiceManager component**

Grid layout showing:

- All tables grouped by zone
- Each table shows a dropdown of available servers (role = 'waiter' OR 'manager')
- If table has active assignment → show server name with "Release" button
- If no assignment → show "Assigner" dropdown
- Uses `useAssignments`, `useAssignServer`, `useReleaseAssignment` hooks

Follow ATTABL design charter: lime accent, dark bg, rounded-xl, no shadows.

**Step 3: Add Realtime subscription**

Subscribe to `table_assignments` changes → invalidate assignments query cache.

**Step 4: Run build**

Run: `pnpm build`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/sites/[site]/admin/service/ src/components/admin/ServiceManager.tsx
git commit -m "feat: add Service Manager page for waiter-table assignment"
```

---

## Task 13: ServerDashboard — Waiter View

**Files:**

- Create: `src/components/admin/ServerDashboard.tsx`

**Step 1: Create the waiter dashboard component**

Two tabs:

- **Mes tables** : tables assigned to the current server with active orders
- **Non assignees** : orders without a server_id that can be claimed

Each table card shows: table name, number of active orders, total amount, "Liberer" button.
Each unassigned order shows: table number, items count, total, "Prendre en charge" button.

Uses `useAssignments` filtered by current server + `useOrders` filtered by server_id IS NULL.

**Step 2: Integration point**

This component will be rendered when user role is `waiter` and they access the dashboard. Can be integrated into the existing dashboard layout or as a separate view.

**Step 3: Run build**

Run: `pnpm build`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/ServerDashboard.tsx
git commit -m "feat: add ServerDashboard component for waiter view"
```

---

## Task 14: AdminSidebar — Add Service Link

**Files:**

- Modify: `src/components/admin/AdminSidebar.tsx` (navGroups array)

**Step 1: Add "Service" nav item**

In the navGroups array, add a new top-level direct link item (like Dashboard, Orders, Kitchen):

```typescript
{
  id: 'service',
  titleKey: 'navService',
  icon: UserCheck, // from lucide-react
  directLink: `${basePath}/service`,
  requiredPermission: 'canManageUsers',
  items: [],
},
```

Place it after "Kitchen" in the nav order.

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/admin/AdminSidebar.tsx
git commit -m "feat: add Service link to admin sidebar"
```

---

## Task 15: i18n — Add Translations

**Files:**

- Modify: `src/messages/en-US.json`, `en-GB.json`, `en-AU.json`, `en-CA.json`, `en-IE.json`
- Modify: `src/messages/fr-FR.json`, `fr-CA.json`
- Modify: `src/messages/es-ES.json`

**Step 1: Add translation keys**

For each locale file, add under the `admin` section:

```json
"navService": "Service",
"server": "Server",
"assignServer": "Assign server",
"releaseTable": "Release table",
"releaseAll": "Release all",
"claimOrder": "Take order",
"myTables": "My tables",
"unassigned": "Unassigned",
"noActiveAssignments": "No active assignments",
"assignedTo": "Assigned to {name}",
"serverPerformance": "Server performance"
```

French versions:

```json
"navService": "Service",
"server": "Serveur",
"assignServer": "Assigner un serveur",
"releaseTable": "Liberer la table",
"releaseAll": "Tout liberer",
"claimOrder": "Prendre en charge",
"myTables": "Mes tables",
"unassigned": "Non assignees",
"noActiveAssignments": "Aucune assignation active",
"assignedTo": "Assigne a {name}",
"serverPerformance": "Performance par serveur"
```

**Step 2: Commit**

```bash
git add src/messages/
git commit -m "feat: add i18n translations for waiter assignment feature (8 locales)"
```

---

## Task 16: ReportsClient — Server Performance Section

**Files:**

- Modify: `src/components/admin/ReportsClient.tsx`

**Step 1: Add "Performance par serveur" section**

After the existing category breakdown, add a new section:

- Query orders grouped by `server_id` with join on `admin_users.full_name`
- Display a Recharts `<BarChart>` showing orders count per server
- Display a summary table: server name, orders count, total revenue, average order value

**Step 2: Run build**

Run: `pnpm build`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/admin/ReportsClient.tsx
git commit -m "feat: add server performance section to reports"
```

---

## Task 17: Final Verification

**Step 1: Run all 5 CI gates**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Expected: All PASS

**Step 2: Fix any issues**

If format fails: `pnpm format`
If lint fails: fix the specific ESLint issues
If typecheck fails: fix type errors

**Step 3: Final commit + push**

```bash
git push
```

**Step 4: Verify Vercel deploy succeeds**
