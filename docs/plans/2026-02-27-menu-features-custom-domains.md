# Menu Features & Custom Domain Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 6 features: drag-and-drop menu reordering, shared menu toggle, PDF import via Claude API, custom domain support, venue URL parameter, and venue-based client filtering.

**Architecture:** Each feature is a self-contained task modifying specific layers (DB → service → API → UI). The existing patterns (excel import, @dnd-kit categories, middleware proxy) serve as reference implementations. All features maintain backward compatibility.

**Tech Stack:** Next.js 16 + Supabase + @dnd-kit/sortable + @anthropic-ai/sdk + pdf-parse + Tailwind CSS v4

---

## Task 1: Drag & Drop Menu Reordering

**Context:** The backend infrastructure exists (`actionReorderMenus`, `menuService.reorderMenus`, `useMenusData.reorder`). The `@dnd-kit` packages are installed and used in `CategoriesClient.tsx`. Only the UI wiring in `MenusTable.tsx` is missing.

**Files:**

- Modify: `src/components/features/menus/MenusTable.tsx`

**Step 1: Add @dnd-kit imports and wrap MenusTable with DndContext**

Replace the current `MenusTable.tsx` with drag-and-drop support. Follow the exact pattern from `CategoriesClient.tsx`.

Add imports at the top of the file (after existing imports):

```typescript
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

Add `GripVertical` to the lucide-react import:

```typescript
import {
  Plus,
  Folder,
  ChevronRight,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Building2,
  GripVertical,
} from 'lucide-react';
```

**Step 2: Add useSortable to MenuCard**

Modify the `MenuCard` component to accept sortable props. The component signature changes to use `useSortable`:

```typescript
function MenuCard({ menu, tenantSlug, onEdit, onDelete, onToggle, onAddChild }: MenuCardProps) {
  const t = useTranslations('menus');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: menu.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-white rounded-xl border border-neutral-100 hover:border-neutral-200 transition-all group',
        isDragging && 'shadow-lg border-[#CCFF00]',
      )}
    >
      <div className="flex items-center gap-4 p-4">
        {/* Drag handle */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="touch-none cursor-grab active:cursor-grabbing focus:outline-none"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4 text-neutral-300" />
        </button>
        {/* ... rest of existing MenuCard content (folder icon, name, badges, buttons) ... */}
```

**Step 3: Wrap menu lists with DndContext + SortableContext**

In the `MenusTable` component, add sensors and handleDragEnd:

```typescript
export default function MenusTable({ /* ...existing props... */ }: MenusTableProps) {
  const t = useTranslations('menus');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Find indices across all menus (standalone + venue-grouped, flat)
    const allMenus = [...filteredStandalone, ...Object.values(menusByVenue).flat()];
    const oldIndex = allMenus.findIndex((m) => m.id === active.id);
    const newIndex = allMenus.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(oldIndex, newIndex);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      {/* Loading state ... */}

      {/* Standalone menus */}
      {filteredStandalone.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest px-1">
            {t('independentMenus')}
          </p>
          <SortableContext items={filteredStandalone.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            {filteredStandalone.map((menu, index) => (
              <MenuCard key={menu.id} menu={menu} tenantSlug={tenantSlug} index={index}
                onEdit={() => onEdit(menu)} onDelete={() => onDelete(menu)}
                onToggle={() => onToggle(menu)} onAddChild={() => onAddChild(menu.id)}
                onReorder={onReorder} />
            ))}
          </SortableContext>
        </div>
      )}

      {/* Menus by venue — each venue gets its own SortableContext */}
      {Object.entries(menusByVenue).map(([venueId, venueMenus]) => {
        const venue = venues.find((v) => v.id === venueId);
        const filtered = venueMenus.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()));
        if (filtered.length === 0) return null;
        return (
          <div key={venueId} className="space-y-3">
            {/* venue header ... */}
            <SortableContext items={filtered.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              {filtered.map((menu, index) => (
                <MenuCard key={menu.id} menu={menu} tenantSlug={tenantSlug} index={index}
                  onEdit={() => onEdit(menu)} onDelete={() => onDelete(menu)}
                  onToggle={() => onToggle(menu)} onAddChild={() => onAddChild(menu.id)}
                  onReorder={onReorder} />
              ))}
            </SortableContext>
          </div>
        );
      })}

      {/* Empty state ... */}
    </DndContext>
  );
}
```

**Step 4: Verify**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

**Step 5: Commit**

```bash
git add src/components/features/menus/MenusTable.tsx
git commit -m "feat: wire drag-and-drop menu reordering using @dnd-kit"
```

---

## Task 2: Shared Menu Toggle & Badge

**Context:** Currently `venue_id = null` means "shared/independent" but there's no explicit UI toggle. We keep the existing `venue_id` approach (no DB migration needed) and add a clear checkbox + badge in the UI.

**Files:**

- Modify: `src/components/features/menus/MenuForm.tsx`
- Modify: `src/components/features/menus/MenusTable.tsx` (add badge)
- Modify: `src/messages/fr-FR.json` (add i18n keys)
- Modify: `src/messages/en-US.json` (add i18n keys)
- Modify: All other locale files (en-AU, en-CA, en-GB, en-IE, fr-CA, es-ES)

**Step 1: Add i18n keys to all locale files**

Add inside the `"menus"` object in each locale file:

**fr-FR.json / fr-CA.json:**

```json
"sharedMenu": "Menu partagé (visible dans tous les espaces)",
"sharedMenuBadge": "Partagé",
"sharedMenuHint": "Ce menu sera visible dans tous vos espaces (ex: Carte des Boissons)"
```

**en-US.json / en-AU.json / en-CA.json / en-GB.json / en-IE.json:**

```json
"sharedMenu": "Shared menu (visible in all spaces)",
"sharedMenuBadge": "Shared",
"sharedMenuHint": "This menu will be visible in all your spaces (e.g., Drinks Menu)"
```

**es-ES.json:**

```json
"sharedMenu": "Menú compartido (visible en todos los espacios)",
"sharedMenuBadge": "Compartido",
"sharedMenuHint": "Este menú será visible en todos sus espacios (ej: Carta de Bebidas)"
```

**Step 2: Add shared toggle to MenuForm.tsx**

Add a `Globe` icon import from lucide-react.

After the `formIsActive` state, add:

```typescript
const [formIsShared, setFormIsShared] = useState<boolean>(
  editingMenu ? !editingMenu.venue_id : false,
);
```

Add this block BEFORE the venue/parent grid (before line 126):

```typescript
{/* Shared menu toggle */}
{venues.length > 0 && (
  <div className="flex items-center gap-3 p-3 bg-lime-50/50 border border-lime-100 rounded-lg">
    <input
      type="checkbox"
      id="menu-shared"
      checked={formIsShared}
      onChange={(e) => {
        setFormIsShared(e.target.checked);
        if (e.target.checked) setFormVenueId(null);
      }}
      className="rounded border-neutral-200 text-lime-500 focus:ring-lime-400"
    />
    <div>
      <Label htmlFor="menu-shared" className="text-neutral-900 font-medium">
        {t('sharedMenu')}
      </Label>
      <p className="text-xs text-neutral-500 mt-0.5">{t('sharedMenuHint')}</p>
    </div>
  </div>
)}
```

Disable the venue select when shared is checked:

```typescript
<select
  id="menu-venue"
  value={formVenueId || ''}
  onChange={(e) => setFormVenueId(e.target.value || null)}
  disabled={formIsShared}
  className={cn(
    'w-full rounded-lg border border-neutral-100 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-lime-400',
    formIsShared && 'opacity-50 cursor-not-allowed',
  )}
