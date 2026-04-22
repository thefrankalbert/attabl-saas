# Square-Inspired Design System Rules - ATTABL SaaS

## Contexte

ATTABL adopte depuis 2026-04-22 une direction visuelle alignee sur Square for
Restaurants : minimalisme, accent parcimonieux, typographie sobre. Cette regle
s'applique a TOUS les niveaux du SaaS (client tenant, admin dashboard,
marketing, auth, onboarding) pour toute modification future.

**Decision d'alignement total (2026-04-22)** : l'admin dashboard utilise le
meme accent `#2e7d32` que le client tenant. L'ancien lime `#c2f542` (dark) /
`#65a30d` (light) / `#CCFF00` (marketing) est ABANDONNE. Aucune exception.
Les chart palettes, icones brand, preset "ATTABL" de l'onboarding, theme-color
PWA, auth layouts, pricing cards et error pages utilisent tous `#2e7d32`.

Reference complete : `docs/design/DESIGN.md` + `docs/design/audits/square-gap-analysis.md` + `docs/design/audits/admin-onboarding-rule09-audit.md`.

## Palette - regle obligatoire

### Accent vert ATTABL
- **Primary light mode** : `#2e7d32` (Material green 800) - identite de marque, contraste 5.5:1 sur blanc.
- **Primary dark mode** : `#66bb6a` (Material green 400) - meme ramp, shade plus claire pour WCAG AA sur `#0a0a0a` (contraste 6:1). `#2e7d32` seul sur dark bg echoue AA normal text (4.2:1).
- **Primary hover (light)** : `#1b5e20` (green 900).
- **Primary hover (dark)** : `#4caf50` (green 500).
- **Primary tint selected** : `#e8f5e9` (light) / `rgba(102,187,106,0.14)` (dark).
- **Text on accent** : `#ffffff` en light, `#0a0a0a` en dark (pour contraste white-on-light vs black-on-light-green).
- Cette adaptation per-mode est cablee automatiquement via les vars CSS (`--app-accent` dans `:root` vs `.light`). Les composants utilisent `bg-accent`/`text-accent` et recoivent la bonne couleur sans connaitre le mode.
- **JAMAIS** utiliser `#06C167` (ancien vert UberEats tenant). Remplace partout.
- **JAMAIS** utiliser `#05A557` ou `#E6F9F0` (anciennes variantes tenant).
- **JAMAIS** utiliser `#c2f542` / `#CCFF00` / `#D1FF5C` (ancien lime admin dark).
- **JAMAIS** utiliser `#65a30d` / `#4d7c0f` / `#3f6212` (ancien olive admin light).
- **JAMAIS** utiliser `#b3e600` (ancien hover PricingCard).
- Ramp Material green autorisee : `#e8f5e9` / `#c8e6c9` / `#a5d6a7` / `#81c784` / `#66bb6a` / `#4caf50` / `#43a047` / `#388e3c` / `#2e7d32` / `#1b5e20` (50 a 900).

### Usage de l'accent - parcimonie Square
- **UNE seule zone verte par ecran** maximum. Choisir entre :
  - le CTA principal de l'action, OU
  - la cart bar flottante, OU
  - l'indicateur d'onglet actif (bottom nav), OU
  - un badge d'etat critique.
- **JAMAIS** trois elements verts simultanement sur le meme ecran.
- Pour les CTA secondaires : outline noir (`border border-[#1a1a1a]`) + texte noir, PAS de vert.
- Pour les add-buttons "+" sur les cartes d'item : fond noir `#1a1a1a` + texte blanc, PAS de vert (le vert est deja absorbe par la cart bar).

### Texte et surfaces (inchange)
- Texte primaire : `#1A1A1A` (near-black).
- Texte secondaire : `#737373`.
- Texte muted : `#B0B0B0`.
- Fond app : `#FFFFFF`.
- Fond secondaire : `#F6F6F6` (search, inputs, chips inactives).
- Divider : `#EEEEEE`.

## Border radius - scale Square

Scale stricte a 4 valeurs : **`[4, 6, 10, 50]`**.

| Composant | Radius | Tailwind |
|---|---|---|
| Button (tous CTA) | 6px | `rounded-md` |
| Menu item card / card generique | 10px | `rounded-[10px]` |
| Input / search bar | 10px | `rounded-[10px]` |
| Chip / pill / category filter | 50px full | `rounded-full` |
| Avatar / icon button round | 50px full | `rounded-full` |
| Small badge / allergen tag | 4px | `rounded` |

- **INTERDIT** : `rounded-xl` (12px), `rounded-2xl` (16px), `rounded-3xl` (24px) sur les nouveaux composants.
- **Exception** : les composants shadcn/ui dans `src/components/ui/` gardent leurs radii originaux (on ne les modifie pas).

## Typographie - weights simplifies

Famille : **Inter** uniquement (pas de Fraunces, pas de serif display).

Weights autorises : **`[400, 700]`** uniquement.
- `font-normal` (400) : body, descriptions, metadata, labels.
- `font-bold` (700) : titres, CTA, prix, elements forts.
- **INTERDIT** : `font-medium` (500), `font-semibold` (600) sur les nouveaux composants.
- **Exception** : les textes dans les composants shadcn/ui existants.

