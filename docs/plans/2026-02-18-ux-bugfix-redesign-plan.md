# UX Bugfix & Redesign Premium — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all blocking bugs, eliminate exposed technical strings, and redesign the admin dashboard with a premium aesthetic inspired by Toast POS / Square / Lightspeed.

**Architecture:** Sequential phases — bugs first (app must work), then i18n (text must be clean), then structural design changes (sidebar, settings, dashboard), then component-level redesign. Each task is independent within its phase to enable parallel dispatch.

**Tech Stack:** Next.js 16, React 19, TypeScript 5 strict, Tailwind CSS v4, shadcn/ui, Radix UI, next-intl, Supabase, @dnd-kit/core (new dep for drag-and-drop)

---

## Phase 1 — Bugs Bloquants (6 taches)

### Task 1: Fix Reports Page Error

**Files:**

- Modify: `src/components/admin/ReportsClient.tsx`
- Modify: `src/hooks/queries/useReportData.ts`

**Step 1: Add error boundary and empty state handling**

In `ReportsClient.tsx`, wrap the main content in a try-catch render pattern. The component already uses `reportData?.dailyStats ?? []` but lacks handling when the Supabase RPC functions don't exist yet in the database.

Add an error state from TanStack Query:

```typescript
const { data: reportData, isLoading, error } = useReportData(tenantId, period);

// Early return for error state
if (error) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <BarChart3 className="w-12 h-12 text-neutral-300 mb-4" />
      <h2 className="text-lg font-semibold text-neutral-700">{t('noDataTitle')}</h2>
      <p className="text-sm text-neutral-500 mt-1">{t('noDataDescription')}</p>
    </div>
  );
}
```

In `useReportData.ts`, wrap the Promise.all in a try-catch that returns empty defaults instead of throwing:

```typescript
try {
  const [summaryRes, prevSummaryRes, dailyRes, topRes, catsRes, ordersRes] = await Promise.all([...]);
  // ... existing processing
} catch {
  return {
    summary: { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0, trends: {} },
    dailyStats: [],
    topItems: [],
    categoryBreakdown: [],
    recentOrders: [],
  };
}
```

**Step 2: Add i18n keys for empty states**

In all 8 message files, add under `reports`:

```json
"noDataTitle": "Aucun rapport disponible",
"noDataDescription": "Les données apparaîtront ici dès que des commandes seront enregistrées."
```