>
```

**Step 3: Add "Shared" badge to MenuCard in MenusTable.tsx**

Import `Globe` from lucide-react.

In MenuCard, after the existing venue badge (line 72-76), add:

```typescript
{!menu.venue_id && venues.length > 0 && (
  <Badge variant="outline" className="text-[10px] gap-1 border-lime-200 text-lime-700 bg-lime-50">
    <Globe className="w-2.5 h-2.5" />
    {t('sharedMenuBadge')}
  </Badge>
)}
```

Where `venues` needs to be passed as a prop to MenuCard. Add `venues: Venue[]` to `MenuCardProps` and pass it from MenusTable.

**Step 4: Verify**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

**Step 5: Commit**

```bash
git add src/components/features/menus/MenuForm.tsx src/components/features/menus/MenusTable.tsx src/messages/
git commit -m "feat: add explicit shared menu toggle and badge in menu dashboard"
```

---

## Task 3: PDF Menu Import with Claude API

**Context:** Follow the exact pattern from the Excel import (`excel-import.service.ts`, `MenuImportExcel.tsx`, `/api/menu-import`). The Claude API extracts structured data from PDF text. No images — only text, categories, and prices.

**Files:**

- Create: `src/services/pdf-import.service.ts`
- Create: `src/components/features/menus/MenuImportPDF.tsx`
- Create: `src/app/api/menu-import-pdf/route.ts`
- Modify: `src/lib/rate-limit.ts` (add limiter)
- Modify: `src/messages/fr-FR.json` (add keys)
- Modify: `src/messages/en-US.json` (add keys)
- Modify: All other locale files
- Modify: `src/components/admin/MenusClient.tsx` (add PDF import button)

**Step 1: Install dependencies**

```bash
pnpm add @anthropic-ai/sdk pdf-parse
pnpm add -D @types/pdf-parse
```

**Step 2: Add ANTHROPIC_API_KEY to `.env.local`**

```
ANTHROPIC_API_KEY=<user's key>
```

**Step 3: Add rate limiter**

In `src/lib/rate-limit.ts`, add after the excel limiter:

```typescript
/** PDF menu import: 5 requests / hour per IP */
export const pdfImportLimiter = createLimiter('pdf-import', Ratelimit.slidingWindow(5, '1 h'));
```

**Step 4: Add i18n keys**

Add inside the `"menus"` object in fr-FR.json:

```json
"importPdf": "Importer PDF",
"importPdfTitle": "Importer depuis un PDF",
"pdfDragAndDrop": "Glissez-déposez un fichier PDF ici ou cliquez pour parcourir",
"pdfMaxFileSize": "Taille max : 10 Mo",
"pdfImporting": "Extraction en cours (IA)...",
"pdfPreview": "Prévisualisation",
"pdfPreviewDesc": "Vérifiez les données extraites avant de valider",
"pdfConfirmImport": "Confirmer l'import",
"pdfExtracted": "{count} plat(s) extraits du PDF",
"pdfNoData": "Aucune donnée n'a pu être extraite de ce PDF",
"pdfExtractionError": "Erreur lors de l'extraction du PDF"
```

Equivalent in en-US.json:

```json
"importPdf": "Import PDF",
"importPdfTitle": "Import from PDF",
"pdfDragAndDrop": "Drag and drop a PDF file here or click to browse",
"pdfMaxFileSize": "Max size: 10 MB",
"pdfImporting": "Extracting (AI)...",
"pdfPreview": "Preview",
"pdfPreviewDesc": "Review extracted data before confirming",
"pdfConfirmImport": "Confirm import",
"pdfExtracted": "{count} item(s) extracted from PDF",
"pdfNoData": "No data could be extracted from this PDF",
"pdfExtractionError": "Error extracting from PDF"
```

**Step 5: Create `src/services/pdf-import.service.ts`**

````typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@/lib/logger';

// ─── Types ──────────────────────────────────────────────

export interface PdfExtractedItem {
  category: string;
  name: string;
  description?: string;
  price: number;
}

export interface PdfExtractionResult {
  items: PdfExtractedItem[];
  rawText: string;
}

export interface PdfImportResult {
  categoriesCreated: number;
  categoriesExisting: number;
  itemsCreated: number;
  itemsSkipped: number;
  errors: { row: number; message: string }[];
}

// ─── Service ────────────────────────────────────────────

export function createPdfImportService(supabase: SupabaseClient) {
  /**
   * Step 1: Extract structured data from PDF text using Claude API.
   */
  async function extractFromPdf(pdfBuffer: Buffer): Promise<PdfExtractionResult> {
    // Dynamic import of pdf-parse (CommonJS module)
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(pdfBuffer);
    const rawText = parsed.text;

    if (!rawText || rawText.trim().length < 10) {
      return { items: [], rawText: rawText || '' };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Tu es un expert en extraction de données de menus de restaurant. Analyse le texte suivant extrait d'un menu PDF et retourne un JSON structuré.

RÈGLES STRICTES :
- Chaque plat doit avoir : category (nom de la catégorie), name (nom du plat), description (optionnel), price (nombre, en devise locale)
- Respecte l'ORDRE exact tel qu'il apparaît dans le PDF
- Les catégories doivent être dans l'ordre d'apparition
- Les plats doivent être dans l'ordre d'apparition sous chaque catégorie
- Si un prix n'est pas trouvé, mets 0
- Ignore les headers, footers, numéros de page
- N'invente AUCUNE donnée — extrait uniquement ce qui est dans le texte

Retourne UNIQUEMENT un JSON valide (pas de markdown, pas de commentaire) :
[
  { "category": "...", "name": "...", "description": "...", "price": 0 }
]

TEXTE DU MENU :
${rawText}`,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    try {
      // Clean potential markdown wrapping
      const jsonStr = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const items: PdfExtractedItem[] = JSON.parse(jsonStr);
      return { items, rawText };
    } catch (parseError) {
      logger.error('Failed to parse Claude API response', parseError);
      return { items: [], rawText };
    }
  }

  /**
   * Step 2: Import extracted items into the database.
   * Mirrors the logic from excel-import.service.ts.
   */
  async function importItems(
    tenantId: string,
    menuId: string,
    items: PdfExtractedItem[],
  ): Promise<PdfImportResult> {
    const result: PdfImportResult = {
      categoriesCreated: 0,
      categoriesExisting: 0,
      itemsCreated: 0,
      itemsSkipped: 0,
      errors: [],
    };

    if (items.length === 0) return result;

    // Group by category (preserve order)
    const categoryMap = new Map<string, PdfExtractedItem[]>();
    for (const item of items) {
      const catName = item.category.trim();
      if (!catName) {
        result.errors.push({
          row: result.itemsSkipped + result.itemsCreated + 1,
          message: 'Catégorie manquante',
        });
        result.itemsSkipped++;
        continue;
      }
      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, []);
      }
      categoryMap.get(catName)!.push(item);
    }

    // Get existing categories for this menu
    const { data: existingCats } = await supabase
      .from('categories')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('menu_id', menuId);

    const existingCatMap = new Map(
      (existingCats || []).map((c: { id: string; name: string }) => [c.name.toLowerCase(), c.id]),
    );

    // Get max display_order for categories
    const { data: maxCatOrder } = await supabase
      .from('categories')
      .select('display_order')
      .eq('tenant_id', tenantId)
      .eq('menu_id', menuId)
      .order('display_order', { ascending: false })
      .limit(1);

    let nextCatOrder = (maxCatOrder?.[0]?.display_order ?? -1) + 1;

    // Process each category group
    for (const [catName, catItems] of categoryMap) {
      let categoryId = existingCatMap.get(catName.toLowerCase());

      if (categoryId) {
        result.categoriesExisting++;
      } else {
        // Create category
        const { data: newCat, error: catError } = await supabase
          .from('categories')
          .insert({
            tenant_id: tenantId,
            menu_id: menuId,
            name: catName,
            display_order: nextCatOrder++,
            is_active: true,
          })
          .select('id')
          .single();

        if (catError || !newCat) {
          result.errors.push({
            row: 0,
            message: `Erreur création catégorie "${catName}": ${catError?.message}`,
          });
          result.itemsSkipped += catItems.length;
          continue;
        }
        categoryId = newCat.id;
        result.categoriesCreated++;
      }

      // Get max item display_order
      const { data: maxItemOrder } = await supabase
        .from('menu_items')
        .select('display_order')
        .eq('tenant_id', tenantId)
        .eq('category_id', categoryId)
        .order('display_order', { ascending: false })
        .limit(1);

      let nextItemOrder = (maxItemOrder?.[0]?.display_order ?? -1) + 1;

      // Insert items
      for (const item of catItems) {
        if (!item.name || item.name.trim().length === 0) {
          result.errors.push({
            row: result.itemsCreated + result.itemsSkipped + 1,
            message: 'Nom du plat manquant',
          });
          result.itemsSkipped++;
          continue;
        }

        const slug = item.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        const { error: itemError } = await supabase.from('menu_items').insert({
          tenant_id: tenantId,
          category_id: categoryId,
          name: item.name.trim(),
          description: item.description?.trim() || null,
          price: item.price || 0,
          is_available: true,
          is_featured: false,
          display_order: nextItemOrder++,
          slug,
        });

        if (itemError) {
          result.errors.push({
            row: result.itemsCreated + result.itemsSkipped + 1,
            message: `Erreur item "${item.name}": ${itemError.message}`,
          });
          result.itemsSkipped++;
        } else {
          result.itemsCreated++;
        }
      }
    }

    return result;
  }

  return { extractFromPdf, importItems };
}
````

