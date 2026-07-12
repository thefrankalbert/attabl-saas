# Plan 001: Logo upload no longer breaks saving a QR design

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in "STOP
> conditions" occurs, stop and report. When done, update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a24fceea..HEAD -- src/components/qr/panels/QRContentControls.tsx src/lib/validations/qr-design.schema.ts src/app/actions/qr-design.ts src/types/qr-design.types.ts`
> If any in-scope file changed since a24fceea, compare the "Current state" excerpts to the live code; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a24fceea`, 2026-07-11

## Why this matters

Uploading a logo makes **every** save fail. The logo file is read into a base64 data URL (tens of thousands of characters) and stored in `config.logo.src`, but the Zod schema caps `logo.src` at `z.string().max(2048)`. So `saveQrDesignSchema.safeParse` rejects the payload and the user gets an opaque "String must contain at most 2048 character(s)" (or generic) toast. Result: any design with a logo can never be persisted. This is the single biggest reason the feature "doesn't work". After this plan, a logo-bearing design saves reliably and the stored `src` stays small.

## Current state

- `src/components/qr/panels/QRContentControls.tsx:32-47` — `onLogoFile` reads the file with `reader.readAsDataURL(file)` and stores the full data URL:
  ```ts
  reader.onload = (ev) => {
    const dataUrl = ev.target?.result;
    if (typeof dataUrl === 'string') {
      updateField('logo', { ...config.logo, src: dataUrl, enabled: true });
    }
  };
  reader.readAsDataURL(file);
  ```
  No resize, no size cap, no error handling.
- `src/lib/validations/qr-design.schema.ts:37-44` — `logoSchema` with `src: z.string().max(2048)`.
- `src/app/actions/qr-design.ts:36-38` — on parse failure returns `parsed.error.issues[0]?.message` (raw Zod message, not user-friendly).
- `src/types/qr-design.types.ts` — `QRLogoConfig` shape (`src`, `enabled`, plus `width/height/opacity/excavate` which are unused; do NOT remove them here, that is plan 006).
- `src/components/qr/StyledQR.tsx:41,57` — consumes `logoSrc` and uses a hardcoded `logoSize = 0.22`; a small (~256px) logo is more than enough.

Convention: this app stores money in minor units and uses Zod everywhere; validation errors should be actionable. Toasts use `sonner` (`import { toast } from 'sonner'`) — see `src/components/qr/QRExportPanel.tsx` for `toast.error(...)` usage.

## Commands you will need

| Purpose             | Command                                                            | Expected |
| ------------------- | ------------------------------------------------------------------ | -------- |
| Install             | `pnpm install`                                                     | exit 0   |
| Typecheck           | `pnpm typecheck`                                                   | exit 0   |
| Lint                | `pnpm lint --max-warnings 0`                                       | exit 0   |
| Unit tests (schema) | `pnpm test src/lib/validations/__tests__/qr-design.schema.test.ts` | all pass |
| Format              | `pnpm format:check`                                                | no diff  |

## Scope

**In scope**:

- `src/components/qr/panels/QRContentControls.tsx`
- `src/lib/validations/qr-design.schema.ts`
- `src/lib/validations/__tests__/qr-design.schema.test.ts` (add cases)
- (optional new) `src/lib/qr/resize-image.ts` (create) + its test

**Out of scope** (do NOT touch):

- `src/types/qr-design.types.ts` field removals — that is plan 006.
- The paywall/entitlement logic in `src/app/actions/qr-design.ts` — only the wording of the parse-error return may be improved if you choose, nothing else.
- Supabase Storage upload flow — this plan keeps the logo inline but SMALL (see Approach A). Do not add a storage bucket.

## Approach (pick A — simpler, self-contained)

**A. Client-side downscale to a small data URL** (recommended): before storing, draw the image onto a canvas at max 256x256 (preserve aspect ratio), export as `image/png` (or `image/webp`) data URL. A 256px PNG logo is typically 5-30 KB. Raise the schema cap to a safe ceiling that fits a downscaled logo but still bounds abuse.

## Steps

### Step 1: Add an image-resize helper

Create `src/lib/qr/resize-image.ts`:

```ts
/**
 * Downscale an image File to a small data URL (max `maxDim` px on the long edge),
 * preserving aspect ratio. Used for QR-card logos so the stored config stays small.
 * Returns a PNG data URL. Rejects if the file is not a decodable image.
 */
export async function fileToResizedDataUrl(file: File, maxDim = 256): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image decode failed'));
      el.src = objectUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Use the helper in the logo handler + handle errors

In `src/components/qr/panels/QRContentControls.tsx`, replace the body of `onLogoFile` so it (a) validates it is an image and under a raw byte cap (e.g. reject files > 5 MB with `toast.error`), (b) calls `fileToResizedDataUrl`, (c) stores the result, (d) `toast.error` on failure. Keep the `updateField('logo', { ...config.logo, src, enabled: true })` shape. Add `import { toast } from 'sonner'` and `import { fileToResizedDataUrl } from '@/lib/qr/resize-image'`. Use `useTranslations` for the error strings if the component already has a translator; otherwise use a short French ASCII message (plan 009 will i18n-sweep).
**Verify**: `pnpm lint --max-warnings 0` → exit 0.

### Step 3: Raise the schema cap to fit a downscaled logo

In `src/lib/validations/qr-design.schema.ts`, change `src: z.string().max(2048)` to a ceiling that fits a 256px PNG data URL but still bounds abuse — use `z.string().max(200_000)` (a 256px PNG is well under this; 200 KB is a safe upper bound). Keep it a plain string (no `.url()` — data URLs are valid here; scheme allow-listing is plan 007).
**Verify**: `pnpm test src/lib/validations/__tests__/qr-design.schema.test.ts` → all pass.

### Step 4: Add schema regression tests

In `src/lib/validations/__tests__/qr-design.schema.test.ts`, add cases: (a) a config whose `logo.src` is a ~30 KB data URL string now **passes** `qrDesignConfigSchema.safeParse`; (b) a `logo.src` over 200_000 chars **fails**. Model structure after existing tests in that file.
**Verify**: `pnpm test src/lib/validations/__tests__/qr-design.schema.test.ts` → all pass, including the 2 new cases.

## Test plan

- New: `fileToResizedDataUrl` is DOM/canvas-dependent; do NOT add a jsdom canvas test (happy-dom lacks canvas). Cover the schema change instead (Step 4). Optionally add a pure test that the exported function exists and rejects a non-image `File` via a mocked `Image` — only if it stays simple; otherwise skip.
- Existing pattern: `src/lib/validations/__tests__/qr-design.schema.test.ts`.
- Verify: `pnpm test src/lib/validations` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint --max-warnings 0` exits 0
- [ ] `pnpm test src/lib/validations` passes with >=2 new logo cases
- [ ] `pnpm format:check` clean
- [ ] `grep -n "max(2048)" src/lib/validations/qr-design.schema.ts` returns nothing
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` row for 001 updated

## STOP conditions

- The excerpts in "Current state" don't match live code (drift) → STOP.
- `logoSchema` already uses `.url()` or a scheme refinement (means plan 007 landed first) → STOP and report so ordering is reconciled.
- Resizing appears to require a dependency install → STOP (the canvas approach needs none).

## Maintenance notes

- If a Supabase Storage upload flow is later added for logos, `logo.src` becomes a URL and the 200 KB cap + resize helper can be dropped in favor of `.url()` + scheme allow-list (coordinate with plan 007).
- Reviewer: confirm the stored data URL is actually small (upload a large photo, save, inspect `config.logo.src` length).
