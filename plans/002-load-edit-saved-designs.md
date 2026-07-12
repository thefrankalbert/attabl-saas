# Plan 002: Saved QR designs can be reloaded and edited (no more silent duplicates)

> **Executor instructions**: Follow step by step; verify each step. Honor STOP conditions. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a24fceea..HEAD -- src/app/sites/[site]/admin/qr-codes/page.tsx src/hooks/useQRDesignConfig.ts src/components/qr/QRAssignmentPanel.tsx src/components/qr/QRCodePage.tsx src/lib/validations/qr-design.schema.ts`
> On mismatch with excerpts below, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001 (saving must work before edit-existing is meaningful)
- **Category**: bug
- **Planned at**: commit `a24fceea`, 2026-07-11

## Why this matters

After saving a design the user can never reopen it. The editor always initializes from `createDefaultQRDesignConfig(...)`, and the load query never fetches the stored `config`. Every "save" is an INSERT (the action's `update` branch is dead from the UI), so repeated edits silently pile up duplicate rows. After this plan: the saved-designs list is clickable, loads its config into the editor, and re-saving updates that design instead of duplicating it.

## Current state

- `src/app/sites/[site]/admin/qr-codes/page.tsx:54-58` — designs fetched with only `id, name, is_default`; `config` (jsonb) is never selected.
- `src/hooks/useQRDesignConfig.ts:33-58` — reducer has `SET_FIELD`, `SET_TEMPLATE`, `RESET`; **no `HYDRATE`**. Hook always inits via `createDefaultQRDesignConfig`.
- `src/components/qr/QRAssignmentPanel.tsx:75-93` — `saveCurrentDesign` calls `actionSaveQrDesign({ name, config, isDefault })`, never passing `id`; the saved-designs list rows (~`:167-183`) have no click handler.
- `src/app/actions/qr-design.ts:44-45,68-71` — `saveQrDesignSchema` accepts an optional `id`; the audit log already branches on `parsed.data.id ? 'update' : 'create'`. The update path exists server-side but is unreachable from UI.
- `src/lib/validations/qr-design.schema.ts` — `qrDesignConfigSchema` validates the full config shape; use it to validate loaded jsonb before hydrating.

Convention: server components fetch and pass props; the customizer state lives in the `useQRDesignConfig` client hook consumed by `QRCodePage.tsx`. Reducer actions are discriminated unions.

## Commands

| Purpose      | Command                      | Expected                     |
| ------------ | ---------------------------- | ---------------------------- |
| Typecheck    | `pnpm typecheck`             | exit 0                       |
| Lint         | `pnpm lint --max-warnings 0` | exit 0                       |
| Reducer test | `pnpm test src/hooks`        | pass (after Step 4 adds one) |
| Build        | `pnpm build`                 | exit 0                       |

## Scope

**In scope**:

- `src/app/sites/[site]/admin/qr-codes/page.tsx` (select `config`)
- `src/hooks/useQRDesignConfig.ts` (add `HYDRATE`)
- `src/components/qr/QRCodePage.tsx` (thread hydrate + current design id)
- `src/components/qr/QRAssignmentPanel.tsx` (row click -> load, pass id on save)
- `src/hooks/__tests__/useQRDesignConfig.test.ts` (create)

**Out of scope**: the export pipeline (plan 003), the paywall action logic, the DB schema.

## Steps

### Step 1: Select the stored config on load

In `page.tsx`, change the `qr_designs` select to include `config`: `.select('id, name, is_default, config')`. Pass the designs (with config) down to `QRCodePage` as it already does.
**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Add a `HYDRATE` reducer action

In `useQRDesignConfig.ts`, add:

```ts
type HydrateAction = { type: 'HYDRATE'; config: QRDesignConfig };
```

add it to the `QRDesignAction` union, handle it in the reducer (`case 'HYDRATE': return action.config;`), and expose a `hydrate(config: QRDesignConfig)` callback from the hook (memoized like the others).
**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Wire "load design into editor" + edit-in-place save

In `QRAssignmentPanel.tsx` (and/or `QRCodePage.tsx` where the hook lives):

- Track the currently-loaded design id in state (e.g. `currentDesignId: string | null`).
- Make each saved-design list row a `<Button variant="ghost">` (shadcn, not native) that, on click: validates `design.config` with `qrDesignConfigSchema.safeParse`; if valid, calls `hydrate(parsed.data)` and sets `currentDesignId = design.id`; if invalid, `toast.error(...)` and do not hydrate.
- In `saveCurrentDesign`, pass `id: currentDesignId ?? undefined` to `actionSaveQrDesign`, so an edited design UPDATEs instead of duplicating. After a successful create, set `currentDesignId` to the returned `data.id`.
  Because `hydrate` needs to reach the hook state, you may need to lift `currentDesignId` and pass `hydrate` down as props from `QRCodePage` to `QRAssignmentPanel`. Keep prop drilling shallow and typed.
  **Verify**: `pnpm lint --max-warnings 0` → exit 0.

### Step 4: Reducer unit test

Create `src/hooks/__tests__/useQRDesignConfig.test.ts` testing the pure reducer (import and call `qrDesignReducer` — export it from the hook module if not already exported; add `export` to the function). Cover: `HYDRATE` replaces state with the given config; `SET_TEMPLATE` preserves `templateWidth`/`templateHeight` while updating `qrSize` (the documented invariant at `useQRDesignConfig.ts:44-52`); `RESET` returns defaults. Model after any existing pure-function test, e.g. `src/lib/qr/__tests__/pdf-tiling.test.ts`.
**Verify**: `pnpm test src/hooks` → all pass incl. new cases.

## Test plan

- New: reducer tests (Step 4) — HYDRATE, SET_TEMPLATE invariant, RESET.
- Pattern: `src/lib/qr/__tests__/pdf-tiling.test.ts`.
- Verify: `pnpm test src/hooks` → pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint --max-warnings 0` exits 0
- [ ] `pnpm test src/hooks` passes with new reducer tests
- [ ] `pnpm build` exits 0
- [ ] `grep -n "config" src/app/sites/\[site\]/admin/qr-codes/page.tsx` shows config selected
- [ ] Clicking a saved design loads it (manual: covered by reviewer; code path present)
- [ ] No out-of-scope files modified; `plans/README.md` row updated

## STOP conditions

- Excerpts don't match live code (drift) → STOP.
- Hydrating with a stored config that fails `qrDesignConfigSchema` for legacy rows: do NOT loosen the schema; `toast.error` and skip. If most existing rows fail validation, STOP and report (a data migration may be needed).
- If lifting state forces edits to more than the 4 in-scope component files → STOP.

## Maintenance notes

- Once designs are hydratable, `ColorPicker` must sync its hex text to external `value` changes (plan handles this in 006 / see finding CORRECT-06) — flag if hex looks stale after loading a design.
- Reviewer: confirm re-saving a loaded design does NOT create a new row (check `id` is passed).