Scale mobile (garde ATTABL, contenue) : `11 / 12 / 13 / 14 / 15 / 16 / 20 / 26px`.
- Jamais sous `11px`.
- Line-height : toujours 1.4x (body) ou 1.2x (display).

## Elevation et ombres

- Cards : **border `1px solid #EEEEEE`**, JAMAIS de shadow.
- Floating elements (cart bar, modals) : shadow minimale, `0 4px 16px rgba(0,0,0,0.08)`.
- Pas de shadows empiles, pas de glows.

## Uppercase labels

- Usage **limite** aux micro-labels de section (ex: "POPULAR TONIGHT").
- **PAS** d'uppercase sur les noms de categories dans les cartes items (utiliser Bold 12px).
- Lettre-spacing pour uppercase : `tracking-[0.08em]` a `tracking-[0.18em]` selon contexte.

## Patterns Square obligatoires

- **Un seul CTA vert par ecran** (voir section palette).
- **Border-only cards** (pas de shadow sur les cartes statiques).
- **Minimal uppercase** (reserve aux kickers de section).
- **Icons lucide outline 1.7 stroke-width** (pas d'icons fills sauf active state).

## Patterns a NE PAS adopter de Square

- Fonts proprietaires Square (Cash Sans, Square Sans, Exact Block) : inaccessibles, rester sur Inter.
- Tailles extremes typo (8.5px - 90px) : ATTABL reste contenu 11-26px pour le commerce tactile mobile.
- Noir `#000000` pur : ATTABL utilise `#1A1A1A` (legerement adouci).
- Bleu `#006aff` (detecte par dembrandt mais artefact lien) : pas d'accent bleu dans ATTABL.

## Migration des anciens composants

Pour chaque composant legacy touche :
1. Verifier l'accent -> swap `#06C167` -> `#2e7d32`, `#05A557` -> `#1b5e20`, `#E6F9F0` -> `#e8f5e9`.
2. Radii : `rounded-xl` (12px) -> `rounded-[10px]` ou `rounded-md` (6px) selon contexte.
3. Weights : `font-semibold` -> `font-bold` (si titre/CTA) ou `font-normal` (si metadata).
4. Accent parcimonie : si le composant a plusieurs elements verts, en garder un maximum.

## Check list a integrer dans toute PR visuelle

- [ ] Aucun `#06C167` / `#06c167` dans le diff.
- [ ] Aucun nouveau `rounded-xl`, `rounded-2xl`, `rounded-3xl` hors shadcn/ui.
- [ ] Aucun nouveau `font-semibold` ou `font-medium` hors shadcn/ui.
- [ ] Maximum un element vert par ecran.
- [ ] Cards statiques utilisent border 1px `#EEEEEE`, pas de shadow.
- [ ] Radii respectent la scale `[4, 6, 10, 50]`.
- [ ] `pnpm rule09:check` passe (lance localement ou dans CI).

## Enforcement automatique

Script de verification : `scripts/check-rule09.sh` (alias `pnpm rule09:check`).
Integre dans `.github/workflows/ci.yml` comme Gate 4 du pipeline CI/CD (entre
`format:check` et `test`). Toute PR qui reintroduit une violation est bloquee.

## Dette technique admin/onboarding (2026-04-22)

Audit baseline dans `docs/design/audits/admin-onboarding-rule09-audit.md`.

Etat apres migration accent :
- [x] Accent `#c2f542`/`#65a30d`/`#CCFF00`/`#4d7c0f` -> `#2e7d32` (globals.css + 14 fichiers).
- [x] Onboarding `primaryColor` default + BrandingStep preset ATTABL.
- [x] Chart palette (DONUT_COLORS) alignee.
- [ ] `rounded-xl` (12px) : 120 occurrences sur 55+ fichiers admin. **A migrer** vers `rounded-[10px]` (cards) / `rounded-md` (buttons) / `rounded-full` (chips) progressivement.
- [ ] `font-medium` / `font-semibold` : 261 occurrences sur 63+ fichiers admin. **A migrer** vers `font-normal` (metadata) ou `font-bold` (titres/CTA) progressivement.

Strategie de migration :
1. **Nouveaux composants** : doivent respecter la regle 09 des le jour 1. Aucun `rounded-xl`/`font-semibold`/`font-medium` ne passe en revue de code.
2. **Modifications de composants existants** : si tu touches un fichier, applique la regle 09 sur les elements modifies (pas de migration complete obligatoire si hors scope).
3. **Sweeps dedies** : creer des PRs dediees qui ne font que migrer les radii/weights d'un ensemble de fichiers cibles (ex: "ReportsClient + ItemsClient Square alignment"). Documente le before/after visuel.

## Fichiers de reference

- `docs/design/DESIGN.md` - source de verite operationnelle.
- `docs/design/references/square.md` - tokens extraits de squareup.com.
- `docs/design/audits/square-gap-analysis.md` - analyse des gaps et justifications.
- `docs/design/audits/admin-onboarding-rule09-audit.md` - baseline admin/onboarding.
- `CLAUDE.md` - points vers cette regle pour toute modification UI.

## Reference depuis CLAUDE.md

CLAUDE.md racine renvoie vers ce fichier pour toute decision de charte. En cas de conflit entre cette regle et un ancien document (COMPARATIF-DESIGN-ATTABL-VS-SQUARE.md, DESIGN.md pre-2026-04-22, AUDIT-UI-*), CETTE regle prevaut.
