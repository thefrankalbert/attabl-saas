# Plan 006: Every customizer control has an effect; dead config fields are removed

> **Executor instructions**: Follow step by step; verify each. Honor STOP conditions. Update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a24fceea..HEAD -- src/types/qr-design.types.ts src/lib/validations/qr-design.schema.ts src/components/qr/templates src/components/qr/panels src/components/qr/ColorPicker.tsx src/components/onboarding/utils/qr-config-bridge.ts`
> On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 002 (ColorPicker external-sync only matters once designs can be loaded)
- **Category**: bug + tech-debt
- **Planned at**: commit `a24fceea`, 2026-07-11

## Why this matters

The panel shows controls that do nothing, and the config type carries fields no code reads. Users flip "Powered by Attabl" or change the accent color and nothing happens on 2 of 3 templates — which reads as "the whole panel is broken / didn't save". Separately, ~40 lines of type + Zod + factory exist for fields (`gradient`, `backgroundImage`, `descriptionText`, `footerText`, `shadow`, plus `SHADOW_CLASSES`/`FONT_OPTIONS`/`QRShadowIntensity`, and `QRLogoConfig.width/height/opacity/excavate`) that no template renders. Rule (`.claude/rules/*`): no dead code.

## Current state

- `src/components/qr/panels/QRContentControls.tsx:137-146` — `showPoweredBy` switch; only honored by `ChevaletTemplate.tsx:51`. `MinimalTemplate.tsx` / `CarteTemplate.tsx` never read `config.showPoweredBy`.
- `templateAccentColor` control `QRContentControls.tsx:52-56` — used by Carte (`CarteTemplate.tsx:31`) and Chevalet (`:31`), ignored by `MinimalTemplate.tsx`.
- Dead fields (no reads anywhere in `src/components/qr` / `src/lib/qr`): `config.gradient`, `config.backgroundImage`, `config.descriptionText`, `config.footerText`, `config.shadow`; dead exports `SHADOW_CLASSES` (`qr-design.types.ts:185`), `FONT_OPTIONS` (`:199`), `QRShadowIntensity` (`:20`). `QRLogoConfig` (`:75`) `width/height/opacity/excavate` set+validated but never rendered (`StyledQR.tsx:41` uses a hardcoded `logoSize = 0.22`).
- `src/components/qr/ColorPicker.tsx:55` — `const [hexInput, setHexInput] = useState(value);` never re-syncs when `value` changes externally (stale after a design is loaded — finding CORRECT-06).
- Config shape is duplicated in `qr-design.types.ts` (type + factory), `qr-design.schema.ts` (Zod), `qr-config-bridge.ts` (onboarding). Removing a field means editing all three.

## Commands

| Purpose   | Command                                      | Expected |
| --------- | -------------------------------------------- | -------- |
| Typecheck | `pnpm typecheck`                             | exit 0   |
| Lint      | `pnpm lint --max-warnings 0`                 | exit 0   |
| Tests     | `pnpm test src/lib/validations src/services` | pass     |
| Build     | `pnpm build`                                 | exit 0   |

## Scope

**In scope**: `src/types/qr-design.types.ts`, `src/lib/validations/qr-design.schema.ts`, `src/components/qr/templates/*`, `src/components/qr/panels/QRContentControls.tsx`, `src/components/qr/ColorPicker.tsx`, `src/hooks/useQRDesignConfig.ts` (Step 6 only — dead `resetConfig`), `src/components/onboarding/utils/qr-config-bridge.ts`, related tests.
**Out of scope**: export pipeline (003), the logo-save fix (001 — do not touch `logo.src` handling), paywall.

## Steps

### Step 1: Make `showPoweredBy` honored by all templates

Extract the "Powered by Attabl" footer into a shared piece (a small component or a shared render used by all three templates) gated on `config.showPoweredBy`, and render it in `MinimalTemplate`, `CarteTemplate`, `ChevaletTemplate`. (Contrast concerns are plan 009's UX-06; here just make the toggle functional everywhere.)
**Verify**: `grep -rln "showPoweredBy" src/components/qr/templates` → all 3 templates.

### Step 2: Decide accent color per template

Either make `MinimalTemplate` honor `templateAccentColor`, OR hide/disable the accent control when `MinimalTemplate` is selected (so no dead control). Prefer honoring it if the template has any accented element; otherwise conditionally render the control in `QRContentControls` based on `config.templateId`.
**Verify**: `pnpm lint --max-warnings 0` → exit 0.

### Step 3: Remove dead config fields end-to-end

Delete `gradient`, `backgroundImage`, `descriptionText`, `footerText`, `shadow` from `QRDesignConfig` (type), `createDefaultQRDesignConfig` (factory), and `qrDesignConfigSchema` (Zod), together. Delete the dead exports `SHADOW_CLASSES`, `FONT_OPTIONS`, `QRShadowIntensity` and the unused `QRLogoConfig` sub-fields `width/height/opacity/excavate` (keep `src`, `enabled`). Update `qr-config-bridge.ts` if it references any removed field. jsonb tolerates missing keys, so existing rows are fine.
**Verify**: `grep -rn "gradient\|backgroundImage\|descriptionText\|footerText\|SHADOW_CLASSES\|FONT_OPTIONS\|QRShadowIntensity" src/components/qr src/types/qr-design.types.ts src/lib/validations/qr-design.schema.ts` → no matches; `pnpm typecheck` → exit 0.

### Step 4: Fix ColorPicker external value sync

In `ColorPicker.tsx`, make the displayed hex derive from `value` when `value` changes externally (do not permanently mirror the prop into state — respect "don't mirror props in state"). A clean approach: keep transient in-progress typing in local state but reset it via a `useEffect(() => setHexInput(value), [value])`, or key the input on `value`. Ensure typing then blurring still commits via the existing handler.
**Verify**: `pnpm typecheck` → exit 0.

### Step 6: Wire or remove the dead `resetConfig`

`src/hooks/useQRDesignConfig.ts:80,84` defines and returns `resetConfig`, but grep shows no consumer (`grep -rn "resetConfig" src` → definition only) — dead code, violates the zero-dead-code rule. Decide: either wire a "Reinitialiser" `<Button>` in the customizer that calls `resetConfig` (with a confirm if a design is loaded), OR remove `resetConfig` from the hook's returned object and the `RESET` action if nothing else uses it. Prefer wiring a reset button (users expect it), unless it complicates plan 002's load flow — then remove.
**Verify**: `grep -rn "resetConfig" src` → either has a real consumer (button) or no matches at all.

### Step 7: Update tests for the trimmed shape

Adjust `src/lib/validations/__tests__/qr-design.schema.test.ts` and any service test that constructs a full config so they no longer set removed fields.
**Verify**: `pnpm test src/lib/validations src/services` → all pass.

## Test plan

- Update existing schema/service tests to the trimmed config.
- Optionally add a test asserting `createDefaultQRDesignConfig` no longer contains the removed keys.
- Verify: `pnpm test src/lib/validations src/services` → pass.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint --max-warnings 0`, `pnpm build` exit 0
- [ ] `pnpm test src/lib/validations src/services` pass
- [ ] All 3 templates read `showPoweredBy`; no dead accent control
- [ ] Removed-field grep (Step 3) returns nothing
- [ ] `resetConfig` is either wired to a UI control or fully removed (`grep -rn "resetConfig" src`)
- [ ] `plans/README.md` row updated

## STOP conditions

- Excerpts don't match live code → STOP.
- A removed field turns out to be read somewhere the audit missed (grep finds a live reader) → keep it, wire a control instead, note it.
- Removing `FONT_OPTIONS` breaks a font selector that exists elsewhere → STOP and report.

## Maintenance notes

- Consider deriving `QRDesignConfig` from the Zod schema (`z.infer`) to kill the 3-way duplication (finding DUP-04) — deferred to plan 010 to keep this plan low-risk.
- Reviewer: toggle "Powered by" on each template and confirm it shows/hides.
