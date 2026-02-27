# Performance, Security & Scalability Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring all performance scores to 9.5+/10 and ensure the platform handles 200+ restaurants with fast response times.

**Architecture:** Optimize every layer — middleware, caching, DB indexes, bundle size, React patterns, security headers — while preserving the existing multi-tenant architecture which is sound for 200+ tenants.

**Tech Stack:** Next.js 16, Supabase, React 19, Tailwind v4, React Query, Stripe

---

## Phase 1: Middleware & Request Pipeline (Score 5/10 → 9.5/10)

### Task 1: Skip auth on public routes in proxy middleware

**Files:**

- Modify: `src/proxy.ts:8-36`

**Why:** `createMiddlewareClient()` calls `supabase.auth.getUser()` on EVERY request (line 14), adding ~50-100ms to every page load including marketing pages, login, signup. This is the single biggest TTFB bottleneck.

**Step 1: Add public route list and skip auth**

In `src/proxy.ts`, replace the current flow to only call `createMiddlewareClient` on routes that need auth:

```typescript
// Routes that DON'T need auth session refresh
const PUBLIC_ONLY_PATHS = ['/login', '/signup', '/api/webhooks', '/monitoring', '/manifest.json'];

// Marketing routes (no subdomain, root paths)
const MARKETING_PATHS = ['/', '/pricing', '/features', '/contact', '/legal', '/blog'];

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const subdomain = extractSubdomain(hostname);
  const pathname = request.nextUrl.pathname;

  // Fast path: purely public routes on main domain (no subdomain)
  if (!subdomain || subdomain === 'www') {
    const isPublicOnly = PUBLIC_ONLY_PATHS.some((p) => pathname.startsWith(p));
    const isMarketing = MARKETING_PATHS.includes(pathname);

    if (isPublicOnly || isMarketing) {
      return NextResponse.next();
    }
  }

  // All other routes: refresh session
  const { response: sessionResponse, supabase } = await createMiddlewareClient(request);
  // ... rest of existing logic unchanged
}
```

**Step 2: Run tests and verify**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

**Step 3: Test manually**

- Visit marketing pages → should load faster (no auth delay)
- Visit admin pages → should still require auth
- Visit tenant public menu → should still work

**Step 4: Commit**

```bash
git add src/proxy.ts
git commit -m "perf: skip auth middleware on public/marketing routes — saves ~50-100ms TTFB"
```

---

## Phase 2: HTTP Caching Headers on API Routes (Score 4/10 → 9.5/10)

### Task 2: Create cache header utility

**Files:**

- Create: `src/lib/cache-headers.ts`

**Step 1: Create the utility**

```typescript
import { NextResponse } from 'next/server';

type CacheStrategy = 'static' | 'dynamic' | 'private' | 'realtime';

const CACHE_STRATEGIES: Record<CacheStrategy, string> = {
  // Public data that changes rarely (menus, venues, tenant config)
  static: 'public, max-age=300, s-maxage=600, stale-while-revalidate=60',
  // Data that changes occasionally (invoices, reports)
  dynamic: 'private, max-age=60, stale-while-revalidate=30',
  // Authenticated data (user settings, permissions)
  private: 'private, no-cache, must-revalidate',
  // Real-time data (orders, kitchen, POS)
  realtime: 'no-store, no-cache, must-revalidate',
};

export function withCacheHeaders(response: NextResponse, strategy: CacheStrategy): NextResponse {
  response.headers.set('Cache-Control', CACHE_STRATEGIES[strategy]);
  return response;
}

export function jsonWithCache<T>(data: T, strategy: CacheStrategy, status = 200): NextResponse {
  const response = NextResponse.json(data, { status });
  response.headers.set('Cache-Control', CACHE_STRATEGIES[strategy]);
  return response;
}
```

**Step 2: Commit**

```bash
git add src/lib/cache-headers.ts
git commit -m "feat: add cache header utility for API routes"
```

### Task 3: Apply cache headers to all 27 API routes

**Files:**

- Modify: ALL files in `src/app/api/**/route.ts`

Apply the appropriate strategy per endpoint:

| Route                  | Strategy   | Reason                       |
| ---------------------- | ---------- | ---------------------------- |
| `GET /api/invoices`    | `dynamic`  | Changes when payments happen |
| `POST /api/orders`     | `realtime` | Mutations, no cache          |
| `GET /api/assignments` | `realtime` | Real-time table assignments  |
| `GET /api/menus/*`     | `static`   | Menus change rarely          |
| `GET /api/tenant/*`    | `static`   | Config changes rarely        |
| `POST /api/signup`     | `realtime` | Mutation                     |
| `POST /api/coupons/*`  | `realtime` | Validation mutation          |
| `GET /api/orders`      | `realtime` | Real-time orders list        |