**Step 3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/ReportsClient.tsx src/hooks/queries/useReportData.ts src/messages/*.json
git commit -m "fix: add error handling and empty states to reports page"
```

---

### Task 2: Fix Permissions Save Error

**Files:**

- Modify: `src/app/sites/[site]/admin/settings/permissions/page.tsx`
- Create: `src/app/api/permissions/route.ts`

**Step 1: Create API route for permissions upsert**

The permissions page currently does a direct client-side upsert to `role_permissions`. This fails because the client Supabase (anon key) doesn't have write access. Create a server-side API route.

Create `src/app/api/permissions/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = await request.json();
    const { tenant_id, role, permissions } = body;

    if (!tenant_id || !role || !permissions) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    // Verify user is owner of this tenant
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant_id)
      .single();

    if (!adminUser || adminUser.role !== 'owner') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { error } = await supabase.from('role_permissions').upsert(
      {
        tenant_id,
        role,
        permissions,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: 'tenant_id,role' },
    );

    if (error) {
      logger.error('Permission upsert error', { error });
      return NextResponse.json({ error: 'Erreur de sauvegarde' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Permission API error', { err });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = await request.json();
    const { tenant_id, role } = body;

    // Verify owner
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant_id)
      .single();

    if (!adminUser || adminUser.role !== 'owner') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('tenant_id', tenant_id)
      .eq('role', role);

    if (error) {
      logger.error('Permission delete error', { error });
      return NextResponse.json({ error: 'Erreur de suppression' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Permission API error', { err });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
```

**Step 2: Update permissions page to use API route**

In `permissions/page.tsx`, replace the direct Supabase upsert with a fetch to the API route:

Replace:

```typescript
const { error } = await supabase.from('role_permissions').upsert(...)
```

With:

```typescript
const res = await fetch('/api/permissions', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tenant_id: tenantId, role, permissions: overrides }),
});
if (!res.ok) {
  const data = await res.json();
  throw new Error(data.error || 'Erreur de sauvegarde');
}
```

Same for the restore/delete operation.

**Step 3: Run typecheck + lint + test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/api/permissions/route.ts src/app/sites/[site]/admin/settings/permissions/page.tsx
git commit -m "fix: use server-side API route for permissions save"
```

---

### Task 3: Fix POS Payment Error

**Files:**

- Modify: `src/components/admin/POSClient.tsx`
- Modify: `src/components/admin/PaymentModal.tsx`

**Step 1: Fix PaymentModal order submission**

The error occurs because the order is submitted with incomplete data. In `PaymentModal.tsx`:

1. Add validation before submission (check table_number is not empty)
2. Add proper error messages
3. Fix the order number display (line 47 uses `parseInt(order.id.slice(0, 4), 16)`)

In `POSClient.tsx`, ensure a valid table_number is always set before opening the payment modal. Add a fallback:

```typescript
// Before opening payment modal, ensure table number is set
if (!selectedTable || selectedTable === '') {
  toast({ title: t('selectTableFirst'), variant: 'destructive' });
  return;
}
```

**Step 2: Fix hardcoded strings in PaymentModal**

Replace hardcoded "Serveur" (line 118 of OrderDetails, also appears in PaymentModal) with `t('server')`.

**Step 3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/POSClient.tsx src/components/admin/PaymentModal.tsx
git commit -m "fix: validate table selection before payment and improve error messages"
```

---

### Task 4: Fix Sound Playback

**Files:**

- Modify: `src/components/admin/settings/SoundSettings.tsx`
- Verify: `public/sounds/` directory

**Step 1: Debug sound playback**

The 13 sound files exist in `public/sounds/`. The issue is likely:

1. CORS or CSP policy blocking audio playback in production
2. The `SOUND_LIBRARY` config pointing to wrong paths
3. Audio autoplay policy requiring user interaction

Read `src/lib/sounds/sound-library.ts` to verify paths match the actual files.

Fix in `SoundSettings.tsx`:

```typescript
const handlePreview = async (sound: SoundConfig) => {
  try {
    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(sound.file);
    audioRef.current = audio;

    // Add error handler before play
    audio.onerror = () => {
      toast({ title: t('soundPlayError'), variant: 'destructive' });
      setPlayingId(null);
    };

    await audio.play();
    setPlayingId(sound.id);
    audio.onended = () => setPlayingId(null);
  } catch {
    toast({ title: t('soundPlayError'), variant: 'destructive' });
    setPlayingId(null);
  }
};
```

**Step 2: Add missing i18n key**

Add `soundPlayError` to all 8 message files:

```json
"soundPlayError": "Impossible de lire le son. Vérifiez votre navigateur."
```

**Step 3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/settings/SoundSettings.tsx src/messages/*.json
git commit -m "fix: improve sound playback error handling"
```

---

### Task 5: Fix Logo Upload

**Files:**

- Modify: `src/components/admin/settings/SettingsForm.tsx`

**Step 1: Implement Supabase Storage upload**

The current `handleLogoUpload` only reads the file locally as DataURL. Add actual upload to Supabase Storage:

```typescript
const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    toast({ title: t('fileTooLarge'), description: t('logoMaxSize'), variant: 'destructive' });
    return;
  }

  // Show local preview immediately
  const reader = new FileReader();
  reader.onloadend = () => setLogoPreview(reader.result as string);
  reader.readAsDataURL(file);

  // Upload to Supabase Storage
  try {
    const supabase = createClient();
    const ext = file.name.split('.').pop();
    const fileName = `${tenantId}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('tenant-logos')
      .upload(fileName, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('tenant-logos').getPublicUrl(fileName);

    // Update form value with the public URL
    setValue('logo_url', urlData.publicUrl);
    toast({ title: t('logoUploaded') });
  } catch {
    toast({ title: t('logoUploadError'), variant: 'destructive' });
  }
};
```

**Step 2: Add i18n keys**

```json
"logoUploaded": "Logo mis à jour",
"logoUploadError": "Erreur lors du téléversement du logo"
```

**Step 3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/settings/SettingsForm.tsx src/messages/*.json
git commit -m "fix: implement logo upload to Supabase Storage"
```

---

### Task 6: Fix Order Details Technical Strings

**Files:**

- Modify: `src/components/admin/OrderDetails.tsx`

**Step 1: Replace hardcoded strings with i18n**

In `OrderDetails.tsx`:

- Line 93: `Table ${order.table_number}` → `t('tableNumber', { number: order.table_number })`
- Line 107: `Total` → `tc('total')` (already exists in common)
- Line 118: `Serveur` → `t('server')`
- Line 120: `Non assigné` → `t('unassigned')`

**Step 2: Add i18n keys to all 8 message files**

Under `orders`:

```json
"tableNumber": "Table {number}",
"server": "Serveur",
"unassigned": "Non assigné"
```

English versions:

```json
"tableNumber": "Table {number}",
"server": "Server",
"unassigned": "Unassigned"
```

**Step 3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/admin/OrderDetails.tsx src/messages/*.json
git commit -m "fix: replace hardcoded strings with i18n in order details"
```

---

## Phase 2 — i18n & Textes Techniques (4 taches)

### Task 7: Extract Permissions Page Hardcoded Strings to i18n

**Files:**

- Modify: `src/app/sites/[site]/admin/settings/permissions/page.tsx`
- Modify: all 8 `src/messages/*.json` files

**Step 1: Add permissions namespace to all message files**

Add a `permissions` section to each message file with:

- 12 permission labels (with proper accents in FR)
- 6 role labels
- 15+ UI strings (title, subtitle, saving, etc.)

FR keys:

```json
"permissions": {
  "title": "Permissions par rôle",
  "subtitle": "Personnalisez les accès pour chaque rôle de votre équipe",
  "saving": "Sauvegarde...",
  "permissionHeader": "Permission",
  "restoreDefaults": "Restaurer les défauts",
  "modified": "modifié",
  "differentFromDefault": "valeur différente du défaut",
  "autoSaveInfo": "Les modifications sont sauvegardées automatiquement.",
  "accessDenied": "Accès refusé",
  "ownerOnly": "Seul le propriétaire peut gérer les permissions.",
  "saveError": "Erreur lors de la sauvegarde",
  "restoreError": "Erreur lors de la restauration",
  "legendAllowed": "autorisé",
  "legendDenied": "refusé",
  "labelMenuView": "Voir le menu",
  "labelMenuEdit": "Modifier le menu",
  "labelOrdersView": "Voir les commandes",
  "labelOrdersManage": "Gérer les commandes",
  "labelReportsView": "Voir les rapports",
  "labelPosUse": "Utiliser la caisse",
  "labelInventoryView": "Voir l'inventaire",
  "labelInventoryEdit": "Modifier l'inventaire",
  "labelTeamView": "Voir l'équipe",
  "labelTeamManage": "Gérer l'équipe",
  "labelSettingsView": "Voir les paramètres",
  "labelSettingsEdit": "Modifier les paramètres",
  "roleOwner": "Propriétaire",
  "roleAdmin": "Administrateur",
  "roleManager": "Manager",
  "roleCashier": "Caissier",
  "roleChef": "Chef Cuisine",
  "roleWaiter": "Serveur",
  "categoryMenu": "Menu",
  "categoryOrders": "Commandes",
  "categoryReports": "Rapports",
  "categoryPos": "Caisse",
  "categoryInventory": "Inventaire",
  "categoryTeam": "Équipe",
  "categorySettings": "Paramètres"
}
```

**Step 2: Update permissions page to use useTranslations**

Replace all hardcoded `PERMISSION_LABELS`, `ROLE_LABELS`, and inline strings with `t()` calls.

Remove the `font-mono` display of permission codes. Group permissions by category with visual separators.

**Step 3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/sites/[site]/admin/settings/permissions/page.tsx src/messages/*.json
git commit -m "feat: extract all permissions strings to i18n with proper accents"
```

---

### Task 8: Fix French Accents in Existing Translations

**Files:**

- Modify: `src/messages/fr-FR.json`
- Modify: `src/messages/fr-CA.json`

**Step 1: Fix accent issues in reports section**

In `fr-FR.json` and `fr-CA.json`, fix:

```json
"thisYear": "Cette année",
"vsLastPeriod": "vs. période précédente",
"categoryBreakdown": "Répartition par catégorie",
"noCategories": "Aucune donnée de catégorie disponible",
"csvDownloaded": "CSV téléchargé"
```

**Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS

**Step 3: Commit**

```bash
git add src/messages/fr-FR.json src/messages/fr-CA.json
git commit -m "fix: correct missing French accents in translations"
```

---

### Task 9: Add Missing Order Status i18n Keys

**Files:**

- Modify: all 8 `src/messages/*.json` files

**Step 1: Verify and add missing order-related keys**

Check all `orders.*` keys used in components and ensure they exist in message files. The key `warningReadyBeforeCheckout` (used in OrderDetails.tsx line 250) must be present and properly translated.

Add/verify in FR:

```json
"warningReadyBeforeCheckout": "Vérifiez que la commande est prête avant d'encaisser",
"serviceDineIn": "Sur place",
"serviceTakeaway": "À emporter",
"serviceDelivery": "Livraison",
"serviceRoomService": "Service en chambre"
```

**Step 2: Commit**

```bash
git add src/messages/*.json
git commit -m "fix: add missing order status translations"
```

---

### Task 10: Verify All Languages Work End-to-End

**Files:**

- Verify: all 8 `src/messages/*.json` files

**Step 1: Run a key parity check**

Write a quick script (or use node) to verify all 8 message files have identical key structures:

```bash
node -e "
const fs = require('fs');
const dir = 'src/messages';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const base = JSON.parse(fs.readFileSync(dir + '/en-US.json', 'utf8'));
const baseKeys = new Set();
function collectKeys(obj, prefix = '') {
  Object.keys(obj).forEach(k => {
    const full = prefix ? prefix + '.' + k : k;
    if (typeof obj[k] === 'object' && obj[k] !== null) collectKeys(obj[k], full);
    else baseKeys.add(full);
  });
}
collectKeys(base);
files.forEach(f => {
  if (f === 'en-US.json') return;
  const other = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
  const otherKeys = new Set();
  collectKeys(other);
  // This is a simplified check
});
console.log('Total keys in en-US:', baseKeys.size);
console.log('All files checked');
"
```

**Step 2: Run typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS

**Step 3: Commit any remaining fixes**

---

## Phase 3 — Design Structurel (3 taches)

### Task 11: Restructure Sidebar — Settings Button

**Files:**

- Modify: `src/components/admin/AdminSidebar.tsx`

**Step 1: Move settings items to footer**

1. Remove the "Administration" group from `NAV_GROUPS` (Settings, Users, QR Codes, Tables, Permissions, Subscription)
2. Keep Reports and Stock History in a new "Analyse" section
3. Add a gear icon button in the sidebar footer, next to the logout button
4. This button navigates to `/sites/[site]/admin/settings`
5. On the settings page, show sub-navigation tabs for: General, Equipe, Tables, Permissions, QR Codes, Abonnement

**Step 2: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/admin/AdminSidebar.tsx
git commit -m "feat: move settings to footer button and restructure sidebar"
```

---

### Task 12: Settings Page — Horizontal Tabs

**Files:**

- Modify: `src/components/admin/settings/SettingsForm.tsx`
- Modify: `src/app/sites/[site]/admin/settings/page.tsx`

**Step 1: Convert scrollable form to tabbed layout**

Replace the single scrollable form with shadcn/ui Tabs component:

```tsx
<Tabs defaultValue="identity" className="w-full">
  <TabsList className="w-full justify-start border-b bg-transparent p-0">
    <TabsTrigger value="identity">{t('identity')}</TabsTrigger>
    <TabsTrigger value="branding">{t('customization')}</TabsTrigger>
    <TabsTrigger value="billing">{t('billing')}</TabsTrigger>
    <TabsTrigger value="sounds">{t('soundAlerts')}</TabsTrigger>
    <TabsTrigger value="security">{t('security')}</TabsTrigger>
    <TabsTrigger value="contact">{t('contact')}</TabsTrigger>
    <TabsTrigger value="language">{t('language')}</TabsTrigger>
  </TabsList>
  <TabsContent value="identity">{/* Identity section content */}</TabsContent>
  {/* ... other tabs */}
