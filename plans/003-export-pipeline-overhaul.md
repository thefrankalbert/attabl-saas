# Plan 003: Export/print pipeline renders the real design, per table, with the correct table id

> **Executor instructions**: Follow step by step; verify each step. Honor STOP conditions. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a24fceea..HEAD -- src/components/qr/QRCodePage.tsx src/components/qr/QRExportPanel.tsx src/components/qr/QRExportBar.tsx src/lib/qr src/services/qr-design.service.ts src/app/actions/qr-design.ts`
> On mismatch with excerpts below, STOP.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (independent of 001/002, but touches the same feature — sequence after 002 to reduce merge churn)
- **Category**: bug + tech-debt
- **Planned at**: commit `a24fceea`, 2026-07-11

## Why this matters

Three failures converge in the export path, which is the feature's actual deliverable (the printed card):

1. **Batch "download all tables" encodes the wrong table identifier.** `QRCodePage.tsx:417` passes `table.display_name` to `buildQRUrl`, while every other path uses `table.table_number` (`:83`). The storefront stores the `?table=` param verbatim, so scanning a batch-printed code attaches orders to a mismatched/unknown table.
2. **Batch export ignores all styling.** The batch loop renders a plain `QRCodeSVG` (from `qrcode.react`) with only fg/bg/errorCorrection — no template, dot/corner style, or logo. The printed cards look nothing like the customized preview.
3. **Assigned per-table designs are never used.** `resolveDesignForTable(tenantId, tableId)` (`qr-design.service.ts:185`) resolves table→zone→tenant-default config, but nothing calls it in production — so the whole "Assign" tab has no effect on output.
   Additionally there are **four** near-duplicate export implementations (`QRCodePage` batch, `QRExportPanel`, `QRExportBar`, `LaunchQR`) that must each be fixed separately today.

After this plan: one export helper renders each table's **resolved** design with the styled renderer (`StyledQR` + template) and the correct `table_number`, and `qrcode.react` is removed from the QR feature.

## Current state

- `src/components/qr/QRCodePage.tsx:400-506` — `handleBatchDownload` inside the `BatchQRPreview` component: inline `jsPDF`, dynamic `import('qrcode.react')`, renders `QRCodeSVG` (`:426-435`) with `value: tableUrl`, `fgColor/bgColor/errorCorrection` only; `tableUrl = buildQRUrl(menuUrl, table.display_name, selectedMenu?.slug)` (`:417`); ad-hoc A4 layout (not `computeTiling`); `catch` only `logger.error` (`:502`).
- `src/components/qr/QRExportPanel.tsx:85-148` — single styled export: renders `TEMPLATE_REGISTRY[...]`/`StyledQR`, captures with `captureElementToCanvas`, uses `computeTiling` (`src/lib/qr/pdf-tiling.ts`), toasts success/error. This is the **good** pattern to generalize.
- `src/components/qr/QRExportBar.tsx:45-107` — customizer export (PDF/PNG) via `previewRef` + html2canvas; guards `if (!el.querySelector('svg')) return;` with no retry.
- `src/lib/qr/build-qr-url.ts` — `buildQRUrl(menuUrl, table?, menuSlug?)`; encodes params via `URL`/`searchParams` (correct).
- `src/lib/qr/capture-template.ts` — `captureElementToCanvas(el, html2canvas)`; defines its own `Html2CanvasFn` type (see plan 010 for the cast cleanup — not here).
- `src/lib/qr/pdf-tiling.ts` — `computeTiling(...)` geometry (tested, sound).
- `src/services/qr-design.service.ts:185-215` — `resolveDesignForTable` returns a `QRDesignConfig`.
- `package.json` — both `qr-code-styling` and `qrcode.react` are dependencies.
- `src/components/qr/StyledQR.tsx` — renders a styled QR (dynamic `import('qr-code-styling')` in an effect; SVG appended async).

Convention: dynamic-import heavy libs (jspdf/html2canvas) in the handler; toasts via `sonner`; templates come from `TEMPLATE_REGISTRY` in `src/components/qr/templates/index.ts`.

## Commands

| Purpose     | Command                       | Expected                           |
| ----------- | ----------------------------- | ---------------------------------- |
| Typecheck   | `pnpm typecheck`              | exit 0                             |
| Lint        | `pnpm lint --max-warnings 0`  | exit 0                             |
| Tiling test | `pnpm test src/lib/qr`        | pass                               |
| Build       | `pnpm build`                  | exit 0                             |
| Dep check   | `grep -rn "qrcode.react" src` | (after) only non-QR usages, if any |

## Scope

**In scope**:

- `src/lib/qr/export-card.ts` (create — the unified helper)
- `src/components/qr/QRCodePage.tsx` (batch: use helper + resolve design + table_number)
- `src/components/qr/QRExportPanel.tsx`, `QRExportBar.tsx`, `src/components/qr/LaunchQR.tsx` (route through helper)
- a server action to resolve designs for a set of tables (add to `src/app/actions/qr-design.ts`) — needed because `resolveDesignForTable` runs server-side (Supabase)
- `src/lib/qr/__tests__/export-card.test.ts` (create, for pure parts)
- `package.json` (remove `qrcode.react` ONLY if grep proves no remaining import)

**Out of scope**: the customizer UI, the schema, the paywall gate. Do not change `build-qr-url.ts`'s signature.

## Steps

### Step 1: Add a server action to resolve per-table designs

In `src/app/actions/qr-design.ts`, add `actionResolveDesignsForTables(tableIds: string[])`: auth via the existing `getAuthenticatedUserWithTenant` (read permission), then map each id through `createQrDesignService(supabase).resolveDesignForTable(tenantId, id)`; return `{ success, data: Record<tableId, QRDesignConfig> }`. Derive `tenantId` from session — never accept it from the client. Reuse the file's existing error handling shape.
**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Extract a unified export helper

Create `src/lib/qr/export-card.ts` exporting `exportCardsToPdf({ cards, format, filename })` where each `card` is `{ url: string; caption: string; config: QRDesignConfig }`. Internally: dynamic-import jspdf/html2canvas; for each card render the template (`TEMPLATE_REGISTRY[config.templateId]` / `StyledQR`) into an off-screen container, **wait for the SVG to paint** (reuse the bounded-poll pattern already at `QRCodePage.tsx:437-443` — extract it into this module as `waitForSvg(el, timeoutMs=2000)`), capture via `captureElementToCanvas`, and place using `computeTiling` from `pdf-tiling.ts`. Also export `exportSingleCard(...)` for the single/PNG path. Keep all geometry in `computeTiling` (no ad-hoc math).
**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Rewrite batch download to use resolved designs + table_number

In `QRCodePage.tsx` `handleBatchDownload`: call `actionResolveDesignsForTables(tables.map(t => t.id))`; build cards with `url: buildQRUrl(menuUrl, table.table_number, selectedMenu?.slug)` (NOTE: `table_number`, not `display_name`), `caption: table.display_name`, `config: resolved[table.id]`; call `exportCardsToPdf`. Remove the inline `qrcode.react`/jsPDF block. On error, `toast.error(...)`; on success `toast.success(...)`. If a table's design fails to resolve, fall back to the tenant default and continue (do not silently drop — count skips and warn).
**Verify**: `pnpm lint --max-warnings 0` → exit 0.

### Step 4: Route the other three export sites through the helper

Update `QRExportPanel.tsx`, `QRExportBar.tsx`, `LaunchQR.tsx` to call `exportSingleCard`/`exportCardsToPdf` instead of their own jspdf/html2canvas blocks. Preserve their existing filenames and formats. (Toasts/guards are finalized in plan 005; here just ensure no regression and no silent `catch {}` remains — at minimum `logger.error`.)
**Verify**: `pnpm build` → exit 0.

### Step 5: Remove the redundant QR library if now unused

`grep -rn "qrcode.react" src`. If there are **zero** imports left, remove `qrcode.react` from `package.json` and run `pnpm install`. If any usage remains outside the QR feature, leave the dep and note it.
**Verify**: `grep -rn "from 'qrcode.react'" src` → no matches (or documented remaining usage); `pnpm build` → exit 0.

## Test plan

- New `src/lib/qr/__tests__/export-card.test.ts`: unit-test the pure parts you can (e.g. the cards-to-tiling mapping, filename derivation, `waitForSvg` resolving/timing out with a fake element). Do NOT attempt real html2canvas/jspdf in jsdom.
- Add a `build-qr-url` test asserting the batch mapping uses `table_number` (see plan 010 for the full build-qr-url suite; a minimal assertion here is fine).
- Pattern: `src/lib/qr/__tests__/pdf-tiling.test.ts`.
- Verify: `pnpm test src/lib/qr` → all pass.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint --max-warnings 0`, `pnpm build` all exit 0
- [ ] `pnpm test src/lib/qr` passes with new export-card tests
- [ ] `grep -n "display_name" src/components/qr/QRCodePage.tsx` shows it used only as a caption, never as the `buildQRUrl` table arg
- [ ] `grep -rn "QRCodeSVG" src/components/qr/QRCodePage.tsx` → no matches
- [ ] Batch loop calls `actionResolveDesignsForTables` (grep confirms)
- [ ] `plans/README.md` row updated

## STOP conditions

- Excerpts don't match live code (drift) → STOP.
- `resolveDesignForTable` returns a shape that doesn't match what `StyledQR`/templates consume → STOP and report (config contract mismatch).
- Rendering styled QR off-screen in a loop is prohibitively slow for large table counts (>200) → STOP and report; may need batching/progress UI.
- Removing `qrcode.react` breaks a build elsewhere → keep the dep, note it, continue.

## Maintenance notes

- This is the single highest-value fix: it makes "Assign a design per table" actually change the printed output. Reviewer must confirm two tables with different assigned designs export as visibly different cards, and that a scanned batch code carries `table_number`.
- If pagination/lazy table loading is added, the batch resolve action must page too.
- Any already-printed codes in the wild encoded `display_name`; note this in the PR (existing physical codes may need reprinting if display_name != table_number).