**Step 6: Create `src/app/api/menu-import-pdf/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { pdfImportLimiter, getClientIp } from '@/lib/rate-limit';
import { createPdfImportService } from '@/services/pdf-import.service';
import { logger } from '@/lib/logger';

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  // 1. Rate limiting
  const ip = getClientIp(request);
  const { success: allowed } = await pdfImportLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  // 2. Auth
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  // 3. Tenant
  const tenantSlug = request.headers.get('x-tenant-slug');
  if (!tenantSlug) {
    return NextResponse.json({ error: 'Tenant non identifié' }, { status: 400 });
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', tenantSlug)
    .single();

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant introuvable' }, { status: 404 });
  }

  try {
    // 4. Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const menuId = formData.get('menuId') as string | null;
    const action = formData.get('action') as string | null; // 'extract' or 'import'

    if (!file || !menuId) {
      return NextResponse.json({ error: 'Fichier et menu requis' }, { status: 400 });
    }

    // 5. File validation
    if (file.size > MAX_PDF_SIZE) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 10 Mo)' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf') {
      return NextResponse.json({ error: 'Seuls les fichiers PDF sont acceptés' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const importService = createPdfImportService(supabase);

    // 6a. Extract only (preview step)
    if (action === 'extract') {
      const extraction = await importService.extractFromPdf(buffer);
      return NextResponse.json({
        success: true,
        items: extraction.items,
        itemCount: extraction.items.length,
      });
    }

    // 6b. Extract + import (from preview data passed as JSON)
    const itemsJson = formData.get('items') as string | null;
    let items;

    if (itemsJson) {
      // Items come from the preview step (user may have edited them)
      items = JSON.parse(itemsJson);
    } else {
      // Direct import: extract then import in one shot
      const extraction = await importService.extractFromPdf(buffer);
      items = extraction.items;
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Aucune donnée extraite du PDF' }, { status: 400 });
    }

    const result = await importService.importItems(tenant.id, menuId, items);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('PDF import error', error);
    return NextResponse.json({ error: "Erreur serveur lors de l'import" }, { status: 500 });
  }
}
```