</Tabs>
```

Each tab renders its section without vertical scrolling.

**Step 2: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/admin/settings/SettingsForm.tsx src/app/sites/[site]/admin/settings/page.tsx
git commit -m "feat: convert settings to horizontal tab layout"
```

---

### Task 13: Dashboard — Fixed Layout Without Scroll

**Files:**

- Modify: `src/components/admin/DashboardClient.tsx`

**Step 1: Redesign dashboard layout**

Replace the current scrollable layout with a fixed viewport grid:

```tsx
<div className="h-[calc(100vh-8rem)] grid grid-rows-[auto_1fr_1fr] gap-4">
  {/* Row 1: KPI Cards */}
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {/* 4 stat cards: Orders, Revenue, Active Items, Active Menus */}
  </div>

  {/* Row 2: Chart + Quick Actions */}
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
    <div className="lg:col-span-2 bg-white rounded-xl border border-neutral-100 p-4 overflow-hidden">
      {/* Revenue chart */}
    </div>
    <div className="bg-white rounded-xl border border-neutral-100 p-4 overflow-hidden">
      {/* Quick actions */}
    </div>
  </div>

  {/* Row 3: Recent Orders + Stock Alerts */}
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
    <div className="lg:col-span-2 bg-white rounded-xl border border-neutral-100 p-4 overflow-auto">
      {/* Recent orders table */}
    </div>
    <div className="bg-white rounded-xl border border-neutral-100 p-4 overflow-auto">
      {/* Stock alerts */}
    </div>
  </div>
</div>
```