**Step 1: For each GET route, add cache header to response**

Example pattern for `src/app/api/invoices/route.ts`:

```typescript
import { jsonWithCache } from '@/lib/cache-headers';

// Replace: return NextResponse.json({ invoices: ... });
// With:
return jsonWithCache({ invoices: ... }, 'dynamic');
```

**Step 2: Run tests**

```bash
pnpm typecheck && pnpm test
```

**Step 3: Commit**

```bash
git add src/app/api/
git commit -m "perf: add HTTP cache headers to all 27 API routes"
```

---

## Phase 3: Server-Side Caching with unstable_cache (Score 4/10 → 9.5/10)

### Task 4: Add server-side cache for tenant config

**Files:**

- Create: `src/lib/cache.ts`
- Modify: `src/app/sites/[site]/layout.tsx`
- Modify: `src/app/sites/[site]/admin/layout.tsx`

**Step 1: Create cache utility**

```typescript
import { unstable_cache } from 'next/cache';
import { createServerComponentClient } from '@/lib/supabase/server';

export const getCachedTenant = unstable_cache(
  async (slug: string) => {
    const supabase = await createServerComponentClient();
    const { data } = await supabase
      .from('tenants')
      .select(
        'id, name, slug, primary_color, secondary_color, logo_url, currency, establishment_type, subscription_plan, subscription_status, trial_ends_at, onboarding_completed',
      )
      .eq('slug', slug)
      .single();
    return data;
  },
  ['tenant-by-slug'],
  { revalidate: 60, tags: ['tenant-config'] },
);

export const getCachedMenuStructure = unstable_cache(
  async (tenantId: string) => {
    const supabase = await createServerComponentClient();
    const { data } = await supabase
      .from('menus')
      .select('id, name, name_en, slug, is_active, display_order, venue:venues(id, name, slug)')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('display_order');
    return data;
  },
  ['menu-structure'],
  { revalidate: 300, tags: ['menus'] },
);
```

**Step 2: Use cached tenant in layouts**

Replace direct Supabase queries in layout files with `getCachedTenant(slug)`.

**Step 3: Run tests**

```bash
pnpm typecheck && pnpm test
```

**Step 4: Commit**

```bash
git add src/lib/cache.ts src/app/sites/
git commit -m "perf: add server-side caching for tenant config and menu structure"
```

### Task 5: Migrate Server Actions to revalidateTag

**Files:**

- Modify: `src/app/actions/menus.ts`
- Modify: `src/app/actions/menu-items.ts`
- Modify: `src/app/actions/tenant-settings.ts`
- Modify: `src/app/actions/venues.ts`

**Step 1: Replace broad revalidatePath with granular revalidateTag**

```typescript
// BEFORE (in menus.ts):
revalidatePath(`/sites/[site]/admin/menus`, 'page');

// AFTER:
revalidateTag('menus');
revalidateTag('tenant-config');
```

Tag mapping:

- Menu CRUD → `revalidateTag('menus')`
- Menu item CRUD → `revalidateTag('menus')` + `revalidateTag('menu-items')`
- Tenant settings → `revalidateTag('tenant-config')`
- Venue CRUD → `revalidateTag('venues')`

**Step 2: Run tests**

```bash
pnpm typecheck && pnpm test
```

**Step 3: Commit**

```bash
git add src/app/actions/
git commit -m "perf: migrate server actions from revalidatePath to granular revalidateTag"
```

---

## Phase 4: Database Optimization (Score 6/10 → 9.5/10)

### Task 6: Add missing composite indexes

**Files:**

- Create: `supabase/migrations/20260227_performance_indexes.sql`

**Step 1: Write migration**