**Step 7: Create `src/components/features/menus/MenuImportPDF.tsx`**

```typescript
'use client';

import { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Upload, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import type { Menu } from '@/types/admin.types';
import type { PdfExtractedItem } from '@/services/pdf-import.service';

interface MenuImportPDFProps {
  menus: Menu[];
  tenantSlug: string;
  onSuccess: () => void;
}

type Step = 'upload' | 'extracting' | 'preview' | 'importing' | 'done';

export default function MenuImportPDF({ menus, tenantSlug, onSuccess }: MenuImportPDFProps) {
  const t = useTranslations('menus');
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [selectedMenuId, setSelectedMenuId] = useState<string>(menus[0]?.id || '');
  const [file, setFile] = useState<File | null>(null);
  const [extractedItems, setExtractedItems] = useState<PdfExtractedItem[]>([]);
  const [result, setResult] = useState<{
    categoriesCreated: number;
    itemsCreated: number;
    itemsSkipped: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') {
      setFile(dropped);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  }, []);

  const handleExtract = async () => {
    if (!file || !selectedMenuId) return;
    setStep('extracting');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('menuId', selectedMenuId);
      formData.append('action', 'extract');

      const res = await fetch('/api/menu-import-pdf', {
        method: 'POST',
        headers: { 'x-tenant-slug': tenantSlug },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.items.length === 0) {
        toast({ title: t('pdfNoData'), variant: 'destructive' });
        setStep('upload');
        return;
      }

      setExtractedItems(data.items);
      setStep('preview');
    } catch (err) {
      toast({ title: t('pdfExtractionError'), variant: 'destructive' });
      setStep('upload');
    }
  };

  const handleConfirmImport = async () => {
    if (!file || !selectedMenuId) return;
    setStep('importing');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('menuId', selectedMenuId);
      formData.append('items', JSON.stringify(extractedItems));

      const res = await fetch('/api/menu-import-pdf', {
        method: 'POST',
        headers: { 'x-tenant-slug': tenantSlug },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResult(data);
      setStep('done');
      onSuccess();
    } catch (err) {
      toast({ title: t('importError'), variant: 'destructive' });
      setStep('preview');
    }
  };

  const removeItem = (index: number) => {
    setExtractedItems((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* Menu selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-neutral-900">{t('targetMenu')}</label>
        <select
          value={selectedMenuId}
          onChange={(e) => setSelectedMenuId(e.target.value)}
          className="w-full rounded-lg border border-neutral-100 bg-white px-3 py-2 text-sm"
        >
          <option value="">{t('selectTargetMenu')}</option>
          {menus.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Upload zone */}
      {step === 'upload' && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-neutral-200 rounded-xl p-8 text-center cursor-pointer hover:border-lime-300 transition-colors"
        >
          <FileText className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-600">{t('pdfDragAndDrop')}</p>
          <p className="text-xs text-neutral-400 mt-1">{t('pdfMaxFileSize')}</p>
          {file && (
            <p className="text-sm text-lime-600 font-medium mt-3">{file.name}</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {/* Upload button */}
      {step === 'upload' && file && selectedMenuId && (
        <Button onClick={handleExtract} variant="lime" className="w-full">
          <Upload className="w-4 h-4 mr-2" />
          {t('importPdf')}
        </Button>
      )}

      {/* Extracting spinner */}
      {step === 'extracting' && (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-lime-500 mx-auto mb-3" />
          <p className="text-sm text-neutral-600">{t('pdfImporting')}</p>
        </div>
      )}

      {/* Preview */}
      {step === 'preview' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-900">{t('pdfPreview')}</p>
            <span className="text-xs text-neutral-500">
              {t('pdfExtracted', { count: extractedItems.length })}
            </span>
          </div>
          <p className="text-xs text-neutral-500">{t('pdfPreviewDesc')}</p>
          <div className="max-h-80 overflow-y-auto space-y-1 border border-neutral-100 rounded-lg p-2">
            {extractedItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs p-2 bg-neutral-50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-neutral-400">{item.category}</span>
                  <span className="mx-1 text-neutral-300">→</span>
                  <span className="font-medium text-neutral-900">{item.name}</span>
                  {item.description && (
                    <span className="text-neutral-400 ml-1 truncate">— {item.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="font-semibold text-neutral-700 whitespace-nowrap">
                    {item.price > 0 ? `${item.price.toLocaleString()}` : '—'}
                  </span>
                  <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Button onClick={handleConfirmImport} variant="lime" className="w-full">
            {t('pdfConfirmImport')}
          </Button>
        </div>
      )}

      {/* Importing spinner */}
      {step === 'importing' && (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-lime-500 mx-auto mb-3" />
          <p className="text-sm text-neutral-600">{t('importing')}</p>
        </div>
      )}

      {/* Done */}
      {step === 'done' && result && (
        <div className="text-center py-6 space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="text-sm font-medium text-neutral-900">{t('importSuccess')}</p>
          <div className="text-xs text-neutral-500 space-y-0.5">
            <p>{t('categoriesCreated', { count: result.categoriesCreated })}</p>
            <p>{t('itemsCreated', { count: result.itemsCreated })}</p>
            {result.itemsSkipped > 0 && <p>{t('itemsSkipped', { count: result.itemsSkipped })}</p>}
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 text-left bg-red-50 rounded-lg p-3 max-h-32 overflow-y-auto">
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600">
                  <AlertCircle className="w-3 h-3 inline mr-1" />
                  {err.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 8: Wire MenuImportPDF into MenusClient.tsx**

Find where the Excel import button/modal is rendered in `MenusClient.tsx` and add a PDF import tab/button alongside it. The component should be lazy-loaded:

```typescript
import MenuImportPDF from '@/components/features/menus/MenuImportPDF';
```

Add a tab or second button next to the Excel import in the import dialog/section.

**Step 9: Verify**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

**Step 10: Commit**

```bash
git add src/services/pdf-import.service.ts src/components/features/menus/MenuImportPDF.tsx src/app/api/menu-import-pdf/route.ts src/lib/rate-limit.ts src/messages/ src/components/admin/MenusClient.tsx
git commit -m "feat: add PDF menu import with Claude AI extraction"
```

---

## Task 4: Custom Domain Support

**Context:** Add a `custom_domain` column to tenants, modify middleware to do a domain→tenant lookup, add admin UI for domain configuration, and integrate Vercel Domains API for automatic provisioning.

**Files:**

- Create: `supabase/migrations/20260227_custom_domains.sql`
- Modify: `src/proxy.ts` (add custom domain lookup)
- Modify: `src/lib/cache.ts` (add getCachedTenantByDomain)
- Modify: `src/components/admin/settings/SettingsForm.tsx` (add domain tab)
- Create: `src/components/admin/settings/SettingsDomain.tsx`
- Modify: `src/app/actions/tenant-settings.ts` (handle domain update)
- Create: `src/app/api/domain-verify/route.ts` (DNS verification)
- Modify: `src/messages/fr-FR.json` and `src/messages/en-US.json`
- Modify: All other locale files

**Step 1: Database migration**

Create `supabase/migrations/20260227_custom_domains.sql`:

```sql
-- Add custom domain support to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255) UNIQUE;