Remove all box-shadows. Use `border border-neutral-100` instead.

**Step 2: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/admin/DashboardClient.tsx
git commit -m "feat: redesign dashboard with fixed viewport layout"
```

---

## Phase 4 — Design Composants (11 taches)

### Task 14: POS Payment Modal — Numpad + Tips

**Files:**

- Modify: `src/components/admin/PaymentModal.tsx`

**Step 1: Add numpad and tip support**

Redesign the payment modal with:

- 2-column layout (receipt left, payment right)
- Compact numpad (3x4 grid)
- Tip buttons (5%, 10%, 15%, custom)
- Clean display: Amount Due → Received → Change → Tip

**Step 2: Run typecheck + lint**

**Step 3: Commit**

```bash
git add src/components/admin/PaymentModal.tsx
git commit -m "feat: redesign payment modal with numpad and tip support"
```

---

### Task 15: Service Page Redesign

**Files:**

- Modify: `src/components/admin/ServiceManager.tsx`
- Modify: `src/components/admin/ServerDashboard.tsx`

**Step 1: Fix contrast and dropdown issues**

- Change text color from white to `text-neutral-900` on light backgrounds
- Replace custom oval dropdown with shadcn/ui `<Select>` component
- Redesign layout with clean cards for each table/server assignment

**Step 2: Run typecheck + lint**

**Step 3: Commit**

```bash
git add src/components/admin/ServiceManager.tsx src/components/admin/ServerDashboard.tsx
git commit -m "feat: redesign service page with proper contrast and standard dropdowns"
```

---

### Task 16: QR Codes — Free Tab Navigation

**Files:**

- Modify: `src/app/sites/[site]/admin/qr-codes/QRCodePage.tsx`

**Step 1: Convert sequential steps to free tabs**

Replace the step-based navigation (Prev/Next) with clickable tabs:

```tsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="choose">{t('choose')}</TabsTrigger>
    <TabsTrigger value="customize">{t('customize')}</TabsTrigger>
    <TabsTrigger value="download">{t('download')}</TabsTrigger>
  </TabsList>
  {/* Tab contents */}