```sql
-- Index for order assignment lookup (used in order.service.ts)
CREATE INDEX IF NOT EXISTS idx_table_assignments_active
  ON table_assignments (tenant_id, table_id, ended_at, started_at DESC)
  WHERE ended_at IS NULL;

-- Index for stock movements listing (used in inventory.service.ts)
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_created
  ON stock_movements (tenant_id, created_at DESC);

-- Index for active assignments listing (used in assignment.service.ts)
CREATE INDEX IF NOT EXISTS idx_table_assignments_tenant_active
  ON table_assignments (tenant_id, ended_at)
  WHERE ended_at IS NULL;

-- Index for orders by tenant + status (used in KDS, orders page)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_created
  ON orders (tenant_id, status, created_at DESC);

-- Index for order items by order (used in order detail)
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items (order_id);

-- Index for menu items by tenant + category (used in menu page)
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_category
  ON menu_items (tenant_id, category_id, display_order);

-- Index for ingredients stock alerts (used in notification.service.ts)
CREATE INDEX IF NOT EXISTS idx_ingredients_stock_alert
  ON ingredients (tenant_id, is_active, current_stock, min_stock_alert)
  WHERE is_active = true;

-- Index for stock alert rate limiting
CREATE INDEX IF NOT EXISTS idx_stock_alerts_rate_limit
  ON stock_alert_notifications (tenant_id, ingredient_id, sent_at DESC);

-- Index for admin_users tenant lookup
CREATE INDEX IF NOT EXISTS idx_admin_users_tenant
  ON admin_users (tenant_id, user_id);

-- Index for coupons validation
CREATE INDEX IF NOT EXISTS idx_coupons_validation
  ON coupons (tenant_id, code, is_active)
  WHERE is_active = true;
```

**Step 2: Apply migration**

```bash
npx supabase db push
```

**Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "perf: add 10 composite indexes for critical query paths"
```

### Task 7: Fix N+1 query in notification service

**Files:**

- Modify: `src/services/notification.service.ts:69-76`

**Step 1: Replace loop with batch call**

```typescript
// BEFORE (N+1 loop):
const emails: string[] = [];
for (const userId of userIds) {
  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  if (userData?.user?.email) {
    emails.push(userData.user.email);
  }
}

// AFTER (single call):
const { data: usersData } = await supabase.auth.admin.listUsers();
const userIdSet = new Set(userIds);
const emails = (usersData?.users || [])
  .filter((u) => userIdSet.has(u.id) && u.email)
  .map((u) => u.email!);
```

**Step 2: Run tests**

```bash
pnpm test -- --grep notification
```

**Step 3: Commit**

```bash
git add src/services/notification.service.ts
git commit -m "perf: fix N+1 query in stock alert notifications — single listUsers() call"
```

### Task 8: Replace SELECT \* with explicit columns in 6 services

**Files:**

- Modify: `src/services/coupon.service.ts` (lines 29-35, 132)
- Modify: `src/services/supplier.service.ts` (lines 14, 25)
- Modify: `src/services/menu.service.ts` (line 42)
- Modify: `src/services/inventory.service.ts` (line 25)
- Modify: `src/services/invitation.service.ts` (line 231)
- Modify: `src/services/onboarding.service.ts` (line 273)

**Step 1: For each service, replace `.select('*')` with explicit columns**

Example for coupon.service.ts:

```typescript
// BEFORE:
.select('*')

// AFTER:
.select('id, code, discount_type, discount_value, min_order_amount, max_discount_amount, valid_from, valid_until, max_uses, current_uses, is_active, tenant_id')
```

**Step 2: Run ALL tests to ensure no field is missed**

```bash
pnpm test
```

**Step 3: Commit**

```bash
git add src/services/
git commit -m "perf: replace SELECT * with explicit columns in 6 services — reduce payload 20-40%"
```

---

## Phase 5: Bundle Size Optimization (Score 6.5/10 → 9.5/10)

### Task 9: Lazy load heavy libraries (html2canvas, jspdf, xlsx)

**Files:**

- Modify: `src/components/admin/ReportsClient.tsx` (html2canvas + jspdf)
- Modify: Any file importing xlsx

**Step 1: Convert static imports to dynamic imports at usage site**

For ReportsClient.tsx:

```typescript
// BEFORE:
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// AFTER: Remove top-level imports, use dynamic import in handler
async function exportToPDF() {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  // ... rest of export logic
}
```

For xlsx usage:

```typescript
// BEFORE:
import * as XLSX from 'xlsx';

// AFTER:
async function handleExcelImport(file: File) {
  const XLSX = await import('xlsx');
  // ... rest of import logic
}
```

**Expected savings:** ~84KB removed from main bundle.

**Step 2: Run tests and build**

```bash
pnpm typecheck && pnpm test && pnpm build
```

**Step 3: Commit**

```bash
git add src/components/admin/ src/services/
git commit -m "perf: lazy load html2canvas + jspdf + xlsx — saves ~84KB from main bundle"
```

### Task 10: Add more dynamic imports for heavy components

**Files:**

- Modify files that import heavy components rarely used

**Step 1: Dynamic import QR scanner, chart components, and other heavy widgets**

```typescript
// In files that use QR scanner
import dynamic from 'next/dynamic';
const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-gray-100 rounded-lg" />,
});

