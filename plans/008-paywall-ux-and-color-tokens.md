# Plan 008: The paywall is clear and actionable; admin color rules are respected

> **Executor instructions**: Follow step by step; verify each. Honor STOP conditions. Update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a24fceea..HEAD -- src/components/qr/FeatureGate.tsx src/components/qr/QRExportBar.tsx`
> On mismatch, STOP.
>
> **Visual change** — verify rendered (light + dark) per rule `11-deploy-visual-safety.md`.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UX) + tech-debt (design system)
- **Planned at**: commit `a24fceea`, 2026-07-11

## Why this matters

Locked PNG/SVG export shows a dimmed control with a tiny "Pro"/"Enterprise" pill and a lock icon — no explanation of what is locked, no upgrade path, and the badge is not clickable. Users on lower plans hit a confusing dead zone and the upsell is lost. The badge also uses raw Tailwind palette classes (`bg-purple-100/80 text-purple-700`, `bg-amber-100/80 text-amber-700`) instead of the admin design-system tokens the repo mandates (rule `09-admin-color-system.md`: status/accent via semantic tokens, not raw palette).

## Current state

- `src/components/qr/FeatureGate.tsx:35-47` — dims children, shows a corner badge (icon + "Pro"/"Enterprise"); no explanation, no link, badge not interactive. Colors: `:37` `bg-purple-100/80 text-purple-700`, `:42` `bg-amber-100/80 text-amber-700`.
- `src/components/qr/QRExportBar.tsx:163,180` — wraps PNG/SVG buttons in `FeatureGate`.
- Admin color tokens exist (e.g. `text-status-info`, `bg-status-warning-bg`, `text-status-warning`); see `.claude/rules/09-admin-color-system.md`. Blue accent in admin = `status-info`/`primary` tokens.
- The plans/upgrade page path: grep for an existing link target used elsewhere (e.g. a subscription page under `/sites/[site]/admin/subscription` — verify the exact route before linking).

## Commands

| Purpose   | Command                      | Expected                                  |
| --------- | ---------------------------- | ----------------------------------------- |
| Typecheck | `pnpm typecheck`             | exit 0                                    |
| Lint      | `pnpm lint --max-warnings 0` | exit 0 (admin color ESLint guard is here) |
| Build     | `pnpm build`                 | exit 0                                    |

## Scope

**In scope**: `src/components/qr/FeatureGate.tsx`; minor copy in `QRExportBar.tsx` if needed.
**Out of scope**: the entitlement logic (plan 007), other admin surfaces.

## Steps

### Step 1: Make the lock explanatory + actionable

In `FeatureGate.tsx`, when locked, render a clear message naming what's locked and the plan needed, plus a link to the upgrade/subscription page (use the repo's `Link` and the verified subscription route). One concrete line, ATTABL voice, ASCII, e.g. "PNG et SVG a partir du plan Pro" + a "Voir les plans" link. Keep it accessible: the interactive element is a real `<Link>`/`<Button>` with an accessible name; the badge gets an `aria-label`. Prefer a tooltip or inline callout over a mute pill.
**Verify**: `pnpm lint --max-warnings 0` → exit 0.

### Step 2: Replace raw palette colors with tokens

Swap `bg-purple-100/80 text-purple-700` and `bg-amber-100/80 text-amber-700` for semantic tokens (e.g. info/warning tokens: `bg-status-info-bg text-status-info`, `bg-status-warning-bg text-status-warning` — confirm exact token names in `globals.css`/the color rule). No raw `purple-*`/`amber-*` left.
**Verify**: `grep -rn "purple-\|amber-" src/components/qr/FeatureGate.tsx` → no matches; `pnpm lint --max-warnings 0` → exit 0.

### Step 3: Resolve the illusory PNG/SVG paywall (product decision)

The PNG and SVG export buttons are wrapped in `FeatureGate` (locked for non-entitled plans), but the **PDF** button (`QRExportBar.tsx:153`, "always available") calls `captureElementToCanvas` on the _same_ styled DOM — so a non-entitled tenant already gets the full customized design as a PDF for free. Gating PNG/SVG protects nothing (same pixels). This needs a product decision:

- **Option A** (recommended if custom export is meant to be paid): gate ALL customized exports (PDF too) behind `canAccessQrCustomization` — non-entitled tenants export only a plain/unstyled QR.
- **Option B**: remove the PNG/SVG gate entirely (custom export is free; the paywall stays only on _saving/assigning_ designs, enforced server-side per plan 007).
  Do NOT guess. If the operator has not specified which, STOP and ask; implement the chosen option consistently (client gate + note that pure-client export cannot be truly enforced server-side — the real server-side boundary is save/assign in plan 007).
  **Verify**: after the decision, `grep -n "FeatureGate" src/components/qr/QRExportBar.tsx` reflects it consistently (all custom exports gated, or none).

### Step 4: Visual check

`pnpm build && pnpm start`; view the export bar with a locked plan (or temporarily force the gate) at desktop + mobile, light + dark. Confirm the lock reads clearly, the upgrade link works, and colors match the admin system.
**Verify**: observed and recorded.

## Test plan

- No unit test (presentational). Verification = grep (no raw palette) + lint + visual check.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint --max-warnings 0`, `pnpm build` exit 0
- [ ] `grep -rn "purple-\|amber-" src/components/qr/FeatureGate.tsx` → no matches
- [ ] Locked state shows a message + working upgrade link with an accessible name
- [ ] PNG/SVG vs PDF gating is consistent per the chosen option (Step 3)
- [ ] Visual check done (light+dark) and recorded
- [ ] `plans/README.md` row updated

## STOP conditions

- Excerpts don't match live code → STOP.
- No subscription/upgrade route exists to link to → STOP and ask for the target (do not invent a URL).
- The token names guessed don't exist → grep `globals.css` for the real ones; if unclear, STOP.

## Maintenance notes

- Reviewer: confirm dark mode renders the tokens correctly and the link routes to the real plans page.
