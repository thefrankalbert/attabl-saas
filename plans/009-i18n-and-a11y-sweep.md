# Plan 009: QR customizer is fully translated and accessible

> **Executor instructions**: Follow step by step; verify each. Honor STOP conditions. Update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a24fceea..HEAD -- src/components/qr src/types/qr-design.types.ts src/messages`
> On mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: 006 (template strings may move when dead fields are removed)
- **Category**: bug (i18n/a11y)
- **Planned at**: commit `a24fceea`, 2026-07-11

## Why this matters

Parts of the customizer are hardcoded French and never translate for `en-US` users, and several controls have no accessible name (screen readers announce "combobox" with no label; identical unnamed selects in the assignment panel are indistinguishable by voice). Repo rules require i18n for all UI text and associated labels for inputs.

## Current state

- Hardcoded FR strings (no `useTranslations`):
  - `src/components/qr/QRExportBar.tsx:159,160,176,193,205` — `'Export...'`, `'Télécharger PDF'`, `'PNG'`, `'SVG (QR seul)'`, `'Imprimer'`.
  - `src/types/qr-design.types.ts:149-168` — `TEMPLATE_DEFAULTS` names/descriptions (`'Minimal'`, `'Le QR seul, epure'`, `'Carte bordee'`, ...), rendered by `src/components/qr/panels/QRTemplatePicker.tsx:38-39`.
  - `src/components/qr/ColorPicker.tsx:102,116,131` — `aria-label` in hardcoded FR.
- Missing accessible names:
  - `src/components/qr/panels/QRStyleControls.tsx:37-52,55-72,88-104` — `<Label>` without `htmlFor`, `SelectTrigger` without `id`.
  - `src/components/qr/panels/QRContentControls.tsx:104-125` — CTA select same issue.
  - `src/components/qr/QRAssignmentPanel.tsx:207-224,249-265` — per-zone/per-table selects with no name distinguishing which zone/table.
- i18n system: `next-intl`; message files `src/messages/fr-FR.json` and `src/messages/en-US.json`; existing QR keys under a `qrCodes` namespace (tabs at `fr-FR.json:3051-3054`). Components read via `useTranslations('qrCodes')` (see other QR components). ASCII-only rule applies to message values.

## Commands

| Purpose   | Command                      | Expected |
| --------- | ---------------------------- | -------- |
| Typecheck | `pnpm typecheck`             | exit 0   |
| Lint      | `pnpm lint --max-warnings 0` | exit 0   |
| Tests     | `pnpm test`                  | pass     |
| Build     | `pnpm build`                 | exit 0   |

## Scope

**In scope**: `src/components/qr/QRExportBar.tsx`, `QRTemplatePicker.tsx`, `ColorPicker.tsx`, `panels/QRStyleControls.tsx`, `panels/QRContentControls.tsx`, `QRAssignmentPanel.tsx`, `src/messages/fr-FR.json`, `src/messages/en-US.json`, and `src/types/qr-design.types.ts` (move template display strings out to keys).
**Out of scope**: functional export logic, security.

## Steps

### Step 1: Move QRExportBar strings to i18n

Add keys under `qrCodes` in both `fr-FR.json` and `en-US.json` (keep JSON key order/format; ASCII values), and read them via `useTranslations` in `QRExportBar.tsx`. Add `en-US` equivalents ("Download PDF", "Print", etc.).
**Verify**: `grep -n "'Télécharger PDF'\|'Imprimer'" src/components/qr/QRExportBar.tsx` → no matches.

### Step 2: Template names/descriptions -> i18n keys

Replace the FR literals in `TEMPLATE_DEFAULTS` with stable ids only; store display name/description as i18n keys (e.g. `qrCodes.templates.minimal.name`) and resolve them in `QRTemplatePicker.tsx`. Add both locales.
**Verify**: `grep -n "Carte bordee\|Le QR seul" src/types/qr-design.types.ts` → no matches.

### Step 3: Associate labels + accessible names on selects

For each `Select` in `QRStyleControls.tsx`, `QRContentControls.tsx`, `QRAssignmentPanel.tsx`: give `SelectTrigger` an `id` and its `<Label>` a matching `htmlFor` (or `aria-label`/`aria-labelledby`). For assignment selects, include the zone/table name in the accessible name (e.g. `aria-label={t('assignFor', { name: zone.name })}`).
**Verify**: `pnpm lint --max-warnings 0` → exit 0.

### Step 4: Localize ColorPicker aria-labels + expose selected preset

In `ColorPicker.tsx`, move the three `aria-label`s to i18n, and add `aria-pressed` (or a radio-group role) to preset swatch buttons so the active preset is announced.
**Verify**: `grep -n "aria-label=\"Sélecteur\|aria-label={\`Couleur" src/components/qr/ColorPicker.tsx` → no hardcoded FR aria-labels.

## Test plan

- No new unit tests required. If the repo has an i18n key-parity test (grep `messages` tests), ensure new keys exist in both locales so it passes.
- Verify: `pnpm test` → pass; `pnpm build` → exit 0.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint --max-warnings 0`, `pnpm test`, `pnpm build` all pass
- [ ] No hardcoded FR UI strings/aria-labels remain in the in-scope files (greps above return nothing)
- [ ] New keys present in BOTH `fr-FR.json` and `en-US.json`
- [ ] `plans/README.md` row updated

## STOP conditions

- Excerpts don't match live code → STOP.
- Adding keys breaks an i18n-parity test because a locale is missing an entry → add the missing entry; if the parity mechanism is unclear, STOP.

## Maintenance notes

- Keep template ids stable (they're persisted in `config.templateId`); only the display strings are localized.
- Reviewer: switch app locale to en-US and confirm the export bar, template picker, and color picker are all English.