// In files that use heavy report components
const ReportsClient = dynamic(() => import('@/components/admin/ReportsClient'), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse bg-gray-100 rounded-lg" />,
});
```

**Step 2: Build and verify bundle reduction**

```bash
ANALYZE=true pnpm build
```

**Step 3: Commit**

```bash
git commit -m "perf: add dynamic imports for QR scanner, reports, and heavy widgets"
```

### Task 11: Add bundle analyzer to project

**Files:**

- Modify: `package.json` (add @next/bundle-analyzer to devDependencies)
- Modify: `next.config.mjs`

**Step 1: Install and configure**

```bash
pnpm add -D @next/bundle-analyzer
```

**Step 2: Wrap config**

```javascript
import withBundleAnalyzer from '@next/bundle-analyzer';

const analyze = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

// Wrap the final export:
export default analyze(withSentryConfig(withPWA(withNextIntl(nextConfig)), sentryConfig));
```

**Step 3: Commit**

```bash
git add package.json next.config.mjs pnpm-lock.yaml
git commit -m "chore: add bundle analyzer for ongoing size monitoring"
```

---

## Phase 6: React Performance Patterns (Score 8/10 → 9.5/10)

### Task 12: Fix QueryProvider — disable refetchOnWindowFocus

**Files:**

- Modify: `src/components/providers/QueryProvider.tsx:15`

**Step 1: Change default**

```typescript
// BEFORE:
refetchOnWindowFocus: true,

// AFTER:
refetchOnWindowFocus: false,
refetchOnReconnect: true,
```

**Step 2: Commit**

```bash
git add src/components/providers/QueryProvider.tsx
git commit -m "perf: disable refetchOnWindowFocus — reduce unnecessary network requests"
```

### Task 13: Replace plain `<img>` tags with next/image

**Files:**

- Modify: `src/components/admin/ItemsClient.tsx` (2 instances)
- Modify: `src/components/admin/sidebar/SidebarHeader.tsx` (1 instance)
- Modify: `src/components/shared/ImageUpload.tsx` (1 instance)

**Step 1: Replace each `<img>` with `<Image>` from next/image**

```tsx
// BEFORE:
<img src={item.image_url} alt={item.name} className="h-10 w-10 rounded object-cover" />

// AFTER:
<Image src={item.image_url} alt={item.name} width={40} height={40} className="rounded object-cover" />
```

**Step 2: Run typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git commit -m "perf: replace 8 plain <img> tags with next/image — enables WebP + lazy loading"
```

### Task 14: Memoize IntersectionObserver options in CategoryNav

**Files:**

- Modify: `src/components/tenant/CategoryNav.tsx:57-88`

**Step 1: Extract constants outside component**

```typescript
// Outside component:
const OBSERVER_OPTIONS: IntersectionObserverInit = {
  rootMargin: '-80px 0px -70% 0px',
  threshold: [0, 0.1, 0.3, 0.5, 0.7, 1.0],
};

// Inside useEffect:
const observer = new IntersectionObserver((entries) => { ... }, OBSERVER_OPTIONS);
```

**Step 2: Commit**

```bash
git add src/components/tenant/CategoryNav.tsx
git commit -m "perf: memoize IntersectionObserver options in CategoryNav"
```

### Task 15: Extract inline callbacks in MenuItemCard

**Files:**

- Modify: `src/components/tenant/MenuItemCard.tsx`

**Step 1: Replace inline arrow functions with useCallback**

```typescript
const handleVariantDropdown = useCallback((e: React.MouseEvent) => {
  e.stopPropagation();
  setShowVariantDropdown((prev) => !prev);
}, []);

const handleSelectVariant = useCallback((variant: PriceVariant, e: React.MouseEvent) => {
  e.stopPropagation();
  setSelectedVariant(variant);
  setShowVariantDropdown(false);
}, []);

const handleIncrement = useCallback(
  (e: React.MouseEvent) => {
    e.stopPropagation();
    updateQuantity(quantity + 1);
  },
  [quantity, updateQuantity],
);

const handleDecrement = useCallback(
  (e: React.MouseEvent) => {
    e.stopPropagation();
    updateQuantity(quantity - 1);
  },
  [quantity, updateQuantity],
);
```

