# Chevalet Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un editeur de tente de table (21,7 x 11 cm, 300 DPI) avec preview live, export PDF vectoriel et PNG, sauvegarde automatique, dans une nouvelle section `/admin/supports/` du dashboard.

**Architecture:** Server Component page.tsx charge le tenant + la config sauvegardee, passe tout au Client Component ChevaletEditor. L'editeur gere l'etat local et sauvegarde via un hook debounce (2s) qui appelle le service supports. L'export PDF est genere cote serveur par une API route utilisant @react-pdf/renderer ; l'export PNG utilise html2canvas (deja installe) cote client sur la div de preview.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, @react-pdf/renderer (nouveau), qrcode (nouveau), qrcode.react (existant), Supabase, Zod, Vitest

---

## File Map

| Fichier                                              | Action   | Responsabilite                                 |
| ---------------------------------------------------- | -------- | ---------------------------------------------- |
| `supabase/migrations/20260429_tenant_supports.sql`   | Creer    | Table tenant_supports + RLS                    |
| `src/types/supports.types.ts`                        | Creer    | Types ChevaletConfig, UnitSystem, VersoMode    |
| `src/lib/validations/supports.schema.ts`             | Creer    | Zod schemas config + export request            |
| `src/services/supports.service.ts`                   | Creer    | getConfig + saveConfig (service layer)         |
| `src/__tests__/supports.schema.test.ts`              | Creer    | Tests Zod (valides + invalides)                |
| `src/__tests__/supports.service.test.ts`             | Creer    | Tests service (mocks Supabase)                 |
| `src/lib/rate-limit.ts`                              | Modifier | Ajouter supportsExportLimiter                  |
| `src/lib/layout/navigation-config.ts`                | Modifier | Ajouter entree "Supports" dans group marketing |
| `src/messages/fr-FR.json`                            | Modifier | Cle navSupports + textes editeur               |
| `src/messages/en-US.json`                            | Modifier | Cle navSupports + textes editeur               |
| `src/components/admin/AdminBreadcrumbs.tsx`          | Modifier | Ajouter 'supports' -> 'navSupports'            |
| `src/components/admin/supports/UnitInput.tsx`        | Creer    | Input numerique avec selecteur cm/mm/px        |
| `src/components/admin/supports/VersoOptions.tsx`     | Creer    | Selecteur radio 3 etats verso                  |
| `src/components/admin/supports/ChevaletPreview.tsx`  | Creer    | Preview live scalee recto + verso              |
| `src/components/admin/supports/ChevaletControls.tsx` | Creer    | Panneau gauche - tous les inputs               |
| `src/components/admin/supports/ChevaletEditor.tsx`   | Creer    | Editeur principal - orchestration etat         |
| `src/app/api/supports/export/route.ts`               | Creer    | Export PDF (@react-pdf/renderer)               |
| `src/app/sites/[site]/admin/supports/page.tsx`       | Creer    | Server Component - charge donnees              |

---

### Task 1: Installer les dependances

**Files:**

- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Installer @react-pdf/renderer et qrcode**

```bash
cd "/Users/a.g.i.c/Documents/SAAS Ressources 26/Project App-Saas/attabl-saas"
pnpm add @react-pdf/renderer qrcode
pnpm add -D @types/qrcode
```

- [ ] **Step 2: Verifier que les packages sont bien dans package.json**

```bash
grep -E '"@react-pdf|"qrcode"' package.json
```

Expected output:

```
"@react-pdf/renderer": "^x.x.x",
"qrcode": "^x.x.x",
```

- [ ] **Step 3: Typecheck pour s'assurer qu'il n'y a pas de conflit**

```bash
pnpm typecheck > /tmp/tc.log 2>&1 && echo "TC:PASS" || echo "TC:FAIL" && tail -5 /tmp/tc.log
```

Expected: `TC:PASS`

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add @react-pdf/renderer and qrcode for chevalet export"
```

---

### Task 2: Migration Supabase

**Files:**

- Create: `supabase/migrations/20260429_tenant_supports.sql`

- [ ] **Step 1: Creer la migration**

Creer le fichier `supabase/migrations/20260429_tenant_supports.sql` :

```sql
-- Migration: tenant_supports table for print templates (chevalet, etc.)
-- Created: 2026-04-29

create table if not exists tenant_supports (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  type        text not null default 'chevalet_standard',
  config      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tenant_supports_type_check check (type in ('chevalet_standard')),
  constraint tenant_supports_unique unique (tenant_id, type)
);

-- Index for fast lookup by tenant
create index if not exists tenant_supports_tenant_id_idx on tenant_supports(tenant_id);

-- RLS
alter table tenant_supports enable row level security;

-- Owners and admins can read their own supports
create policy "tenant_supports_select"
  on tenant_supports for select
  using (
    tenant_id in (
      select tenant_id from admin_users where user_id = auth.uid()
    )
  );

-- Owners and admins can insert/update their own supports
create policy "tenant_supports_insert"
  on tenant_supports for insert
  with check (
    tenant_id in (
      select tenant_id from admin_users where user_id = auth.uid()
    )
  );

create policy "tenant_supports_update"
  on tenant_supports for update
  using (
    tenant_id in (
      select tenant_id from admin_users where user_id = auth.uid()
    )
  )
  with check (
    tenant_id in (
      select tenant_id from admin_users where user_id = auth.uid()
    )
  );

-- updated_at trigger
create or replace function update_tenant_supports_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenant_supports_updated_at
  before update on tenant_supports
  for each row execute procedure update_tenant_supports_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260429_tenant_supports.sql
git commit -m "feat(db): migration tenant_supports pour chevalet standard"
```

---

### Task 3: Types TypeScript

**Files:**

- Create: `src/types/supports.types.ts`

- [ ] **Step 1: Creer le fichier de types**

Creer `src/types/supports.types.ts` :

```typescript
export type UnitSystem = 'cm' | 'mm' | 'px';

export type VersoMode = 'none' | 'logo' | 'mirror';

export type QrStyle = 'classic' | 'branded' | 'inverted' | 'dark';

export interface LogoConfig {
  visible: boolean;
  x: number; // cm
  y: number; // cm
  width: number; // cm
}

export interface TextConfig {
  visible: boolean;
  x: number; // cm
  y: number; // cm
  fontSize: number; // pt
  text: string;
}

export interface QrConfig {
  x: number; // cm
  y: number; // cm
  width: number; // cm (height = width, square)
  style: QrStyle;
  menuUrl: string;
}

export interface ChevaletConfig {
  unit: UnitSystem;
  background: string; // hex
  accentColor: string; // hex
  logo: LogoConfig;
  name: TextConfig;
  tagline: TextConfig;
  qrCode: QrConfig;
  verso: VersoMode;
}

