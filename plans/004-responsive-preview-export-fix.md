# Plan 004: Single live preview that isn't clipped on tablet and exports correctly at every width

> **Executor instructions**: Follow step by step; verify each. Honor STOP conditions. Update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a24fceea..HEAD -- src/components/qr/QRCustomizerLayout.tsx src/components/qr/QRPreview.tsx src/components/qr/QRExportBar.tsx`
> On mismatch, STOP.
>
> **This is a visual/responsive change. Per repo rule `.claude/rules/11-deploy-visual-safety.md`, you MUST render and look at the result at 375/768/1024/1280/1440px in light AND dark before claiming done — do not judge from class names alone.**

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a24fceea`, 2026-07-11

## Why this matters

Two defects make the customizer broken on the device restaurateurs actually use (tablet):

1. **Export captures a hidden node.** One `previewRef` is assigned to **two** `QRPreview` instances — a mobile/tablet one (`block xl:hidden`) and a desktop one (`hidden xl:block`). React's last ref assignment wins, so `previewRef` points to the desktop node, which is `display:none` below 1280px. `html2canvas` of a `display:none` element yields a blank/zero-size canvas → tablet/phone exports are empty.
2. **Tablet preview is clipped.** The mobile/tablet wrapper is `max-h-[300px] overflow-hidden` around a preview whose root is `min-h-[400px]` → the bottom of the card (CTA, table name, powered-by) is cut off; users can't see what they're designing.

## Current state

- `src/components/qr/QRCustomizerLayout.tsx`:
  - `:34` `const previewRef = useRef<HTMLDivElement>(null);`
  - `:43` `<div className="flex flex-col xl:flex-row gap-6">`
  - `:45-46` `<div className="block xl:hidden"> <div className="max-h-[300px] overflow-hidden rounded-2xl">` with `<QRPreview ref={previewRef} ... />` (`:48`)
  - `:59` control column `w-full xl:w-96 xl:shrink-0 xl:max-h-[calc(100dvh-200px)] xl:overflow-y-auto`
  - `:64-66` `<div className="hidden xl:block flex-1 xl:sticky xl:top-24 self-start"> <QRPreview ref={previewRef} ... />`
  - `:77` `<QRExportBar config={config} previewRef={previewRef} tenantSlug={tenantSlug} />`
- `src/components/qr/QRPreview.tsx:42` — root `... min-h-[400px]`.
- `src/components/qr/QRExportBar.tsx:45-60` — captures `previewRef.current` via html2canvas.

Viewport rules (`.claude/rules/08-viewport-production.md`): only `main#main-content` scrolls; no `h-screen`/`100vh`; children use `h-full`. Do not introduce new scroll containers.

## Commands

| Purpose             | Command                      | Expected                       |
| ------------------- | ---------------------------- | ------------------------------ |
| Typecheck           | `pnpm typecheck`             | exit 0                         |
| Lint                | `pnpm lint --max-warnings 0` | exit 0                         |
| Prod build (parity) | `pnpm build && pnpm start`   | serves; inspect at breakpoints |

## Scope

**In scope**: `src/components/qr/QRCustomizerLayout.tsx`, and only if needed `src/components/qr/QRPreview.tsx`.
**Out of scope**: the export logic itself (plan 003/005), the control panels.

## Steps

### Step 1: Render ONE preview, positioned by CSS

Refactor `QRCustomizerLayout` so there is a **single** `<QRPreview ref={previewRef} .../>` instance, not two. Use CSS ordering to place it: on `xl+` show it in the right column (sticky), below `xl` show it stacked on top. Approaches (pick one, keep it simple):

- Keep one preview element and use flex `order-*` + the existing `flex-col xl:flex-row` so the same node moves; or
- Keep one preview and wrap it in a container that is always displayed (never `display:none`), moved via order.
  The invariant: `previewRef` must always point to a **visible** element at the current viewport.
  **Verify**: `pnpm typecheck` → exit 0; grep shows exactly one `ref={previewRef}` in the file.

### Step 2: Remove the clipping wrapper

Delete the `max-h-[300px] overflow-hidden` clamp around the tablet preview. Let the preview size itself (or scale down responsively) so the full card is visible. Do NOT add a new `overflow-y-auto`/scroll container (viewport rule). If vertical space is a concern on short screens, scale the preview (e.g. a `scale`/`max-w`) rather than clipping.
**Verify**: `pnpm lint --max-warnings 0` → exit 0.

### Step 3: Visually verify (MANDATORY)

`pnpm build && pnpm start`. With `ALLOW_DEV_AUTH_BYPASS=true` on localhost, open `/sites/<slug>/admin/qr-codes`, go to "Personnaliser", and check at **375, 768, 1024, 1280, 1440** in light AND dark:

- the full preview card is visible (no clipping) at every width;
- no horizontal overflow; only `main#main-content` scrolls;
- trigger a PDF/PNG export at 768 and confirm the output is **not blank** (this proves the ref points to a visible node).
  Record what you observed. If you cannot render/observe, STOP and report — do not claim done.
  **Verify**: screenshots/observations captured; export at 768 produces a non-empty file.

## Test plan

- No unit test (pure layout/DOM). The verification is the visual + export-at-768 check in Step 3.
- If a small pure helper is introduced (e.g. a scale calc), unit-test it.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint --max-warnings 0`, `pnpm build` exit 0
- [ ] Exactly one `ref={previewRef}` in `QRCustomizerLayout.tsx` (`grep -c "ref={previewRef}"` → 1)
- [ ] `grep -n "max-h-\[300px\]" src/components/qr/QRCustomizerLayout.tsx` → no matches
- [ ] Visual check done at all 5 breakpoints, light+dark; export at 768px is non-blank (observed, recorded)
- [ ] No new scroll container added; no `h-screen`/`100vh`
- [ ] `plans/README.md` row updated

## STOP conditions

- Excerpts don't match live code → STOP.
- You cannot render/observe the page (no dev access) → STOP and report; do not guess.
- Making one preview forces changes to `QRExportBar` capture logic beyond reading `previewRef` → coordinate with plan 003/005 first.

## Maintenance notes

- Reviewer must see the multi-breakpoint screenshots (rule 11 §3 high-risk visual surface). Confirm the 768px export is non-blank.
- If plan 003 lands first and export moved into a helper, ensure the ref still targets the visible preview.