**Step 2: Run tests**

```bash
pnpm typecheck && pnpm test
```

**Step 3: Commit**

```bash
git add src/components/tenant/MenuItemCard.tsx
git commit -m "perf: extract inline callbacks in MenuItemCard — prevent child re-renders"
```

### Task 16: Add sizes attribute to ProductImage fill variant

**Files:**

- Modify: `src/components/shared/ProductImage.tsx`

**Step 1: Add sizes prop**

```tsx
<Image
  src={src}
  alt={alt}
  fill
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  className={cn('object-cover', className)}
/>
```

**Step 2: Commit**

```bash
git add src/components/shared/ProductImage.tsx
git commit -m "perf: add sizes attribute to ProductImage — prevent layout shift"
```

---

## Phase 7: Security Hardening (Score 7/10 → 9.5/10)

### Task 17: Fix CSP — remove unsafe-eval

**Files:**

- Modify: `next.config.mjs:52-64`

**Step 1: Replace unsafe-eval with nonce-based CSP**

```javascript
// The issue: 'unsafe-eval' is needed by Stripe.js
// Solution: Keep unsafe-eval ONLY for Stripe, tighten everything else
value: [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://*.stripe.com https://*.sentry.io",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.stripe.com",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.stripe.com https://*.sentry.io",
  'frame-src https://*.stripe.com',
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; '),
```

Note: `'unsafe-eval'` removed. If Stripe breaks, add it back ONLY for `https://*.stripe.com`. Test Stripe checkout flow after this change.

**Step 2: Test Stripe checkout**

Manually test:

- Stripe checkout flow works
- Sentry error reporting works
- No CSP violations in browser console

**Step 3: Commit**

```bash
git add next.config.mjs
git commit -m "security: remove unsafe-eval from CSP — tighten script-src policy"
```

### Task 18: Add rate limiting headers and security audit

**Files:**

- Modify: All API routes that return 429

**Step 1: Add Retry-After header on rate limit responses**

```typescript
if (!allowed) {
  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: { 'Retry-After': '60' },
    },
  );
}
```

**Step 2: Commit**

```bash
git commit -m "security: add Retry-After header to rate-limited responses"
```

---

## Phase 8: Scalability for 200+ Restaurants (Architecture Review)

### Task 19: Verify RLS policies and connection pooling

**Step 1: Audit RLS policies via Supabase**

Run SQL to verify all public tables have RLS:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

Ensure every table with tenant data has:

- `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
- Policy filtering by `tenant_id`

**Step 2: Verify Supabase connection pooling**

Check Supabase dashboard → Settings → Database → Connection Pooling:

- Mode should be: **Transaction** (not Session)
- Pool size should be: **15-20** for 200 tenants

**Step 3: Document findings and commit**

### Task 20: Add database connection monitoring

**Files:**

- Create: `src/app/api/health/route.ts`

**Step 1: Create health check endpoint**

```typescript
import { NextResponse } from 'next/server';
import { createServerComponentClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();

  try {
    const supabase = await createServerComponentClient();
    const { error } = await supabase.from('tenants').select('id').limit(1);

    const dbLatency = Date.now() - start;

    if (error) {
      return NextResponse.json(
        { status: 'error', db: 'down', latency: dbLatency },
        { status: 503 },
      );
    }

    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      latency: dbLatency,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ status: 'error', db: 'unreachable' }, { status: 503 });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/health/
git commit -m "feat: add /api/health endpoint for monitoring DB latency"
```

---

## Phase 9: Loading & UX Optimization (Score 8/10 → 9.5/10)

### Task 21: Add ISR to marketing pages

**Files:**

- Modify: `src/app/(marketing)/page.tsx`
- Modify: `src/app/(marketing)/pricing/page.tsx`
- Modify: `src/app/(marketing)/features/page.tsx`

**Step 1: Add revalidate export**

```typescript
export const revalidate = 3600; // Regenerate every hour
```

**Step 2: Commit**

```bash
git commit -m "perf: add ISR (1h revalidate) to marketing pages — eliminate SSR overhead"
```

### Task 22: Add generateMetadata for tenant public pages

**Files:**

- Modify: `src/app/sites/[site]/page.tsx`
- Modify: `src/app/sites/[site]/layout.tsx`

**Step 1: Add dynamic metadata generation**

```typescript
import { getCachedTenant } from '@/lib/cache';