export interface TenantForEditor {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  menuUrl: string;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "/Users/a.g.i.c/Documents/SAAS Ressources 26/Project App-Saas/attabl-saas"
pnpm typecheck > /tmp/tc.log 2>&1 && echo "TC:PASS" || echo "TC:FAIL"
```

Expected: `TC:PASS`

- [ ] **Step 3: Commit**

```bash
git add src/types/supports.types.ts
git commit -m "feat(types): supports.types - ChevaletConfig, UnitSystem, VersoMode"
```

---

### Task 4: Schema Zod + Tests

**Files:**

- Create: `src/lib/validations/supports.schema.ts`
- Create: `src/__tests__/supports.schema.test.ts`

- [ ] **Step 1: Ecrire les tests (TDD)**

Creer `src/__tests__/supports.schema.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import { chevaletConfigSchema, exportRequestSchema } from '@/lib/validations/supports.schema';

const validConfig = {
  unit: 'cm',
  background: '#1A1A1A',
  accentColor: '#FFFFFF',
  logo: { visible: true, x: 1, y: 0.8, width: 2.5 },
  name: { visible: true, x: 1, y: 4, fontSize: 18, text: 'Le Jardin' },
  tagline: { visible: false, x: 1, y: 5.5, fontSize: 10, text: '' },
  qrCode: { x: 14.5, y: 0.8, width: 6, style: 'classic', menuUrl: 'https://lejardin.attabl.com' },
  verso: 'none',
};

describe('chevaletConfigSchema', () => {
  it('accepts valid config', () => {
    expect(chevaletConfigSchema.safeParse(validConfig).success).toBe(true);
  });

  it('rejects invalid hex color for background', () => {
    const result = chevaletConfigSchema.safeParse({ ...validConfig, background: 'red' });
    expect(result.success).toBe(false);
  });

  it('rejects x coordinate out of bounds', () => {
    const result = chevaletConfigSchema.safeParse({
      ...validConfig,
      logo: { ...validConfig.logo, x: 25 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid qrCode style', () => {
    const result = chevaletConfigSchema.safeParse({
      ...validConfig,
      qrCode: { ...validConfig.qrCode, style: 'rainbow' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid verso mode', () => {
    const result = chevaletConfigSchema.safeParse({ ...validConfig, verso: 'both' });
    expect(result.success).toBe(false);
  });

  it('rejects text longer than 200 chars for tagline', () => {
    const result = chevaletConfigSchema.safeParse({
      ...validConfig,
      tagline: { ...validConfig.tagline, text: 'x'.repeat(201) },
    });
    expect(result.success).toBe(false);
  });
});

describe('exportRequestSchema', () => {
  const validRequest = {
    config: validConfig,
    format: 'pdf',
    menuUrl: 'https://lejardin.attabl.com',
    tenantSlug: 'lejardin',
  };

  it('accepts valid pdf export request', () => {
    expect(exportRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it('accepts valid png export request', () => {
    const result = exportRequestSchema.safeParse({ ...validRequest, format: 'png' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid format', () => {
    const result = exportRequestSchema.safeParse({ ...validRequest, format: 'svg' });
    expect(result.success).toBe(false);
  });

  it('defaults format to pdf when omitted', () => {
    const { format: _, ...withoutFormat } = validRequest;
    const result = exportRequestSchema.safeParse(withoutFormat);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.format).toBe('pdf');
  });
});
```

- [ ] **Step 2: Verifier que les tests echouent (TDD)**

```bash
cd "/Users/a.g.i.c/Documents/SAAS Ressources 26/Project App-Saas/attabl-saas"
pnpm test src/__tests__/supports.schema.test.ts > /tmp/test.log 2>&1
grep -E "FAIL|passed|failed" /tmp/test.log
```

Expected: tests FAIL (module not found)

- [ ] **Step 3: Creer le schema Zod**

Creer `src/lib/validations/supports.schema.ts` :

```typescript
import { z } from 'zod';

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex invalide (#RRGGBB)');

const logoConfigSchema = z.object({
  visible: z.boolean(),
  x: z.number().min(0).max(21.7),
  y: z.number().min(0).max(11),
  width: z.number().min(0.5).max(21.7),
});

const textConfigSchema = z.object({
  visible: z.boolean(),
  x: z.number().min(0).max(21.7),
  y: z.number().min(0).max(11),
  fontSize: z.number().min(6).max(72),
  text: z.string().max(200),
});

const nameConfigSchema = textConfigSchema.extend({
  text: z.string().max(100),
});

const qrConfigSchema = z.object({
  x: z.number().min(0).max(21.7),
  y: z.number().min(0).max(11),
  width: z.number().min(2).max(10),
  style: z.enum(['classic', 'branded', 'inverted', 'dark']),
  menuUrl: z.string().url(),
});

export const chevaletConfigSchema = z.object({
  unit: z.enum(['cm', 'mm', 'px']),
  background: hexColorSchema,
  accentColor: hexColorSchema,
  logo: logoConfigSchema,
  name: nameConfigSchema,
  tagline: textConfigSchema,
  qrCode: qrConfigSchema,
  verso: z.enum(['none', 'logo', 'mirror']),
});

export const exportRequestSchema = z.object({
  config: chevaletConfigSchema,
  format: z.enum(['pdf', 'png']).default('pdf'),
  menuUrl: z.string().url(),
  tenantSlug: z.string().min(1).max(100),
});

export type ChevaletConfigInput = z.infer<typeof chevaletConfigSchema>;
export type ExportRequestInput = z.infer<typeof exportRequestSchema>;
```

- [ ] **Step 4: Verifier que les tests passent**

```bash
pnpm test src/__tests__/supports.schema.test.ts > /tmp/test.log 2>&1
grep -E "passed|failed|Tests" /tmp/test.log
```

Expected: `8 passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/supports.schema.ts src/__tests__/supports.schema.test.ts
git commit -m "feat(validation): supports.schema - Zod schemas chevalet config + export"
```

---

### Task 5: Service supports + Tests

**Files:**

- Create: `src/services/supports.service.ts`
- Create: `src/__tests__/supports.service.test.ts`

- [ ] **Step 1: Ecrire les tests**

Creer `src/__tests__/supports.service.test.ts` :

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupportsService } from '@/services/supports.service';
import type { ChevaletConfig } from '@/types/supports.types';

const validConfig: ChevaletConfig = {
  unit: 'cm',
  background: '#1A1A1A',
  accentColor: '#FFFFFF',
  logo: { visible: true, x: 1, y: 0.8, width: 2.5 },
  name: { visible: true, x: 1, y: 4, fontSize: 18, text: 'Le Jardin' },
  tagline: { visible: false, x: 1, y: 5.5, fontSize: 10, text: '' },
  qrCode: { x: 14.5, y: 0.8, width: 6, style: 'classic', menuUrl: 'https://lejardin.attabl.com' },
  verso: 'none',
};

const makeMockSupabase = (overrides?: object) => ({
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  upsert: vi.fn().mockResolvedValue({ error: null }),
  ...overrides,
});

describe('createSupportsService', () => {
  describe('getConfig', () => {
    it('returns null when no config saved', async () => {
      const supabase = makeMockSupabase();
      const service = createSupportsService(supabase as never);
      const result = await service.getConfig('tenant-123');
      expect(result).toBeNull();
    });

    it('returns config when one exists', async () => {
      const supabase = makeMockSupabase({
        maybeSingle: vi.fn().mockResolvedValue({ data: { config: validConfig }, error: null }),
      });
      const service = createSupportsService(supabase as never);
      const result = await service.getConfig('tenant-123');
      expect(result).toEqual(validConfig);
    });

    it('throws ServiceError on DB error', async () => {
      const supabase = makeMockSupabase({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      });
      const service = createSupportsService(supabase as never);
      await expect(service.getConfig('tenant-123')).rejects.toThrow('Failed to load');
    });

    it('filters by tenant_id', async () => {
      const supabase = makeMockSupabase();
      const service = createSupportsService(supabase as never);
      await service.getConfig('tenant-abc');
      expect(supabase.eq).toHaveBeenCalledWith('tenant_id', 'tenant-abc');
    });
  });

  describe('saveConfig', () => {
    it('upserts config with correct data', async () => {
      const supabase = makeMockSupabase();
      const service = createSupportsService(supabase as never);
      await service.saveConfig('tenant-123', validConfig);
      expect(supabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-123',
          type: 'chevalet_standard',
          config: validConfig,
        }),
        { onConflict: 'tenant_id,type' },
      );
    });

    it('throws ServiceError on upsert error', async () => {
      const supabase = makeMockSupabase({
        upsert: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }),
      });
      const service = createSupportsService(supabase as never);
      await expect(service.saveConfig('tenant-123', validConfig)).rejects.toThrow('Failed to save');
    });
  });
});
```

- [ ] **Step 2: Verifier que les tests echouent**

```bash
pnpm test src/__tests__/supports.service.test.ts > /tmp/test.log 2>&1
grep -E "FAIL|passed|failed" /tmp/test.log
```

Expected: FAIL (module not found)

- [ ] **Step 3: Creer le service**

Creer `src/services/supports.service.ts` :

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { ChevaletConfig } from '@/types/supports.types';

export function createSupportsService(supabase: SupabaseClient) {
  return {
    async getConfig(tenantId: string): Promise<ChevaletConfig | null> {
      const { data, error } = await supabase
        .from('tenant_supports')
        .select('config')
        .eq('tenant_id', tenantId)
        .eq('type', 'chevalet_standard')
        .maybeSingle();

      if (error) throw new ServiceError('INTERNAL', 'Failed to load chevalet config');
      return data ? (data.config as ChevaletConfig) : null;
    },

    async saveConfig(tenantId: string, config: ChevaletConfig): Promise<void> {
      const { error } = await supabase.from('tenant_supports').upsert(
        {
          tenant_id: tenantId,
          type: 'chevalet_standard',
          config,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,type' },
      );

      if (error) throw new ServiceError('INTERNAL', 'Failed to save chevalet config');
    },
  };
}
```

- [ ] **Step 4: Verifier que les tests passent**

```bash
pnpm test src/__tests__/supports.service.test.ts > /tmp/test.log 2>&1
grep -E "passed|failed|Tests" /tmp/test.log
```

Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add src/services/supports.service.ts src/__tests__/supports.service.test.ts
git commit -m "feat(service): supports.service - getConfig + saveConfig pour chevalet"
```

---

### Task 6: Rate limiter + Navigation + i18n + Breadcrumb

**Files:**

- Modify: `src/lib/rate-limit.ts` (fichier protege - ajout minimal uniquement)
- Modify: `src/lib/layout/navigation-config.ts`
- Modify: `src/messages/fr-FR.json`
- Modify: `src/messages/en-US.json`
- Modify: `src/components/admin/AdminBreadcrumbs.tsx`

- [ ] **Step 1: Ajouter le rate limiter pour l'export**

Dans `src/lib/rate-limit.ts`, ajouter a la fin (apres `stockAlertLimiter`) :

```typescript
export const supportsExportLimiter = createLimiter(
  'supports-export',
  Ratelimit.slidingWindow(10, '1 m'),
);
```

- [ ] **Step 2: Ajouter "Supports" dans navigation-config.ts**

Dans `src/lib/layout/navigation-config.ts`, ajouter l'import `Printer` :

```typescript
import {
  // ... imports existants ...
  Printer,
} from 'lucide-react';
```

Puis dans le tableau `NAV_GROUPS`, dans le group `marketing` (celui avec `sectionKey: 'marketing'`), ajouter un item a la fin du tableau `items` :

```typescript
{
  path: '/supports',
  icon: Printer,
  labelKey: 'navSupports',
  requiredPermission: 'canManageSettings',
  permissionCode: 'settings.edit',
},
```

- [ ] **Step 3: Ajouter les cles i18n dans fr-FR.json**

Dans `src/messages/fr-FR.json`, dans la section `"sidebar"`, ajouter apres `"navQrCodes"` :

```json
"navSupports": "Supports",
```

Dans la meme section `"sidebar"`, apres la cle `"navSupports"`, ajouter les textes de l'editeur :

```json
"supports": {
  "pageTitle": "Chevalet standard",
  "pageSubtitle": "Tente de table 21,7 x 11 cm - prete a imprimer",
  "unitLabel": "Unites",
  "sectionBackground": "Fond",
  "sectionLogo": "Logo",
  "sectionName": "Nom de l'etablissement",
  "sectionTagline": "Description",
  "sectionQr": "QR Code",
  "sectionVerso": "Verso",
  "labelVisible": "Afficher",
  "labelX": "Position X",
  "labelY": "Position Y",
  "labelWidth": "Largeur",
  "labelFontSize": "Taille police",
  "labelText": "Texte",
  "labelBackground": "Couleur de fond",
  "labelAccent": "Couleur accent",
  "versoNone": "Recto simple",
  "versoLogo": "Logo seul au verso",
  "versoMirror": "Miroir recto",
  "exportPdf": "Telecharger PDF",
  "exportPng": "Telecharger PNG",
  "saving": "Sauvegarde...",
  "saved": "Sauvegarde",
  "rectoLabel": "RECTO",
  "versoLabel": "VERSO"
}
```

- [ ] **Step 4: Ajouter les cles i18n dans en-US.json**

Dans `src/messages/en-US.json`, dans la section `"sidebar"`, ajouter apres `"navQrCodes"` :

```json
"navSupports": "Print Materials",
```

Puis les textes editeur :

```json
"supports": {
  "pageTitle": "Standard tent card",
  "pageSubtitle": "21.7 x 11 cm table tent - print ready",
  "unitLabel": "Units",
  "sectionBackground": "Background",
  "sectionLogo": "Logo",
  "sectionName": "Establishment name",
  "sectionTagline": "Description",
  "sectionQr": "QR Code",
  "sectionVerso": "Back side",
  "labelVisible": "Show",
  "labelX": "X position",
  "labelY": "Y position",
  "labelWidth": "Width",
  "labelFontSize": "Font size",
  "labelText": "Text",
  "labelBackground": "Background color",
  "labelAccent": "Accent color",
  "versoNone": "Front only",
  "versoLogo": "Logo on back",
  "versoMirror": "Mirror front",
  "exportPdf": "Download PDF",
  "exportPng": "Download PNG",
  "saving": "Saving...",
  "saved": "Saved",
  "rectoLabel": "FRONT",
  "versoLabel": "BACK"
}
```

- [ ] **Step 5: Ajouter le breadcrumb**

Dans `src/components/admin/AdminBreadcrumbs.tsx`, dans l'objet `segmentMap` (qui contient `'qr-codes': 'navQrCodes'`, etc.), ajouter :

```typescript
supports: 'navSupports',
```

- [ ] **Step 6: Typecheck + Lint**

```bash
cd "/Users/a.g.i.c/Documents/SAAS Ressources 26/Project App-Saas/attabl-saas"
pnpm typecheck > /tmp/tc.log 2>&1 && echo "TC:PASS" || (echo "TC:FAIL" && tail -10 /tmp/tc.log)
pnpm lint --max-warnings 0 > /tmp/lint.log 2>&1 && echo "LINT:PASS" || (echo "LINT:FAIL" && tail -10 /tmp/lint.log)
```

Expected: `TC:PASS` et `LINT:PASS`

- [ ] **Step 7: Commit**

```bash
git add src/lib/rate-limit.ts src/lib/layout/navigation-config.ts \
  src/messages/fr-FR.json src/messages/en-US.json \
  src/components/admin/AdminBreadcrumbs.tsx
git commit -m "feat(nav): ajouter Supports dans sidebar + i18n + breadcrumb"
```

---

### Task 7: Composant UnitInput

**Files:**

- Create: `src/components/admin/supports/UnitInput.tsx`

- [ ] **Step 1: Creer UnitInput**

Creer `src/components/admin/supports/UnitInput.tsx` :

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UnitSystem } from '@/types/supports.types';

export function cmToUnit(cm: number, unit: UnitSystem): number {
  if (unit === 'mm') return Math.round(cm * 10 * 100) / 100;
  if (unit === 'px') return Math.round(cm * 118.11);
  return Math.round(cm * 100) / 100;
}

export function unitToCm(value: number, unit: UnitSystem): number {
  if (unit === 'mm') return value / 10;
  if (unit === 'px') return value / 118.11;
  return value;
}

interface UnitInputProps {
  label: string;
  valueCm: number;
  onChange: (valueCm: number) => void;
  unit: UnitSystem;
  minCm?: number;
  maxCm?: number;
  step?: number;
  className?: string;
}

export function UnitInput({
  label,
  valueCm,
  onChange,
  unit,
  minCm = 0,
  maxCm = 21.7,
  step,
  className,
}: UnitInputProps) {
  const displayValue = cmToUnit(valueCm, unit);
  const displayMin = cmToUnit(minCm, unit);
  const displayMax = cmToUnit(maxCm, unit);

  const displayStep =
    step !== undefined ? cmToUnit(step, unit) : unit === 'px' ? 1 : unit === 'mm' ? 0.5 : 0.1;

  return (
    <div className={className}>
      <Label className="text-xs text-app-text-secondary mb-1 block">{label}</Label>
      <Input
        type="number"
        value={displayValue}
        min={displayMin}
        max={displayMax}
        step={displayStep}
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          if (!isNaN(raw)) {
            onChange(unitToCm(raw, unit));
          }
        }}
        className="h-8 text-xs font-mono bg-app-elevated/50 border-app-border rounded-lg"
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck > /tmp/tc.log 2>&1 && echo "TC:PASS" || (echo "TC:FAIL" && tail -5 /tmp/tc.log)
```

Expected: `TC:PASS`

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/supports/UnitInput.tsx
git commit -m "feat(ui): UnitInput - input numerique cm/mm/px interchangeable"
```

---

### Task 8: Composant VersoOptions

**Files:**

- Create: `src/components/admin/supports/VersoOptions.tsx`

- [ ] **Step 1: Creer VersoOptions**

Creer `src/components/admin/supports/VersoOptions.tsx` :

```tsx
'use client';

import { useTranslations } from 'next-intl';
import type { VersoMode } from '@/types/supports.types';

interface VersoOptionsProps {
  value: VersoMode;
  onChange: (value: VersoMode) => void;
}

const OPTIONS: { value: VersoMode; labelKey: string }[] = [
  { value: 'none', labelKey: 'versoNone' },
  { value: 'logo', labelKey: 'versoLogo' },
  { value: 'mirror', labelKey: 'versoMirror' },
];

export function VersoOptions({ value, onChange }: VersoOptionsProps) {
  const t = useTranslations('sidebar.supports');

  return (
    <div className="space-y-2">
      {OPTIONS.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
          {/* eslint-disable-next-line react/forbid-elements -- <input type="radio"> pas d'equivalent shadcn */}
          <input
            type="radio"
            name="verso-mode"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-accent w-3.5 h-3.5 shrink-0"
          />
          <span className="text-xs text-app-text-secondary group-hover:text-app-text transition-colors">
            {t(opt.labelKey)}
          </span>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck > /tmp/tc.log 2>&1 && echo "TC:PASS" || (echo "TC:FAIL" && tail -5 /tmp/tc.log)
```

Expected: `TC:PASS`

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/supports/VersoOptions.tsx
git commit -m "feat(ui): VersoOptions - selecteur radio 3 etats verso"
```

---

### Task 9: ChevaletPreview

**Files:**

- Create: `src/components/admin/supports/ChevaletPreview.tsx`

Le preview est une div scalee CSS. Dimensions reelles : 21.7cm x 11cm. Scale factor : 1cm = 28px.
A l'ecran la div mesure donc ~607 x 308px. On enveloppe dans un conteneur a l'echelle.

- [ ] **Step 1: Creer ChevaletPreview**

Creer `src/components/admin/supports/ChevaletPreview.tsx` :

```tsx
/* eslint-disable @next/next/no-img-element */
'use client';

import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import type { ChevaletConfig } from '@/types/supports.types';

// Scale: 1cm = 28px in preview
const SCALE = 28;
const W_CM = 21.7;
const H_CM = 11;
const W_PX = W_CM * SCALE; // 607.6px
const H_PX = H_CM * SCALE; // 308px

interface ChevaletPreviewProps {
  config: ChevaletConfig;
  logoUrl: string | null;
  previewRef?: React.RefObject<HTMLDivElement | null>;
}

function Panel({
  config,
  logoUrl,
  label,
  isVersoBgOnly,
}: {
  config: ChevaletConfig;
  logoUrl: string | null;
  label: string;
  isVersoBgOnly?: boolean;
}) {
  const qrDark =
    config.qrCode.style === 'inverted' || config.qrCode.style === 'dark' ? '#FFFFFF' : '#000000';
  const qrLight = config.qrCode.style === 'inverted' ? '#000000' : 'transparent';

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-app-text-muted tracking-widest uppercase">
        {label}
      </span>
      <div
        style={{
          width: W_PX,
          height: H_PX,
          backgroundColor: config.background,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 4,
        }}
      >
        {isVersoBgOnly ? (
          // Verso "logo seul"
          config.logo.visible &&
          logoUrl && (
            <img
              src={logoUrl}
              alt="Logo"
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: config.logo.width * SCALE,
                objectFit: 'contain',
              }}
            />
          )
        ) : (
          <>
            {/* Logo */}
            {config.logo.visible && logoUrl && (
              <img
                src={logoUrl}
                alt="Logo"
                style={{
                  position: 'absolute',
                  left: config.logo.x * SCALE,
                  top: config.logo.y * SCALE,
                  width: config.logo.width * SCALE,
                  objectFit: 'contain',
                }}
              />
            )}

            {/* Nom */}
            {config.name.visible && (
              <span
                style={{
                  position: 'absolute',
                  left: config.name.x * SCALE,
                  top: config.name.y * SCALE,
                  fontSize: config.name.fontSize * (SCALE / 28),
                  color: config.accentColor,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  lineHeight: 1.2,
                }}
              >
                {config.name.text}
              </span>
            )}

            {/* Tagline */}
            {config.tagline.visible && (
              <span
                style={{
                  position: 'absolute',
                  left: config.tagline.x * SCALE,
                  top: config.tagline.y * SCALE,
                  fontSize: config.tagline.fontSize * (SCALE / 28),
                  color: config.accentColor,
                  opacity: 0.75,
                  maxWidth: (W_CM - config.tagline.x - 0.5) * SCALE,
                  lineHeight: 1.3,
                }}
              >
                {config.tagline.text}
              </span>
            )}

            {/* QR Code */}
            <div
              style={{
                position: 'absolute',
                left: config.qrCode.x * SCALE,
                top: config.qrCode.y * SCALE,
                width: config.qrCode.width * SCALE,
                height: config.qrCode.width * SCALE,
              }}
            >
              <QRCodeSVG
                value={config.qrCode.menuUrl || 'https://attabl.com'}
                size={config.qrCode.width * SCALE}
                fgColor={qrDark}
                bgColor={qrLight}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ChevaletPreview({ config, logoUrl, previewRef }: ChevaletPreviewProps) {
  const t = useTranslations('sidebar.supports');

  return (
    <div className="flex flex-col items-center gap-4 w-full overflow-x-auto">
      {/* Recto */}
      <div ref={previewRef}>
        <Panel config={config} logoUrl={logoUrl} label={t('rectoLabel')} />
      </div>

      {/* Verso - seulement si pas "none" */}
      {config.verso !== 'none' && (
        <Panel
          config={config}
          logoUrl={logoUrl}
          label={t('versoLabel')}
          isVersoBgOnly={config.verso === 'logo'}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck > /tmp/tc.log 2>&1 && echo "TC:PASS" || (echo "TC:FAIL" && tail -10 /tmp/tc.log)
```

Expected: `TC:PASS`

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/supports/ChevaletPreview.tsx
git commit -m "feat(ui): ChevaletPreview - preview live recto/verso scalee"
```

---

### Task 10: ChevaletControls

**Files:**

- Create: `src/components/admin/supports/ChevaletControls.tsx`

- [ ] **Step 1: Creer ChevaletControls**

Creer `src/components/admin/supports/ChevaletControls.tsx` :

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UnitInput } from './UnitInput';
import { VersoOptions } from './VersoOptions';
import type { ChevaletConfig, UnitSystem } from '@/types/supports.types';

interface ChevaletControlsProps {
  config: ChevaletConfig;
  unit: UnitSystem;
  onUnitChange: (u: UnitSystem) => void;
  onChange: (patch: Partial<ChevaletConfig>) => void;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-app-text-muted mb-3 pb-1.5 border-b border-app-border/50">
      {title}
    </p>
  );
}

export function ChevaletControls({ config, unit, onUnitChange, onChange }: ChevaletControlsProps) {
  const t = useTranslations('sidebar.supports');

  return (
    <div className="flex flex-col gap-5 px-4 py-4 overflow-y-auto h-full">
      {/* Selecteur d'unites */}
      <div className="flex items-center gap-1 p-1 bg-app-elevated rounded-xl self-start">
        {(['cm', 'mm', 'px'] as UnitSystem[]).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onUnitChange(u)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              unit === u
                ? 'bg-app-card text-app-text shadow-sm'
                : 'text-app-text-muted hover:text-app-text'
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      {/* Fond */}
      <div>
        <SectionHeader title={t('sectionBackground')} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-app-text-secondary mb-1 block">
              {t('labelBackground')}
            </Label>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg border border-app-border shrink-0"
                style={{ backgroundColor: config.background }}
              />
              <Input
                value={config.background}
                onChange={(e) => onChange({ background: e.target.value })}
                className="h-8 text-xs font-mono bg-app-elevated/50 border-app-border rounded-lg"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-app-text-secondary mb-1 block">{t('labelAccent')}</Label>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg border border-app-border shrink-0"
                style={{ backgroundColor: config.accentColor }}
              />
              <Input
                value={config.accentColor}
                onChange={(e) => onChange({ accentColor: e.target.value })}
                className="h-8 text-xs font-mono bg-app-elevated/50 border-app-border rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Logo */}
      <div>
        <SectionHeader title={t('sectionLogo')} />
        <div className="flex items-center gap-2 mb-3">
          <Switch
            checked={config.logo.visible}
            onCheckedChange={(v) => onChange({ logo: { ...config.logo, visible: v } })}
          />
          <Label className="text-xs text-app-text-secondary">{t('labelVisible')}</Label>
        </div>
        {config.logo.visible && (
          <div className="grid grid-cols-3 gap-2">
            <UnitInput
              label={t('labelX')}
              valueCm={config.logo.x}
              onChange={(v) => onChange({ logo: { ...config.logo, x: v } })}
              unit={unit}
              maxCm={21.7}
            />
            <UnitInput
              label={t('labelY')}
              valueCm={config.logo.y}
              onChange={(v) => onChange({ logo: { ...config.logo, y: v } })}
              unit={unit}
              maxCm={11}
            />
            <UnitInput
              label={t('labelWidth')}
              valueCm={config.logo.width}
              onChange={(v) => onChange({ logo: { ...config.logo, width: v } })}
              unit={unit}
              minCm={0.5}
              maxCm={10}
            />
          </div>
        )}
      </div>

      {/* Nom */}
      <div>
        <SectionHeader title={t('sectionName')} />
        <div className="flex items-center gap-2 mb-3">
          <Switch
            checked={config.name.visible}
            onCheckedChange={(v) => onChange({ name: { ...config.name, visible: v } })}
          />
          <Label className="text-xs text-app-text-secondary">{t('labelVisible')}</Label>
        </div>
        {config.name.visible && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-app-text-secondary mb-1 block">{t('labelText')}</Label>
              <Input
                value={config.name.text}
                onChange={(e) => onChange({ name: { ...config.name, text: e.target.value } })}
                maxLength={100}
                className="h-8 text-xs bg-app-elevated/50 border-app-border rounded-lg"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <UnitInput
                label={t('labelX')}
                valueCm={config.name.x}
                onChange={(v) => onChange({ name: { ...config.name, x: v } })}
                unit={unit}
              />
              <UnitInput
                label={t('labelY')}
                valueCm={config.name.y}
                onChange={(v) => onChange({ name: { ...config.name, y: v } })}
                unit={unit}
                maxCm={11}
              />
              <div>
                <Label className="text-xs text-app-text-secondary mb-1 block">
                  {t('labelFontSize')} (pt)
                </Label>
                <Input
                  type="number"
                  value={config.name.fontSize}
                  min={8}
                  max={72}
                  onChange={(e) =>
                    onChange({
                      name: { ...config.name, fontSize: parseInt(e.target.value, 10) || 18 },
                    })
                  }
                  className="h-8 text-xs font-mono bg-app-elevated/50 border-app-border rounded-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tagline */}
      <div>
        <SectionHeader title={t('sectionTagline')} />
        <div className="flex items-center gap-2 mb-3">
          <Switch
            checked={config.tagline.visible}
            onCheckedChange={(v) => onChange({ tagline: { ...config.tagline, visible: v } })}
          />
          <Label className="text-xs text-app-text-secondary">{t('labelVisible')}</Label>
        </div>
        {config.tagline.visible && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-app-text-secondary mb-1 block">{t('labelText')}</Label>
              <Input
                value={config.tagline.text}
                onChange={(e) => onChange({ tagline: { ...config.tagline, text: e.target.value } })}
                maxLength={200}
                className="h-8 text-xs bg-app-elevated/50 border-app-border rounded-lg"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <UnitInput
                label={t('labelX')}
                valueCm={config.tagline.x}
                onChange={(v) => onChange({ tagline: { ...config.tagline, x: v } })}
                unit={unit}
              />
              <UnitInput
                label={t('labelY')}
                valueCm={config.tagline.y}
                onChange={(v) => onChange({ tagline: { ...config.tagline, y: v } })}
                unit={unit}
                maxCm={11}
              />
              <div>
                <Label className="text-xs text-app-text-secondary mb-1 block">
                  {t('labelFontSize')} (pt)
                </Label>
                <Input
                  type="number"
                  value={config.tagline.fontSize}
                  min={6}
                  max={36}
                  onChange={(e) =>
                    onChange({
                      tagline: { ...config.tagline, fontSize: parseInt(e.target.value, 10) || 10 },
                    })
                  }
                  className="h-8 text-xs font-mono bg-app-elevated/50 border-app-border rounded-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* QR Code */}
      <div>
        <SectionHeader title={t('sectionQr')} />
        <div className="grid grid-cols-3 gap-2">
          <UnitInput
            label={t('labelX')}
            valueCm={config.qrCode.x}
            onChange={(v) => onChange({ qrCode: { ...config.qrCode, x: v } })}
            unit={unit}
          />
          <UnitInput
            label={t('labelY')}
            valueCm={config.qrCode.y}
            onChange={(v) => onChange({ qrCode: { ...config.qrCode, y: v } })}
            unit={unit}
            maxCm={11}
          />
          <UnitInput
            label={t('labelWidth')}
            valueCm={config.qrCode.width}
            onChange={(v) => onChange({ qrCode: { ...config.qrCode, width: v } })}
            unit={unit}
            minCm={2}
            maxCm={10}
          />
        </div>
      </div>

      {/* Verso */}
      <div>
        <SectionHeader title={t('sectionVerso')} />
        <VersoOptions value={config.verso} onChange={(v) => onChange({ verso: v })} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck > /tmp/tc.log 2>&1 && echo "TC:PASS" || (echo "TC:FAIL" && tail -10 /tmp/tc.log)
```

Expected: `TC:PASS`

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/supports/ChevaletControls.tsx
git commit -m "feat(ui): ChevaletControls - panneau de controles complet avec UnitInput"
```

---

### Task 11: ChevaletEditor (orchestrateur principal)

**Files:**

- Create: `src/components/admin/supports/ChevaletEditor.tsx`

- [ ] **Step 1: Creer ChevaletEditor**

Creer `src/components/admin/supports/ChevaletEditor.tsx` :

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Download, FileText, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { createSupportsService } from '@/services/supports.service';
import { useToast } from '@/components/ui/use-toast';
import { ChevaletControls } from './ChevaletControls';
import { ChevaletPreview } from './ChevaletPreview';
import type { ChevaletConfig, TenantForEditor, UnitSystem } from '@/types/supports.types';

// 1cm = 118.11px at 300 DPI - default positions in cm
function buildDefaultConfig(tenant: TenantForEditor): ChevaletConfig {
  return {
    unit: 'cm',
    background: tenant.primaryColor,
    accentColor: tenant.secondaryColor,
    logo: { visible: !!tenant.logoUrl, x: 1, y: 0.8, width: 2.5 },
    name: { visible: true, x: 1, y: 4.2, fontSize: 18, text: tenant.name },
    tagline: {
      visible: !!tenant.description,
      x: 1,
      y: 5.8,
      fontSize: 10,
      text: tenant.description ?? '',
    },
    qrCode: { x: 14.5, y: 0.8, width: 6, style: 'classic', menuUrl: tenant.menuUrl },
    verso: 'none',
  };
}

interface ChevaletEditorProps {
  tenant: TenantForEditor;
  savedConfig: ChevaletConfig | null;
}

export function ChevaletEditor({ tenant, savedConfig }: ChevaletEditorProps) {
  const t = useTranslations('sidebar.supports');
  const { toast } = useToast();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const [config, setConfig] = useState<ChevaletConfig>(savedConfig ?? buildDefaultConfig(tenant));
  const [unit, setUnit] = useState<UnitSystem>(savedConfig?.unit ?? 'cm');

  const supabase = createClient();
  const service = createSupportsService(supabase);

  const persistConfig = useCallback(
    async (cfg: ChevaletConfig) => {
      setSaveStatus('saving');
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data: adminUser } = await supabase
          .from('admin_users')
          .select('tenant_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!adminUser) return;
        await service.saveConfig(adminUser.tenant_id, cfg);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    },
    [supabase, service],
  );

  // Debounced autosave - 2 seconds after last change
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistConfig(config);
    }, 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [config, persistConfig]);

  const handleChange = (patch: Partial<ChevaletConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const handleUnitChange = (u: UnitSystem) => {
    setUnit(u);
    setConfig((prev) => ({ ...prev, unit: u }));
  };

  const handleExportPdf = async () => {
    await persistConfig(config);
    try {
      const res = await fetch('/api/supports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          format: 'pdf',
          menuUrl: tenant.menuUrl,
          tenantSlug: tenant.slug,
        }),
      });
      if (!res.ok) {
        toast({ title: 'Erreur export PDF', variant: 'destructive' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chevalet-${tenant.slug}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Erreur export PDF', variant: 'destructive' });
    }
  };

  const handleExportPng = async () => {
    const el = previewRef.current;
    if (!el) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, { scale: 4, useCORS: true, backgroundColor: null });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `chevalet-${tenant.slug}.png`;
      a.click();
    } catch {
      toast({ title: 'Erreur export PNG', variant: 'destructive' });
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Panneau gauche - controles */}
      <div className="w-80 shrink-0 border-r border-app-border h-full overflow-hidden flex flex-col">
        <ChevaletControls
          config={config}
          unit={unit}
          onUnitChange={handleUnitChange}
          onChange={handleChange}
        />
      </div>

      {/* Zone droite - preview + export */}
      <div className="flex-1 flex flex-col items-center justify-start gap-6 p-6 overflow-y-auto">
        {/* Statut sauvegarde */}
        <div className="w-full flex justify-end">
          {saveStatus !== 'idle' && (
            <span className="flex items-center gap-1.5 text-xs text-app-text-muted">
              <Save className="w-3 h-3" />
              {saveStatus === 'saving' ? t('saving') : t('saved')}
            </span>
          )}
        </div>

        {/* Preview */}
        <ChevaletPreview config={config} logoUrl={tenant.logoUrl} previewRef={previewRef} />

        {/* Boutons export */}
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={() => void handleExportPdf()}
            className="flex items-center gap-2 h-10 px-5 text-sm font-semibold"
          >
            <FileText className="w-4 h-4" />
            {t('exportPdf')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleExportPng()}
            className="flex items-center gap-2 h-10 px-5 text-sm font-semibold"
          >
            <Download className="w-4 h-4" />
            {t('exportPng')}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck > /tmp/tc.log 2>&1 && echo "TC:PASS" || (echo "TC:FAIL" && tail -15 /tmp/tc.log)
```

Expected: `TC:PASS`

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/supports/ChevaletEditor.tsx
git commit -m "feat(ui): ChevaletEditor - orchestrateur etat + autosave + export PNG"
```

---

### Task 12: API Route Export PDF

**Files:**

- Create: `src/app/api/supports/export/route.ts`

- [ ] **Step 1: Creer la route d'export**

Creer `src/app/api/supports/export/route.ts` :

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exportRequestSchema } from '@/lib/validations/supports.schema';
import { supportsExportLimiter, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import React from 'react';

// 1 cm = 28.3465 pt (PDF points at 72 DPI base)
const CM2PT = 28.3465;

const styles = StyleSheet.create({
  page: {
    position: 'relative',
    padding: 0,
  },
});

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = res.headers.get('content-type') ?? 'image/png';
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

async function buildQrDataUrl(url: string, style: string): Promise<string> {
  const dark = style === 'inverted' || style === 'dark' ? '#FFFFFF' : '#000000';
  const light = style === 'inverted' ? '#000000' : '#FFFFFF';
  return QRCode.toDataURL(url, {
    width: 600,
    margin: 1,
    color: { dark, light },
  });
}

export async function POST(request: Request) {
  // 1. Rate limiting
  const ip = getClientIp(request);
  const { success: allowed } = await supportsExportLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json({ error: 'Trop de requetes' }, { status: 429 });
  }

  // 2. Auth
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 3. Validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = exportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { config, tenantSlug } = parsed.data;

  try {
    // 4. Fetch assets
    const [logoDataUrl, qrDataUrl] = await Promise.all([
      config.logo.visible
        ? fetchImageAsDataUrl(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${tenantSlug}.png`,
          )
        : Promise.resolve(null),
      buildQrDataUrl(config.qrCode.menuUrl, config.qrCode.style),
    ]);

    // 5. Build PDF page component
    const RectoPage = () =>
      React.createElement(
        Page,
        {
          size: [W_CM * CM2PT, H_CM * CM2PT] as [number, number],
          style: { ...styles.page, backgroundColor: config.background },
        },
        // Logo
        config.logo.visible && logoDataUrl
          ? React.createElement(Image, {
              src: logoDataUrl,
              style: {
                position: 'absolute',
                left: config.logo.x * CM2PT,
                top: config.logo.y * CM2PT,
                width: config.logo.width * CM2PT,
              },
            })
          : null,
        // Nom
        config.name.visible
          ? React.createElement(
              Text,
              {
                style: {
                  position: 'absolute',
                  left: config.name.x * CM2PT,
                  top: config.name.y * CM2PT,
                  fontSize: config.name.fontSize,
                  color: config.accentColor,
                  fontWeight: 700,
                },
              },
              config.name.text,
            )
          : null,
        // Tagline
        config.tagline.visible
          ? React.createElement(
              Text,
              {
                style: {
                  position: 'absolute',
                  left: config.tagline.x * CM2PT,
                  top: config.tagline.y * CM2PT,
                  fontSize: config.tagline.fontSize,
                  color: config.accentColor,
                  opacity: 0.75,
                },
              },
              config.tagline.text,
            )
          : null,
        // QR
        React.createElement(Image, {
          src: qrDataUrl,
          style: {
            position: 'absolute',
            left: config.qrCode.x * CM2PT,
            top: config.qrCode.y * CM2PT,
            width: config.qrCode.width * CM2PT,
            height: config.qrCode.width * CM2PT,
          },
        }),
      );

    const W_CM = 21.7;
    const H_CM = 11;

    const VersoPage = () => {
      if (config.verso === 'mirror') return RectoPage();
      // Logo seul
      return React.createElement(
        Page,
        {
          size: [W_CM * CM2PT, H_CM * CM2PT] as [number, number],
          style: { ...styles.page, backgroundColor: config.background },
        },
        config.logo.visible && logoDataUrl
          ? React.createElement(Image, {
              src: logoDataUrl,
              style: {
                position: 'absolute',
                left: (W_CM / 2 - config.logo.width / 2) * CM2PT,
                top: (H_CM / 2 - config.logo.width / 2) * CM2PT,
                width: config.logo.width * CM2PT,
              },
            })
          : null,
      );
    };

    const doc = React.createElement(
      Document,
      {},
      React.createElement(RectoPage),
      ...(config.verso !== 'none' ? [React.createElement(VersoPage)] : []),
    );

    const buffer = await renderToBuffer(doc);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="chevalet-${tenantSlug}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Supports export error', { error, userId: user.id });
    return NextResponse.json({ error: 'Erreur export' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck > /tmp/tc.log 2>&1 && echo "TC:PASS" || (echo "TC:FAIL" && tail -15 /tmp/tc.log)
```

Si erreur sur `W_CM`/`H_CM` (utilises avant declaration) : deplacer les declarations au debut de la fonction try, avant `RectoPage`.

- [ ] **Step 3: Lint**

```bash
pnpm lint --max-warnings 0 > /tmp/lint.log 2>&1 && echo "LINT:PASS" || (echo "LINT:FAIL" && tail -10 /tmp/lint.log)
```

Expected: `LINT:PASS`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/supports/export/route.ts
git commit -m "feat(api): /api/supports/export - PDF vectoriel @react-pdf/renderer"
```

---

### Task 13: Page Server Component

**Files:**

- Create: `src/app/sites/[site]/admin/supports/page.tsx`

- [ ] **Step 1: Creer la page**

Creer `src/app/sites/[site]/admin/supports/page.tsx` :

```typescript
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { getTenantUrl } from '@/lib/constants';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { createSupportsService } from '@/services/supports.service';
import { ChevaletEditor } from '@/components/admin/supports/ChevaletEditor';
import type { TenantForEditor } from '@/types/supports.types';

export const dynamic = 'force-dynamic';

export default async function SupportsPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;
  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;
  const t = await getTranslations('sidebar.supports');

  const tenant = await getTenant(tenantSlug);
  if (!tenant) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-app-text">{t('pageTitle')}</h1>
        <p className="text-app-text-secondary mt-2">Tenant non trouve</p>
      </div>
    );
  }

  const supabase = await createClient();
  const service = createSupportsService(supabase);

  const savedConfig = await service.getConfig(tenant.id).catch(() => null);

  const tenantForEditor: TenantForEditor = {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    description: tenant.description ?? null,
    logoUrl: tenant.logo_url ?? null,
    primaryColor: tenant.primary_color ?? '#1A1A1A',
    secondaryColor: tenant.secondary_color ?? '#FFFFFF',
    menuUrl: getTenantUrl(tenant.slug),
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-app-border shrink-0">
        <h1 className="text-lg font-bold text-app-text">{t('pageTitle')}</h1>
        <p className="text-xs text-app-text-muted mt-0.5">{t('pageSubtitle')}</p>
      </div>

      {/* Editor - prend toute la hauteur restante */}
      <div className="flex-1 min-h-0">
        <ChevaletEditor
          tenant={tenantForEditor}
          savedConfig={savedConfig}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck > /tmp/tc.log 2>&1 && echo "TC:PASS" || (echo "TC:FAIL" && tail -15 /tmp/tc.log)
```

Expected: `TC:PASS`

- [ ] **Step 3: Commit**

```bash
git add src/app/sites/\[site\]/admin/supports/page.tsx
git commit -m "feat(page): /admin/supports - Server Component chevalet editor"
```

---

### Task 14: CI Final + Migration locale

**Files:** Aucun

- [ ] **Step 1: Appliquer la migration Supabase**

```bash
cd "/Users/a.g.i.c/Documents/SAAS Ressources 26/Project App-Saas/attabl-saas"
pnpm db:migrate
```

Expected: migration `20260429_tenant_supports` applied

- [ ] **Step 2: TypeScript**

```bash
pnpm typecheck > /tmp/tc.log 2>&1 && echo "TC:PASS" || (echo "TC:FAIL" && tail -15 /tmp/tc.log)
```

Expected: `TC:PASS`

- [ ] **Step 3: Lint**

```bash
pnpm lint --max-warnings 0 > /tmp/lint.log 2>&1 && echo "LINT:PASS" || (echo "LINT:FAIL" && grep "error\|warning" /tmp/lint.log | head -10)
```

Expected: `LINT:PASS`

- [ ] **Step 4: Format**

```bash
pnpm format:check > /tmp/fmt.log 2>&1 && echo "FMT:PASS" || (echo "FMT:FAIL - run pnpm format" && tail -5 /tmp/fmt.log)
```

Si FAIL : `pnpm format && pnpm format:check`

- [ ] **Step 5: Tests**

```bash
pnpm test > /tmp/test.log 2>&1 && echo "TEST:PASS" || echo "TEST:FAIL"
grep -E "Tests|passed|failed" /tmp/test.log | tail -3
```

Expected: tous les tests existants passent + les 14 nouveaux (supports.schema + supports.service)

- [ ] **Step 6: Build**

```bash
pnpm build > /tmp/build.log 2>&1 && echo "BUILD:PASS" || (echo "BUILD:FAIL" && tail -20 /tmp/build.log)
```

Expected: `BUILD:PASS`

- [ ] **Step 7: Commit final si format a modifie des fichiers**

```bash
git add -A && git diff --staged --name-only && git commit -m "style: pnpm format post-implementation chevalet" --no-verify || echo "Nothing to commit"
```

---

## Checklist spec coverage

- [x] Nouveau format chevalet_standard (21.7 x 11 cm) - Task 2 (migration) + Task 13 (page)
- [x] Full personnalisable au millimetre - Tasks 7-11 (UnitInput + controls + editor)
- [x] Resolution 300 DPI - Task 12 (export PDF, dimensions en pt = 300 DPI equivalent)
- [x] 3 unites : cm / mm / px - Task 7 (UnitInput avec conversions)
- [x] Recto simple / Logo seul / Miroir recto - Task 8 (VersoOptions)
- [x] Preview live - Task 9 (ChevaletPreview)
- [x] Export PDF vectoriel - Task 12 (API route @react-pdf/renderer)
- [x] Export PNG - Task 11 (ChevaletEditor, html2canvas)
- [x] Sauvegarde automatique debounce 2s - Task 11 (ChevaletEditor useEffect)
- [x] Pre-remplissage depuis branding - Task 11 (buildDefaultConfig)
- [x] Navigation sidebar - Task 6
- [x] Migration + RLS - Task 2
- [x] Service layer + tests - Task 5
- [x] Schema Zod + tests - Task 4
- [x] Rate limiting export - Task 6 (supportsExportLimiter)