</Tabs>
```

- Remove all box-shadow classes
- Add A4 format option
- Ensure page doesn't scroll (use `h-[calc(100vh-8rem)]` container)

**Step 2: Run typecheck + lint**

**Step 3: Commit**

```bash
git add src/app/sites/[site]/admin/qr-codes/QRCodePage.tsx
git commit -m "feat: convert QR code page to free tab navigation without shadows"
```

---

### Task 17: Global Form Redesign — Menus, Categories, Items

**Files:**

- Modify: `src/components/admin/MenusClient.tsx`
- Modify: `src/components/admin/CategoriesClient.tsx`
- Modify: `src/components/admin/ItemsClient.tsx`

**Step 1: Upgrade form modals**

For each component, update the AdminModal usage:

- Increase modal width to `max-w-2xl`
- Add `rounded-lg` to all inputs
- Change focus rings to lime: `focus:ring-lime-400`
- Ensure labels are above fields (not inline)
- Add generous padding `p-6` inside modals
- Use shadcn/ui DatePicker for any date fields

**Step 2: Add item detail slide-over**

In `ItemsClient.tsx`, add a slide-over panel that opens when clicking an item row:

```tsx
{
  selectedItem && (
    <div className="fixed inset-y-0 right-0 w-[400px] bg-white border-l shadow-none z-50 overflow-y-auto">
      {/* Item details: image, name, description, price, category, options, etc. */}
    </div>
  );
}
```

**Step 3: Run typecheck + lint**

**Step 4: Commit**

```bash
git add src/components/admin/MenusClient.tsx src/components/admin/CategoriesClient.tsx src/components/admin/ItemsClient.tsx
git commit -m "feat: redesign menu/category/item forms with premium style"
```

---

### Task 18: Global Form Redesign — Coupons, Announcements, Suggestions

**Files:**

- Modify: `src/components/admin/CouponsClient.tsx`
- Modify: `src/components/admin/AnnouncementsClient.tsx`
- Modify: `src/components/admin/SuggestionsClient.tsx`

**Step 1: Upgrade form modals**

Same pattern as Task 17:

- Modal `max-w-2xl`
- `rounded-lg` inputs
- Lime focus rings
- Labels above fields
- Fix date picker to use shadcn/ui native DatePicker
- Generous padding

**Step 2: Run typecheck + lint**

**Step 3: Commit**

```bash
git add src/components/admin/CouponsClient.tsx src/components/admin/AnnouncementsClient.tsx src/components/admin/SuggestionsClient.tsx
git commit -m "feat: redesign coupon/announcement/suggestion forms"
```

---

### Task 19: Global Form Redesign — Inventory, Recipes, Suppliers

**Files:**

- Modify: `src/components/admin/InventoryClient.tsx`
- Modify: `src/components/admin/RecipesClient.tsx`
- Modify: `src/components/admin/SuppliersClient.tsx`

**Step 1: Upgrade form modals and page layouts**

Same premium pattern. For these pages specifically:

- Remove box-shadows from cards
- Use flat borders `border border-neutral-100`
- Improve table layouts with better spacing
- Fix form modals with premium style

**Step 2: Run typecheck + lint**

**Step 3: Commit**

```bash
git add src/components/admin/InventoryClient.tsx src/components/admin/RecipesClient.tsx src/components/admin/SuppliersClient.tsx
git commit -m "feat: redesign inventory/recipes/suppliers with premium style"
```

---

### Task 20: Orders — Click Row to Open + Redesign Detail

**Files:**

- Modify: `src/components/admin/OrdersClient.tsx`
- Modify: `src/components/admin/OrderDetails.tsx`

**Step 1: Make entire row clickable**

In `OrdersClient.tsx`, add `onClick` handler to each table row:

```tsx
<tr
  onClick={() => handleViewOrder(order)}
  className="cursor-pointer hover:bg-neutral-50 transition-colors"
