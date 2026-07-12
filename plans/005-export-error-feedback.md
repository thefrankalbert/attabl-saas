# Plan 005: Every export/print failure gives the user feedback (no more silent dead buttons)

> **Executor instructions**: Follow step by step; verify each. Honor STOP conditions. Update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a24fceea..HEAD -- src/components/qr/QRExportBar.tsx src/components/qr/LaunchQR.tsx src/components/qr/QRCodePage.tsx src/components/qr/QRExportPanel.tsx`
> On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 003 (if 003 lands first, apply toasts to the unified helper's call sites instead)
- **Category**: bug
- **Planned at**: commit `a24fceea`, 2026-07-11

## Why this matters

When export fails (SVG not painted yet, tainted canvas, jsPDF throws) the user clicks download and gets **nothing** — no file, no error — indistinguishable from a frozen feature. Several paths only `logger.warn`/`logger.error`, one is a bare `catch {}`. The correct model already exists in `QRExportPanel.tsx` (toasts success/error).

## Current state

- `src/components/qr/QRExportBar.tsx:50-53,74-78,86-89,100-107` — PDF/PNG abort with `logger.warn`/`logger.error`, no toast; the `if (!el.querySelector('svg')) return;` guard returns silently.
- `src/components/qr/LaunchQR.tsx:68-70` — `catch {}` with comment `// Export failed silently` (no logger, no toast).
- `src/components/qr/QRCodePage.tsx:502-506` — batch `catch` only `logger.error`; success path no confirmation; `:437-443` silently skips a table whose SVG never renders.
- `src/components/qr/QRExportPanel.tsx:145,148` — the GOOD pattern: `toast.error(...)` / `toast.success(...)`.

Convention: `import { toast } from 'sonner'`; user-facing strings via `useTranslations` where the component already has a translator (else short ASCII French; plan 009 sweeps i18n). Logging via `logger` from `src/lib/logger.ts` — never `console.*`.

## Commands

| Purpose   | Command                      | Expected |
| --------- | ---------------------------- | -------- |
| Typecheck | `pnpm typecheck`             | exit 0   |
| Lint      | `pnpm lint --max-warnings 0` | exit 0   |
| Build     | `pnpm build`                 | exit 0   |

## Scope

**In scope**: `QRExportBar.tsx`, `LaunchQR.tsx`, `QRCodePage.tsx` (batch feedback). Touch `QRExportPanel.tsx` only if unifying a shared toast string.
**Out of scope**: rewriting export internals (plan 003), the preview layout (plan 004).

## Steps

### Step 1: Replace the silent `catch {}` in LaunchQR

`LaunchQR.tsx:68` — add `logger.error('[LaunchQR] export failed', err)` and `toast.error(...)`. Import `logger` and `toast`.
**Verify**: `grep -n "catch {}" src/components/qr/LaunchQR.tsx` → no matches.

### Step 2: Toast on every QRExportBar abort/catch

`QRExportBar.tsx` — on each error/abort branch add `toast.error(...)`. For the `if (!el.querySelector('svg')) return;` guard, either (a) `toast.error('Apercu pas encore pret, reessayez')` before returning, or (b) disable the export buttons until an `svg` exists in the preview. Prefer (b) if trivial; else (a).
**Verify**: `pnpm lint --max-warnings 0` → exit 0.

### Step 3: Fix print isolation from the "Personnaliser" tab

`QRExportBar.tsx:143-145,197-205` has a "Imprimer" button calling `window.print()`, but the print-isolation CSS (`body * { visibility:hidden }` scoped to `#qr-print-root`) lives in `QRPrintSheet`, which is rendered **only** in `QRExportPanel` (the Download tab). `QRCustomizerLayout.tsx` mounts `QRExportBar` in the "Personnaliser" tab **without** `QRPrintSheet` — so printing from that tab outputs the entire admin shell instead of a clean card. Fix: either render `QRPrintSheet` wherever `QRExportBar`'s Print button can fire, OR hide/disable the Print button when `#qr-print-root` is not mounted (i.e. outside the Download tab). Verify in a browser (rule 11) that printing from "Personnaliser" produces a clean card, not the admin page.
**Verify**: `pnpm build`; browser print-preview from the Personnaliser tab shows only the QR card.

### Step 4: Batch feedback + skipped-table warning

`QRCodePage.tsx` `handleBatchDownload` — add `toast.error(...)` in the catch and `toast.success(...)` on success. When a table is skipped (SVG never rendered within the poll), collect its name and `toast.warning`/`toast.error` listing skipped tables (do not silently omit tables from the PDF). If plan 003 already moved this into `exportCardsToPdf`, add the toasts at the call site and have the helper return `{ skipped: string[] }`.
**Verify**: `grep -n "logger.error" src/components/qr/QRCodePage.tsx` still present AND a `toast` call now accompanies it.

## Test plan

- No unit test (UI side effects). Verification is grep + build. Optionally, if plan 003's helper returns `{ skipped }`, add a unit test that a skipped card is reported.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint --max-warnings 0`, `pnpm build` exit 0
- [ ] `grep -rn "catch {}" src/components/qr` → no matches
- [ ] `grep -rn "Export failed silently" src/components/qr` → no matches
- [ ] Every export error path in the three files has a `toast.*` call (reviewer confirms)
- [ ] `plans/README.md` row updated

## STOP conditions

- Excerpts don't match live code → STOP.
- If plan 003 has already consolidated exports and these files no longer contain export handlers → apply toasts at the new call sites and note the redirection.

## Maintenance notes

- Keep the "GOOD pattern" in `QRExportPanel.tsx` as the reference. Any future export entry point must toast on failure.