-- Index for fast domain lookups in middleware
CREATE INDEX IF NOT EXISTS idx_tenants_custom_domain
  ON tenants(custom_domain)
  WHERE custom_domain IS NOT NULL;
```

Apply: `pnpm db:migrate`

**Step 2: Add cached domain lookup to `src/lib/cache.ts`**

Add after the existing `getCachedTenant`:

```typescript
/**
 * Cached tenant lookup by custom domain.
 * Used by middleware when the hostname doesn't match *.attabl.com
 */
export const getCachedTenantByDomain = unstable_cache(
  async (domain: string) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tenants')
      .select('slug')
      .eq('custom_domain', domain)
      .single();

    if (error || !data) return null;
    return data.slug;
  },
  ['tenant-domain'],
  { revalidate: 300, tags: ['tenant-config'] },
);
```

**Step 3: Modify `src/proxy.ts` to handle custom domains**

The `extractSubdomain` function is sync, but we need an async domain lookup. Instead, modify the `proxy` function to check for custom domains:

Import at top:

```typescript
import { getCachedTenantByDomain } from '@/lib/cache';
```

After `const subdomain = extractSubdomain(hostname);` and before the auth skip optimization, add:

```typescript
// Check for custom domain (not attabl.com, not localhost)
const hostWithoutPort = hostname.split(':')[0];
const isMainDomain = hostWithoutPort === 'attabl.com' || hostWithoutPort === 'www.attabl.com';
const isLocalhost = hostWithoutPort === 'localhost' || hostWithoutPort.endsWith('.localhost');