export async function generateMetadata({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const tenant = await getCachedTenant(site);

  if (!tenant) {
    return { title: 'Menu | ATTABL' };
  }

  return {
    title: `${tenant.name} — Menu Digital | ATTABL`,
    description: `Consultez le menu de ${tenant.name} et commandez en ligne.`,
    openGraph: {
      title: `${tenant.name} — Menu Digital`,
      description: `Consultez le menu de ${tenant.name} et commandez en ligne.`,
      ...(tenant.logo_url ? { images: [{ url: tenant.logo_url }] } : {}),
    },
  };
}
```

**Step 2: Commit**

```bash
git commit -m "feat: add dynamic SEO metadata for tenant public pages"
```

### Task 23: Optimize KDS real-time — incremental updates

**Files:**

- Modify: `src/hooks/useKitchenData.ts`

**Step 1: Handle inserts/updates incrementally instead of full refetch**

```typescript
onInsert: (payload) => {
  playNotification();
  // Add new order to state instead of full refetch
  setOrders((prev) => [payload.new as Order, ...prev]);
},
onUpdate: (payload) => {
  // Update specific order in state
  setOrders((prev) =>
    prev.map((o) => (o.id === payload.new.id ? { ...o, ...payload.new } : o)),
  );
},
onDelete: (payload) => {
  setOrders((prev) => prev.filter((o) => o.id !== payload.old.id));
},
```

Keep full refetch as fallback every 60s instead of 15s:

```typescript
const interval = setInterval(loadOrders, 60000); // Reduced from 15s to 60s
```

**Step 2: Run tests**

```bash
pnpm typecheck && pnpm test
```

**Step 3: Commit**

```bash
git add src/hooks/useKitchenData.ts
git commit -m "perf: KDS incremental real-time updates — reduce full refetches by 75%"
```

---

## Phase 10: Final Verification & Build

### Task 24: Run full quality gate

**Step 1: Run all checks**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

All 5 gates must pass with 0 errors.

**Step 2: Run bundle analysis**

```bash
ANALYZE=true pnpm build
```

Verify main bundle is under 200KB (first-load JS).

### Task 25: Performance smoke test

**Step 1: Start dev server and measure**

```bash
pnpm build && pnpm start
```

**Step 2: Check key metrics**

- Marketing page load: < 1s TTFB
- Admin dashboard load: < 2s
- Public menu page: < 1.5s
- API response times: < 200ms
- KDS real-time latency: < 500ms

### Task 26: Commit final changes and verify CI

```bash
git push origin main
```

Verify all 5 CI gates pass on GitHub Actions.

---

## Expected Final Scores

| Category        | Before | After | Key Changes                                        |
| --------------- | ------ | ----- | -------------------------------------------------- |
| Bundle Size     | 6.5    | 9.5   | -84KB lazy loads, dynamic imports, bundle analyzer |
| Middleware      | 5.0    | 9.5   | Public route skip, ~50-100ms saved per request     |
| Code Splitting  | 4.0    | 9.5   | 8+ dynamic imports vs 2                            |
| Caching serveur | 4.0    | 9.5   | unstable_cache + revalidateTag + HTTP headers      |
| Requêtes DB     | 6.0    | 9.5   | 10 indexes, fix N+1, no SELECT \*, explicit cols   |
| Hydration       | 8.0    | 9.5   | Better server/client split, ISR marketing          |
| Contextes React | 8.0    | 9.5   | refetchOnWindowFocus off, memoized callbacks       |
| Images & Fonts  | 7.5    | 9.5   | All next/image, sizes attr, priority LCP           |
| Animations      | 6.5    | 9.0   | Lazy framer-motion where possible                  |
| Loading states  | 8.0    | 9.5   | ISR, streaming, dynamic metadata                   |
| Security        | 7.0    | 9.5   | CSP hardened, Retry-After, form-action             |
| **Scalability** | 7.0    | 9.5   | Indexes, caching, health check, RLS verified       |

---

## Scalability Assessment: 200+ Restaurants

The current architecture IS sound for 200+ tenants:

1. **Multi-tenant via RLS + tenant_id** — PostgreSQL handles millions of rows efficiently with proper indexes
2. **Supabase connection pooling** — Transaction mode handles concurrent connections well
3. **Server-side caching** — After Phase 3, repeated reads are cached
4. **Edge middleware** — After Phase 1, public routes are lightweight
5. **Vercel serverless** — Auto-scales with traffic

**Bottleneck at 200+ tenants without this plan:** DB queries without indexes + no caching = degraded response times. With this plan, each tenant's data is efficiently cached and indexed.