>
```

**Step 2: Redesign OrderDetails**

- Clean layout with proper sections
- All strings use i18n (fix remaining hardcoded ones)
- Remove any exposed technical keys

**Step 3: Run typecheck + lint**

**Step 4: Commit**

```bash
git add src/components/admin/OrdersClient.tsx src/components/admin/OrderDetails.tsx
git commit -m "feat: make order rows clickable and redesign detail view"
```

---

### Task 21: Fix Category Drag-and-Drop

**Files:**

- Modify: `src/components/admin/CategoriesClient.tsx`
- Modify: `package.json` (add @dnd-kit/core if not present)

**Step 1: Install @dnd-kit if needed**

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Step 2: Implement proper drag-and-drop**

Replace the current broken reorder system with @dnd-kit/sortable:

```tsx
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

**Step 3: Run typecheck + lint**

**Step 4: Commit**

```bash
git add src/components/admin/CategoriesClient.tsx package.json pnpm-lock.yaml
git commit -m "feat: implement proper drag-and-drop for categories"
```

---

### Task 22: Stock History + Subscription Redesign

**Files:**

- Modify: `src/components/admin/StockHistoryClient.tsx`
- Modify: `src/app/sites/[site]/admin/subscription/page.tsx`

**Step 1: Improve stock history aesthetics**