if (!subdomain && !isMainDomain && !isLocalhost) {
  // Might be a custom domain (e.g., theblutable.com)
  const tenantSlug = await getCachedTenantByDomain(hostWithoutPort);
  if (tenantSlug) {
    // Treat like a subdomain rewrite
    const { response: sessionResponse } = await createMiddlewareClient(request);
    const url = request.nextUrl.clone();

    if (pathname.startsWith('/api/')) {
      sessionResponse.headers.set('x-tenant-slug', tenantSlug);
      return sessionResponse;
    }

    url.pathname = `/sites/${tenantSlug}${pathname}`;
    const response = NextResponse.rewrite(url, { headers: sessionResponse.headers });
    sessionResponse.cookies.getAll().forEach((cookie: { name: string; value: string }) => {
      response.cookies.set(cookie.name, cookie.value);
    });
    response.headers.set('x-tenant-slug', tenantSlug);
    return response;
  }
}
```

**Step 4: Add i18n keys**

In `settings` section of locale files:

**fr-FR.json:**

```json
"domain": "Domaine",
"customDomain": "Domaine personnalisé",
"customDomainDesc": "Utilisez votre propre nom de domaine (ex: menu.votrerestaurant.com)",
"customDomainPlaceholder": "menu.votrerestaurant.com",
"domainVerifying": "Vérification DNS en cours...",
"domainVerified": "Domaine vérifié et actif",
"domainPending": "En attente de configuration DNS",
"domainInstructions": "Ajoutez un enregistrement CNAME pointant vers cname.vercel-dns.com",
"domainSaved": "Domaine enregistré",
"domainRemoved": "Domaine supprimé"
```

**en-US.json:**

```json
"domain": "Domain",
"customDomain": "Custom Domain",
"customDomainDesc": "Use your own domain name (e.g., menu.yourrestaurant.com)",
"customDomainPlaceholder": "menu.yourrestaurant.com",
"domainVerifying": "Verifying DNS...",
"domainVerified": "Domain verified and active",
"domainPending": "Pending DNS configuration",
"domainInstructions": "Add a CNAME record pointing to cname.vercel-dns.com",
"domainSaved": "Domain saved",
"domainRemoved": "Domain removed"
```

**Step 5: Create SettingsDomain component**

Create `src/components/admin/settings/SettingsDomain.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Globe, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

