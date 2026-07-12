# Plan 007: Close the QR-design authorization, rate-limit, entitlement-drift and input gaps

> **Executor instructions**: Follow step by step; verify each. Honor STOP conditions. Update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a24fceea..HEAD -- src/app/actions/qr-design.ts src/services/qr-design.service.ts src/lib/validations/qr-design.schema.ts supabase/migrations`
> On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches RLS + a DB migration)
- **Depends on**: none (but coordinate the entitlement single-source with any change to `src/lib/plans/features.ts`)
- **Category**: security
- **Planned at**: commit `a24fceea`, 2026-07-11

## Why this matters

The QR feature's security foundation is sound (tenant isolation, ownership checks, `getUser`, RLS present, no XSS). But five gaps remain: (SEC-01) write RLS on `qr_designs` authorizes any tenant member regardless of role/permission/active status; (SEC-02) no rate limit and no per-tenant cap on design creation; (SEC-03) the assignment action isn't gated by the QR-customization entitlement, so a downgraded tenant keeps applying paid designs; (SEC-04) the entitlement rule is duplicated in the SQL trigger and `features.ts` and can drift; (SEC-05) `logo.src`/`backgroundImage.src` accept arbitrary strings.
Note: SEC-05's `backgroundImage` is removed by plan 006; only `logo.src` scheme validation remains here if 006 landed first.

## Current state

- `supabase/migrations/20260704000000_qr_designs.sql:45-64` — INSERT/UPDATE/DELETE policies authorize on `tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid())` — no role/permission check, no `is_active`/`deleted_at` filter.
- `src/app/actions/qr-design.ts:33,89,119` — actions require `settings.edit` via `getAuthenticatedUserWithTenant`; `src/lib/auth/get-session.ts:126-129` additionally filters `is_active = true`. DB enforces neither. The app layer is the only enforcement — a member calling PostgREST (`/rest/v1/qr_designs`) directly bypasses it (same-tenant privilege drift, not cross-tenant).
- `src/app/actions/qr-design.ts:29-142` — no `rateLimit` calls; only `contact.ts`/`newsletter.ts` use it. `src/lib/rate-limit.ts` is a PROTECTED file — do not modify it; only import and use an existing limiter (or add a new limiter following the exact existing pattern if none fits — prefer reuse).
- `src/services/qr-design.service.ts:142-153` — `saveDesign` INSERTs when no `id`; no per-tenant count cap.
- `src/app/actions/qr-design.ts:116-142` — `actionAssignQrDesign` checks only `settings.edit`; unlike `actionSaveQrDesign` (`:44-58`) it never calls `canAccessFeature('canAccessQrCustomization', ...)`.
- `supabase/migrations/20260711080000_qr_customization_db_paywall.sql:45-47` — trigger hardcodes `(v_status='trial' AND trial_ends_at>now()) OR v_plan IN ('pro','business','enterprise')`, mirroring `getEffectivePlan`/`canAccessFeature` in `src/lib/plans/features.ts:160-214`. No test pins them together.
- `src/lib/validations/qr-design.schema.ts:39` — `logo.src = z.string().max(...)` (cap raised in plan 001); no scheme allow-list.

Conventions: migrations are additive files `supabase/migrations/YYYYMMDDHHMMSS_desc.sql`; never edit an applied migration. RLS uses `auth.uid()` only (never `user_metadata`). Apply via `pnpm db:migrate` (supabase db push) — but see STOP conditions re: prod.

## Commands

| Purpose                              | Command                          | Expected                             |
| ------------------------------------ | -------------------------------- | ------------------------------------ |
| Typecheck                            | `pnpm typecheck`                 | exit 0                               |
| Lint                                 | `pnpm lint --max-warnings 0`     | exit 0                               |
| Tests                                | `pnpm test src/services src/lib` | pass                                 |
| SQL migration test (if repo has one) | `pnpm test:db`                   | pass (only if configured; else skip) |

## Scope

**In scope**:

- new migration `supabase/migrations/<newTS>_qr_designs_rls_tighten.sql` (SEC-01)
- `src/app/actions/qr-design.ts` (rate limit + cap check + assign entitlement gate)
- `src/services/qr-design.service.ts` (per-tenant cap in `saveDesign`)
- `src/lib/validations/qr-design.schema.ts` (logo.src scheme refinement)
- a test pinning the trigger's entitled-plan set to `PLAN_LIMITS.canAccessQrCustomization` (SEC-04) — e.g. `src/lib/plans/__tests__/qr-entitlement-parity.test.ts`
- action/service tests

**Out of scope**: `src/lib/rate-limit.ts` (PROTECTED — reuse only), `src/lib/plans/features.ts` logic, the DB paywall migration `20260711080000` (already applied — do not edit; add a new migration if the trigger must change).

## Steps

### Step 1 (SEC-01): Tighten qr_designs write RLS

Add migration `<newTS>_qr_designs_rls_tighten.sql` that DROPs and recreates the INSERT/UPDATE/DELETE policies so the membership subquery also requires `is_active AND deleted_at IS NULL` (match the columns actually on `admin_users` — verify names in `20260704000000_qr_designs.sql` and the `admin_users` schema before writing). If the repo has an RLS helper for role/permission (grep migrations for `has_permission`/`settings.edit`), use it to also require the write role; if not, at minimum add the active-membership filter and leave a comment that permission enforcement stays app-layer (documented decision). Keep a rollback comment.
**Verify**: migration file parses; `pnpm test:db` if available, else static review. Do NOT push to prod here (see STOP).

### Step 2 (SEC-02): Rate-limit + per-tenant cap

In `qr-design.ts`, wrap `actionSaveQrDesign`/`actionDeleteQrDesign`/`actionAssignQrDesign` with an existing authenticated limiter from `src/lib/rate-limit.ts` (import; do not modify that file). In `qr-design.service.ts` `saveDesign`, before an INSERT (no `id`), count existing designs for the tenant and reject with a `ServiceError`/typed error once a cap (e.g. 50) is reached.
**Verify**: `pnpm test src/services` → add a test that the 51st create is rejected.

### Step 3 (SEC-03): Gate the assignment action by entitlement

In `actionAssignQrDesign`, add the same `canAccessFeature('canAccessQrCustomization', ...)` check used in `actionSaveQrDesign` (fetch tenant plan/status/trial the same way). Return the same Pro-only error when not entitled. (Product decision confirmed: hard-enforce, no grandfathering.)
**Verify**: `pnpm test src/services` (action-level test if present) → assign rejected when not entitled.

### Step 4 (SEC-04): Pin the entitlement rule across SQL and TS

Add `src/lib/plans/__tests__/qr-entitlement-parity.test.ts` asserting the set of plans that grant `PLAN_LIMITS.canAccessQrCustomization` equals `['pro','business','enterprise']` (the trigger's hardcoded list) AND that trial grants access — so if `features.ts` changes, this test fails and forces a matching new trigger migration. Include a comment linking the test to `20260711080000_qr_customization_db_paywall.sql`.
**Verify**: `pnpm test src/lib/plans` → pass.

### Step 5 (SEC-05): Validate logo.src scheme

In `qr-design.schema.ts`, refine `logo.src` to accept only safe schemes: `https:` URLs and `data:image/*` data URLs (the resize helper from plan 001 emits `data:image/png`). Reject `http:`/`blob:`/`javascript:`/arbitrary. Keep the size cap.
**Verify**: `pnpm test src/lib/validations` → add cases: a `data:image/png;base64,...` passes; a `javascript:...` string fails.

## Test plan

- Service: 51st-create rejection; assign-not-entitled rejection.
- Schema: logo.src scheme allow/deny cases.
- Plans parity: SQL list == TS matrix.
- Pattern: `src/services/__tests__/qr-design.service.test.ts`, `src/lib/validations/__tests__/qr-design.schema.test.ts`.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint --max-warnings 0` exit 0
- [ ] `pnpm test src/services src/lib` pass with new cases
- [ ] New migration file exists and is additive (does not edit `20260704000000` or `20260711080000`)
- [ ] `actionAssignQrDesign` calls `canAccessFeature` (grep confirms)
- [ ] `plans/README.md` row updated

## STOP conditions

- Excerpts don't match live code → STOP.
- **Do NOT run `pnpm db:migrate` / push the migration to production.** Prod migrations in this project are applied deliberately by the maintainer (often via Supabase MCP `apply_migration` after review). Leave the migration file for the maintainer to apply; note this in the PR.
- If tightening RLS would lock out a legitimate role (the `admin_users` role model is unclear) → STOP and report; do not guess the role matrix.
- If `is_active`/`deleted_at` columns don't exist on `admin_users` with those names → STOP and report.

## Maintenance notes

- The parity test (Step 4) is the guardrail against paywall drift; if a new plan tier gains QR customization, both `features.ts` AND a new trigger migration must change, and this test enforces it.
- Reviewer: confirm the new migration is additive and has a rollback comment; confirm no edit to the two existing QR migrations or to `rate-limit.ts`.