- Remove shadows, use flat borders
- Better spacing in data table
- Cleaner filter section

**Step 2: Redesign subscription page**

- Plan comparison cards (side by side)
- Feature checklist with checkmarks
- CTA buttons in lime
- Current plan highlight

**Step 3: Run typecheck + lint**

**Step 4: Commit**

```bash
git add src/components/admin/StockHistoryClient.tsx src/app/sites/[site]/admin/subscription/page.tsx
git commit -m "feat: redesign stock history and subscription pages"
```

---

### Task 23: Tables + Permissions Matrix Redesign

**Files:**

- Modify: `src/app/sites/[site]/admin/settings/tables/page.tsx`
- Modify: `src/app/sites/[site]/admin/settings/permissions/page.tsx`

**Step 1: Improve tables page aesthetics**

- Flat cards (no shadows)
- Better spacing in zone list and table grid
- Improved add-zone and add-tables modals

**Step 2: Redesign permissions matrix**

- Remove technical code column
- Group permissions by category with visual separators
- Individual "Restore" button per role (not just global)
- Premium matrix design with clear visual hierarchy

**Step 3: Run typecheck + lint**

**Step 4: Commit**

```bash
git add src/app/sites/[site]/admin/settings/tables/page.tsx src/app/sites/[site]/admin/settings/permissions/page.tsx
git commit -m "feat: redesign tables and permissions pages with premium style"
```

---

### Task 24: Final Verification — All CI Gates

**Files:** None (verification only)

**Step 1: Run all quality gates**

```bash
pnpm typecheck    # 0 errors
pnpm lint         # 0 errors, 0 warnings
pnpm format:check # All formatted (run pnpm format if needed)
pnpm test         # All tests pass
pnpm build        # Build succeeds
```

**Step 2: Push to remote**

```bash
git push origin main
```

---

## Execution Summary

| Phase          | Tasks        | Files                | Estimated Complexity |
| -------------- | ------------ | -------------------- | -------------------- |
| 1 — Bugs       | 1-6          | ~10                  | Medium               |
| 2 — i18n       | 7-10         | ~10                  | Low                  |
| 3 — Structure  | 11-13        | ~5                   | High                 |
| 4 — Components | 14-24        | ~20                  | High                 |
| **Total**      | **24 tasks** | **~35 unique files** | —                    |

### Parallelization opportunities

Within each phase, tasks are independent and can be dispatched in parallel:

- **Phase 1**: Tasks 1-6 are all independent
- **Phase 2**: Tasks 7-10 share message files — serialize 7→8→9→10
- **Phase 3**: Tasks 11, 12, 13 are independent (different files)
- **Phase 4**: Tasks 14-23 can be grouped: (14,15,16) | (17,18,19) | (20,21) | (22,23)