interface SettingsDomainProps {
  currentDomain: string | null;
  tenantSlug: string;
  onSave: (domain: string | null) => Promise<void>;
}

export default function SettingsDomain({ currentDomain, tenantSlug, onSave }: SettingsDomainProps) {
  const t = useTranslations('settings');
  const { toast } = useToast();
  const [domain, setDomain] = useState(currentDomain || '');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(!!currentDomain);
  const [saving, setSaving] = useState(false);

  const handleVerify = async () => {
    if (!domain.trim()) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/domain-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      setVerified(data.verified);
      if (!data.verified) {
        toast({ title: t('domainPending'), variant: 'destructive' });
      }
    } catch {
      // Verification failed silently
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(domain.trim() || null);
      toast({ title: t('domainSaved') });
    } catch {
      toast({ title: t('error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await onSave(null);
      setDomain('');
      setVerified(false);
      toast({ title: t('domainRemoved') });
    } catch {
      toast({ title: t('error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-neutral-900 font-medium">{t('customDomain')}</Label>
        <p className="text-xs text-neutral-500 mt-0.5">{t('customDomainDesc')}</p>
      </div>

      <div className="flex gap-2">
        <Input
          value={domain}
          onChange={(e) => { setDomain(e.target.value); setVerified(false); }}
          placeholder={t('customDomainPlaceholder')}
          className="flex-1"
        />
        <Button variant="outline" onClick={handleVerify} disabled={verifying || !domain.trim()}>
          {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
        </Button>
      </div>

      {domain.trim() && (
        <div className="flex items-center gap-2 text-xs">
          {verified ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-emerald-600">{t('domainVerified')}</span>
            </>
          ) : (
            <>
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-amber-600">{t('domainPending')}</span>
            </>
          )}
        </div>
      )}

      <div className="bg-neutral-50 rounded-lg p-3 text-xs text-neutral-500">
        <p className="font-medium text-neutral-700 mb-1">DNS Configuration</p>
        <p>{t('domainInstructions')}</p>
        <code className="block mt-2 bg-white p-2 rounded text-xs font-mono">
          CNAME → cname.vercel-dns.com
        </code>
      </div>

      <div className="flex gap-2">
        <Button variant="lime" onClick={handleSave} disabled={saving || !domain.trim()}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {t('save')}
        </Button>
        {currentDomain && (
          <Button variant="ghost" onClick={handleRemove} disabled={saving} className="text-red-600">
            {t('remove')}
          </Button>
        )}
      </div>

      <p className="text-xs text-neutral-400">
        URL actuelle : <code className="bg-neutral-100 px-1 rounded">{tenantSlug}.attabl.com</code>
      </p>
    </div>
  );
}
```

**Step 6: Add domain tab to SettingsForm**

Add `{ key: 'domain', icon: Globe }` to TAB_CONFIG in SettingsForm.tsx. Render `<SettingsDomain />` when the domain tab is active. The tenant's `custom_domain` field needs to be fetched and passed down.

Update `getCachedTenant` in `cache.ts` to include `custom_domain` in the select:

```typescript
.select('id, name, slug, custom_domain, primary_color, ...')
```

**Step 7: Create domain verification API route**

Create `src/app/api/domain-verify/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  const { domain } = await request.json();

  if (!domain) {
    return NextResponse.json({ error: 'Domain required' }, { status: 400 });
  }

  try {
    // Check if CNAME is pointing to Vercel
    const response = await fetch(`https://dns.google/resolve?name=${domain}&type=CNAME`);
    const data = await response.json();

    const verified =
      data.Answer?.some(
        (record: { data: string }) =>
          record.data === 'cname.vercel-dns.com.' || record.data === 'cname.vercel-dns.com',
      ) || false;

    return NextResponse.json({ verified, domain });
  } catch (error) {
    logger.error('Domain verification error', error);
    return NextResponse.json({ verified: false, domain });
  }
}
```

**Step 8: Update tenant-settings action to handle custom_domain**

In `src/app/actions/tenant-settings.ts`, add `custom_domain` to the update payload and Zod schema.

**Step 9: Verify**

```bash
pnpm db:migrate
pnpm typecheck && pnpm lint && pnpm build
```

**Step 10: Commit**

```bash
git add supabase/migrations/20260227_custom_domains.sql src/proxy.ts src/lib/cache.ts src/components/admin/settings/SettingsDomain.tsx src/components/admin/settings/SettingsForm.tsx src/app/api/domain-verify/route.ts src/app/actions/tenant-settings.ts src/messages/
git commit -m "feat: add custom domain support with DNS verification and middleware lookup"
```

---

## Task 5: Venue URL Parameter (`?v=venue`)

**Context:** Add support for `?v=panorama` URL parameter. When a QR code with `?v=panorama&table=PE01` is scanned, the page should filter menus to show only the Panorama venue menus + shared menus (venue_id = null).

**Files:**

- Modify: `src/app/sites/[site]/page.tsx` (parse `?v=` param)
- Modify: `src/components/tenant/ClientMenuPage.tsx` (accept + use venue filter)

**Step 1: Parse venue param in page.tsx**

Update the `searchParams` type (line 65):

```typescript
searchParams: Promise<{ table?: string; menu?: string; t?: string; v?: string }>;
```

Add after `initialMenuSlug` (line 70):

```typescript
const initialVenueSlug = resolvedSearchParams.v || undefined;
```

Pass to ClientMenuPage:

```typescript
<ClientMenuPage
  tenant={tenant}
  venues={venues || []}
  menus={menus}
  initialMenuSlug={initialMenuSlug}
  initialTable={initialTable}
  initialVenueSlug={initialVenueSlug}
  categories={categories || []}
  itemsByCategory={itemsByCategory}
  ads={ads || []}
  zones={zones}
  tables={tables}
/>
```

**Step 2: Accept and use venue filter in ClientMenuPage**

Add to `ClientMenuPageProps`:

```typescript
initialVenueSlug?: string;
```

Add state for active venue:

```typescript
const [activeVenueId, setActiveVenueId] = useState<string | null>(() => {
  if (initialVenueSlug) {
    const venue = venues.find((v) => v.slug === initialVenueSlug);
    return venue?.id || null;
  }
  return null;
});
```

**Step 3: Verify**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

**Step 4: Commit**

```bash
git add src/app/sites/[site]/page.tsx src/components/tenant/ClientMenuPage.tsx
git commit -m "feat: add ?v=venue URL parameter support for venue-scoped menu filtering"
```

---

## Task 6: Venue Filtering on Client

**Context:** Wire the existing venue buttons in ClientMenuPage.tsx to actually filter menus. When a venue is selected, show only menus for that venue + shared menus (venue_id = null). The "All" option shows everything.

**Files:**

- Modify: `src/components/tenant/ClientMenuPage.tsx`

**Step 1: Update venue buttons to be interactive**

Replace the venue buttons section (lines 262-277) with:

```typescript
{/* Venues Selector */}
{venues && venues.length > 1 && (
  <div className="mb-6">
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
      {/* "All" button */}
      <button
        onClick={() => setActiveVenueId(null)}
        className={cn(
          'flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap',
          !activeVenueId
            ? 'bg-gray-900 text-white shadow-md'
            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50',
        )}
      >
        {t('allSpaces')}
      </button>
      {venues.map((venue: Venue) => (
        <button
          key={venue.id}
          onClick={() => setActiveVenueId(venue.id)}
          className={cn(
            'flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap',
            activeVenueId === venue.id
              ? 'bg-gray-900 text-white shadow-md'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50',
          )}
        >
          {venue.name}
        </button>
      ))}
    </div>
  </div>
)}
```

**Step 2: Filter menus based on selected venue**

After `activeVenueId` state, add a derived `filteredMenus`:

```typescript
// Filter menus by venue: selected venue's menus + shared menus (venue_id = null)
const filteredMenus = activeVenueId
  ? menus.filter((m) => m.venue_id === activeVenueId || !m.venue_id)
  : menus;
```

Use `filteredMenus` instead of `menus` in the menu tabs section:

```typescript
{/* Menu Tabs (only if multiple filtered menus) */}
{filteredMenus.length > 1 && (
  <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-hide -mx-4 px-4" data-tab-pane>
    {filteredMenus.map((menu) => (
      <button key={menu.slug} onClick={() => handleMenuChange(menu.slug)} /* ... */>
        {menu.name}
      </button>
    ))}
  </div>
)}
```

Also update the `activeMenu` derivation:

```typescript
const activeMenu = filteredMenus.find((m) => m.slug === activeMenuSlug) || null;
```

When `activeVenueId` changes, reset the menu selection to the first filtered menu:

```typescript
useEffect(() => {
  if (filteredMenus.length > 0 && !filteredMenus.find((m) => m.slug === activeMenuSlug)) {
    setActiveMenuSlug(filteredMenus[0].slug);
    setActiveSubMenuId(null);
  }
}, [activeVenueId]);
```

**Step 3: Add i18n key**

Add to `tenant` section in fr-FR.json:

```json
"allSpaces": "Tout"
```

Add to `tenant` section in en-US.json:

```json
"allSpaces": "All"
```

**Step 4: Verify**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

**Step 5: Commit**

```bash
git add src/components/tenant/ClientMenuPage.tsx src/messages/
git commit -m "feat: wire venue filtering on client — filter menus by venue + shared menus"
```

---

## Implementation Order

Tasks should be executed in this order:

1. **Task 1** (Drag & drop) — independent, UI only
2. **Task 2** (Shared toggle) — independent, UI only
3. **Task 5** (Venue URL param) — depends on nothing
4. **Task 6** (Venue filtering) — depends on Task 5
5. **Task 3** (PDF import) — independent, largest task
6. **Task 4** (Custom domains) — independent, infrastructure

Tasks 1, 2, and 3 can be done in parallel with Tasks 5+6 and Task 4.

---

## Verification Checklist

After all tasks are done:

```bash
# Full CI pipeline
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

All 5 gates must pass with zero errors.
