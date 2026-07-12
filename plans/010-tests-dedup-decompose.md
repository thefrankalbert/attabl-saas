# Plan 010: Cover the untested critical paths; remove remaining duplication and type escapes

> **Executor instructions**: Follow step by step; verify each. Honor STOP conditions. Update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a24fceea..HEAD -- src/lib/qr src/hooks src/components/qr src/services/__tests__/qr-design.service.test.ts src/components/onboarding/utils/qr-config-bridge.ts src/types/qr-design.types.ts`
> On mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 003, 006 (do this last — after the export pipeline and config shape stabilize)
- **Category**: tests + tech-debt
- **Planned at**: commit `a24fceea`, 2026-07-11

## Why this matters

The revenue/correctness-critical paths are untested and some existing tests are misleading: the paywall gate has zero tests; `build-qr-url` (decides where every scanned code points), the `useQRDesignConfig` reducer, and `qr-config-bridge` are uncovered; one service test asserts a vacuously-true IDOR case; and there is leftover duplication (zone-grouping ×3, template card shell ×3, config shape ×3) plus type-escape casts and a 550-line file. This plan hardens the safety net and pays down the residual debt the earlier plans didn't already absorb.

## Current state

- Existing tests: `src/lib/qr/__tests__/pdf-tiling.test.ts`, `src/lib/validations/__tests__/qr-design.schema.test.ts`, `src/services/__tests__/qr-design.service.test.ts`.
- No tests for: `src/app/actions/qr-design.ts` (paywall gate), `src/lib/qr/build-qr-url.ts`, `src/hooks/useQRDesignConfig.ts` (reducer — plan 002 adds some; extend), `src/components/onboarding/utils/qr-config-bridge.ts` (`coerceTemplateId` legacy mapping).
- `src/services/__tests__/qr-design.service.test.ts:99-125` — asserts `eqCalls.every(([, v]) => v !== 'evil')` but no `'evil'` is ever introduced → vacuous; the insert path's `tenant_id` scoping is not actually asserted.
- `:148-187` — tests `resolveDesignForTable`; after plan 003 wires it into production this stays valid (keep).
- Duplication: zone-grouping logic at `QRCodePage.tsx:65-76`, `:387-398`, `QRAssignmentPanel.tsx:63-68`; identical template card shell across `templates/*` (border drifted `#ECECEC` vs `#E4E4E7`); config shape in `qr-design.types.ts` + `qr-design.schema.ts` + `qr-config-bridge.ts`.
- Type escapes: `QRExportPanel.tsx:132` `html2canvas as unknown as Parameters<...>[1]`; `page.tsx:80` `as {...}[]`; `capture-template.ts:58` custom `Html2CanvasFn` forcing the cast.
- `QRCodePage.tsx` is 550 lines (rule limit 400) and holds `BatchQRPreview` inline.

## Commands

| Purpose    | Command                                  | Expected           |
| ---------- | ---------------------------------------- | ------------------ |
| Typecheck  | `pnpm typecheck`                         | exit 0             |
| Lint       | `pnpm lint --max-warnings 0`             | exit 0             |
| Tests      | `pnpm test`                              | pass               |
| Build      | `pnpm build`                             | exit 0             |
| Line count | `wc -l src/components/qr/QRCodePage.tsx` | < 400 after Step 5 |

## Scope

**In scope**: new test files under `src/**/__tests__/`; `src/services/__tests__/qr-design.service.test.ts` (fix vacuous assert); `src/lib/qr/build-qr-url.ts` callers only if needed; a `groupTablesByZone` util (create `src/lib/qr/group-tables.ts`); a shared template card component; `capture-template.ts` + `QRExportPanel.tsx` + `page.tsx` (cast cleanup); extract `BatchQRPreview` out of `QRCodePage.tsx`; optionally `z.infer` unification of the config type.
**Out of scope**: functional behavior changes (all covered by 001-009). This plan is refactor + tests only — no behavior change.

## Steps

### Step 1: Test the paywall gate

Create `src/app/actions/__tests__/qr-design.action.test.ts`: mock auth/tenant/service; assert `actionSaveQrDesign` returns the Pro-only error when `canAccessFeature` is false, succeeds when true, and never uses a client-supplied tenant_id. Add an assign-not-entitled case (after plan 007). Model after existing action tests (grep `src/app/actions/__tests__` for one).
**Verify**: `pnpm test src/app/actions` → pass.

### Step 2: Test build-qr-url, reducer, bridge

- `src/lib/qr/__tests__/build-qr-url.test.ts`: 4 param combinations (menu+table, menu only, table only, neither); assert the `?table=`/`?menu=` params and encoding.
- Extend `src/hooks/__tests__/useQRDesignConfig.test.ts` (from plan 002) if not already covering HYDRATE/SET_TEMPLATE/RESET.
- `src/components/onboarding/utils/__tests__/qr-config-bridge.test.ts`: `coerceTemplateId` legacy mapping + style→color resolution.
  **Verify**: `pnpm test src/lib/qr src/hooks src/components/onboarding` → pass.

### Step 3: Fix the vacuous service test

In `qr-design.service.test.ts:99-125`, assert the insert payload actually carries `tenant_id: 'tenant-A'` (not the meaningless `!== 'evil'` check). Keep the `resolveDesignForTable` tests.
**Verify**: `pnpm test src/services` → pass.

### Step 4: Dedup zone-grouping + template shell

Create `src/lib/qr/group-tables.ts` exporting `groupTablesByZone(zones, tables)`; replace the three inline copies. Extract a shared `<QRCard>` shell (the identical outer style block) used by all three templates; unify the drifted border color to one token/value. Add a unit test for `groupTablesByZone`.
**Verify**: `grep -rn "groupTablesByZone" src` → 3 call sites use it; `pnpm test src/lib/qr` → pass.

### Step 5: Remove type escapes + decompose the 550-line file

- Import html2canvas's real type in `capture-template.ts`, type `captureElementToCanvas`'s param as it, and drop the double-cast at `QRExportPanel.tsx:132` and the `as {...}[]` at `page.tsx:80` (type the query result properly).
- Extract `BatchQRPreview` from `QRCodePage.tsx` into `src/components/qr/BatchQRPreview.tsx` so `QRCodePage.tsx` < 400 lines.
  **Verify**: `wc -l src/components/qr/QRCodePage.tsx` → < 400; `grep -rn "as unknown as" src/components/qr` → no matches; `pnpm typecheck` → exit 0.

### Step 6: (optional) Unify config type via z.infer

If low-risk after plan 006 trimmed the shape: make `qrDesignConfigSchema` the source of truth and `export type QRDesignConfig = z.infer<typeof qrDesignConfigSchema>`, driving `createDefaultQRDesignConfig` from it. If this ripples into many files, SKIP and leave a note (don't force it).
**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → pass.

## Test plan

- New: action paywall test, build-qr-url test, bridge test, group-tables test; fixed service test.
- Pattern: existing `__tests__` files listed above.
- Verify: `pnpm test` → all pass with the new suites.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint --max-warnings 0`, `pnpm test`, `pnpm build` all pass
- [ ] New test files exist: action paywall, build-qr-url, qr-config-bridge, group-tables
- [ ] `grep -rn "!== 'evil'" src/services/__tests__/qr-design.service.test.ts` → no matches
- [ ] `wc -l src/components/qr/QRCodePage.tsx` < 400
- [ ] `grep -rn "as unknown as" src/components/qr` → no matches
- [ ] `plans/README.md` row updated

## STOP conditions

- Excerpts don't match live code (drift from plans 003/006) → re-read and adapt; if the export pipeline was restructured, align the tests to the new shape.
- `z.infer` unification (Step 6) cascades into >10 files → SKIP Step 6, note it.
- Extracting `BatchQRPreview` conflicts with plan 003's changes to the same component → sequence after 003 and adapt.

## Maintenance notes

- The paywall action test is the regression guard for the revenue boundary — never delete it.
- Reviewer: confirm no behavior changed (this plan is refactor + tests only); coverage of build-qr-url and the reducer is the highest-value addition.
