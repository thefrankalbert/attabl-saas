# Gap analysis - ATTABL DESIGN.md vs Square (squareup.com/us/en/restaurants)

Generated: 2026-04-22
Sources:
- `docs/design/DESIGN.md` (ATTABL, 408 lignes, UberEats-inspired)
- `docs/design/references/square.md` (Square, extraction dembrandt v0.11.0, 29 lignes)
ATTABL accent retained: `#2e7d32` (Material green 800) - remplace `#06C167` UberEats bright.

---

## 1. Palette

| Axe | ATTABL actuel | Square | Gap / Recommandation |
|---|---|---|---|
| Accent primaire | `#06C167` vert UberEats vif | `#000000` noir pur | **Adopter l'idee Square** : accent sobre et rare. Garder identite verte via `#2e7d32` (dark green), mais reserver aux CTA critiques uniquement. Une action principale par ecran. |
| CTA fill | Vert `#06C167` fond | Noir `#000000` fond | **Hybride** : CTA principal = `#2e7d32` fond + texte blanc. CTA secondaire = outline noir `#1a1a1a` + texte noir (pattern Square). |
| Texte principal | `#1A1A1A` (near-black) | `#006aff` declare comme "On-surface" mais c'est un artefact d'extraction (liens) | **Rester sur ATTABL** : `#1A1A1A` est le bon. Square pousse `#000000` en fill, texte reste near-black. |
| Backgrounds | `#FFFFFF` + `#F6F6F6` | `#FFFFFF` + `#bbbbbb` (Square pousse les gris clairs) | **Rester sur ATTABL** : `#F6F6F6` est plus doux que le `#bbbbbb` de Square qui est trop sombre pour un fond. |
| Rouge promo | `#FF3008` (UberEats red) | Non documente | **Garder** : ATTABL a raison de garder un rouge promo distinct. |
| Rating | `#FFB800` ambre | Non documente | **Garder** : standard pour etoiles. |

**Action** : remplacer partout `#06C167` -> `#2e7d32` dans le code refonte + garder un seul vert (`#2e7d32` comme unique accent). `#05A557` (hover) devient `#1b5e20`. `#E6F9F0` (tint light) devient `rgba(46,125,50,0.08)` ou `#e8f5e9`.

---

## 2. Typographie

| Axe | ATTABL | Square | Gap |
|---|---|---|---|
| Famille primaire | Inter (polyvalent gratuit) | Square Sans / Cash Sans (proprietaire) | **Rester sur Inter**. Pas d'acces aux fonts Square. |
| Display | Inter Bold 26px | Exact Block 40-90px (display serif heavy) | **Envisageable** : ajouter un display serif variable (Fraunces ou Playfair) pour les hero H1 uniquement, OU rester en Inter Bold avec tracking serre. |
| Scale | 11 / 13 / 14 / 15 / 16 / 20 / 26 | 8.5 / 10 / 12 / 14 / 24 / 40-90 | **Gap** : Square utilise des tailles plus extremes (tres petits labels 8.5px, tres grands titres 40px+). ATTABL reste volontairement contenu. Garder l'echelle ATTABL (11-26) plus approprie pour un usage commande tactile. |
| Weights | 400/500/600/700 | Varies - souvent "regular" + "bold" extremes | **Adopter Square** : simplifier a 400 (regular) + 700 (bold), abandonner les intermediaires 500/600 sauf exception. |
| UPPERCASE labels | Oui, Label 11px +letter-spacing 1px | Square utilise moins d'uppercase, plus de Bold inline | **Envisageable** : remplacer certains UPPERCASE labels par Bold 12px, plus moderne. |

**Action** : reduire la palette de weights a [400, 700]. Les `font-semibold` (600) actuels deviennent `font-bold` (700) ou `font-normal` (400) selon contexte. Les UPPERCASE labels uppercase peuvent rester mais reduits.

---

## 3. Border radius

| Composant | ATTABL | Square | Recommandation |
|---|---|---|---|
| Scale declaree | 0 / 8 / 10 / 12 / 16 / 24 / 50 | 4 / 6 / 10 / 50 | **Simplifier vers Square** : 4 / 6 / 10 / 50 (scale plus courte, plus stricte). |
| Button | 12px (CTA) / 8px (small) | 6px partout | **Adopter Square** : passer les boutons a 6px (plus sobre, moins "chunky"). |
| Card | 12px | 10px | **Legere baisse** : cartes en 10px au lieu de 12px. |
| Pill / chip | 24px | 50px (quasi-round) | **Adopter Square** : chips en 50px (pill complete). Plus distinctif. |
| Input | 10px | 10px | **Identique** - garder. |
| Bottom sheet | 16px top-only | Non documente | **Garder** ATTABL. |
| Icon button | 50px (round) | 50px | **Identique** - garder. |

**Action** : adopter la scale Square `[4, 6, 10, 50]`. Boutons 12px -> 6px, cards 12px -> 10px, chips 24px -> 50px.

---

## 4. Elevation / Shadows

| Axe | ATTABL | Square | Recommandation |
|---|---|---|---|
| Cartes | `border 1px #EEEEEE`, pas d'ombre | Box-shadows pour profondeur | **Hybride** : garder border ATTABL (plus flat, plus Square 2024), ajouter une ombre tres legere sur les cartes flottantes uniquement (cart bar, bottom sheets). |
| Floating cart | shadow offset 0,4 opacity 0.15 radius 12 | Non documente | **Garder** ATTABL. |
| Modal | shadow offset 0,-2 opacity 0.08 radius 16 | Non documente | **Garder** ATTABL. |

**Action** : pas de changement critique. Le parti-pris "border-only pour cards" est plus moderne que les shadows de Square.

---

## 5. Spacing

| Axe | ATTABL | Square | Recommandation |
|---|---|---|---|
| Base unit | 4px | Non explicite, mais 8px grid typique Square dashboards | **Garder** 4px ATTABL (plus souple sur mobile). |
| Padding ecran | 16px horizontal **toujours** | Non documente | **Garder** : regle forte. |
| Section gap | 20-32px | Non documente | **Garder**. |

**Action** : pas de changement. Le systeme ATTABL est plus explicite que ce que dembrandt a extrait de Square.

---

## 6. Components - gaps cles

### Components deja alignes
- Search bar (48px h, radius 10px, bg gris clair) : similaire Square.
- Input (10px radius, pas de border visible) : identique Square.

### Components a faire evoluer vers Square
1. **Buttons** : passer radius 12 -> 6. Style Square = sobre, noir uni ou outline noir. Garder `#2e7d32` pour le primary, mais radius 6.
2. **Menu item card** : radius 12 -> 10. Reduire la force de la "+" button verte (actuellement tres visible) -> noir `#1a1a1a` avec `+` blanc, plus Square.
3. **Floating cart bar** : garder fond `#1A1A1A` (deja Square-aligne) mais radius 12 -> 10.
4. **Promo banner** : radius 12 -> 10.
5. **Category pill chips** : radius 24 -> 50 (full pill, plus Square).

### Components a abandonner si on pousse Square
- **UPPERCASE labels 11px partout** : Square utilise moins d'uppercase. Reserver aux micro-labels de section, pas aux categories.
- **Add button vert sur carte** : Square Restaurants n'a pas ce pattern - l'add se fait dans le sheet detail. Mais c'est un pattern UberEats eprouve pour la rapidite de commande - **garder** si conversion est prioritaire.

---

## 7. Do's / Don'ts - comparaison

| Square (nouveau) | ATTABL actuel | Conflit ? |
|---|---|---|
| Do use rounded corners consistently | Idem (regle ATTABL) | Aligne. |
| Do use primary color sparingly - only most important action per screen | ATTABL : "Primary green only for active states, add buttons, cart, active tab" - deja applique mais parfois trop (add button dupique cart icon qui est deja vert) | **Resserrer** : un seul CTA vert par ecran. Les "+" add buttons passent en noir. |
| Do maintain 4.5:1 contrast WCAG AA | ATTABL : minimum WCAG AA | Aligne. |

---

## 8. Patterns Square a adopter (recommandations finales)

Par ordre d'impact :

### PRIORITE 1 - palette accent
- Remplacer `#06C167` (bright green) -> `#2e7d32` (Material green-800) partout dans le code refonte client.
- Hover : `#05A557` -> `#1b5e20`.
- Tint (selected/light) : `#E6F9F0` -> `rgba(46,125,50,0.08)`.
- Justification : `#2e7d32` est aussi reconnaissable comme vert mais plus sobre, mieux aligne avec l'esprit minimaliste Square.

### PRIORITE 2 - radius scale
- Passer de `[8, 10, 12, 16, 24, 50]` a `[4, 6, 10, 50]`.
- Boutons : 6px (au lieu de 12).
- Cards menu : 10px (au lieu de 12).
- Chips : 50px full pill (au lieu de 24).

### PRIORITE 3 - accent parcimonieux
- Un seul element vert par ecran : soit le CTA principal, soit la cart bar, pas les deux.
- Les "+" add buttons sur les cartes menu passent en fond noir `#1a1a1a` + `+` blanc (style Square).
- La cart bar dark `#1A1A1A` reste noire (deja Square-aligne).
- L'indicateur d'onglet actif bottom nav reste vert (signal d'etat).

### PRIORITE 4 - weights simplifies
- Reduire les weights utilises a `[400, 700]`.
- Les `font-semibold` (600) deviennent `font-bold` (700) ou `font-normal` (400).

### PRIORITE 5 - display font optionnelle
- Envisager un serif display (Playfair Display existe deja dans next/font) pour les H1 hero uniquement.
- **Ne pas l'imposer** : risque de casser le look "delivery app" UberEats-like qui marche. Decision visuelle a valider avec un mock cote a cote.

### A NE PAS ADOPTER de Square
- Le `#006aff` bleu Square (lien) : reste dans le palette dembrandt, mais n'est pas un vrai accent Square Restaurants. ATTABL n'a pas besoin d'un bleu.
- Les fonts proprietaires Square Sans / Cash Sans / Exact Block : proprietaires, inaccessibles. Inter reste le bon choix.
- Scale typo extreme (8.5px - 90px) : ATTABL commande tactile, rester contenue (11-26px).

---

## 9. Check list d'implementation

- [ ] Remplacer `#06C167`/`#05A557`/`#E6F9F0` par `#2e7d32`/`#1b5e20`/`rgba(46,125,50,0.08)` dans :
  - `src/app/globals.css` (tokens `.tenant-client`, `.tenant-client-refonte`, `@theme`)
  - Eventuels hex en dur dans les composants (grep `#06C167`)
- [ ] Mettre a jour `docs/design/DESIGN.md` : Primary `#2e7d32` au lieu de `#06C167`.
- [ ] Passer button radius global `rounded-xl` (12) -> `rounded-md` (6).
- [ ] Passer card radius `rounded-xl` (12) -> `rounded-[10px]`.
- [ ] Passer chip radius `rounded-2xl` (16) ou `rounded-3xl` (24) -> `rounded-full`.
- [ ] Reduire l'usage de `font-semibold` -> `font-bold` (la ou c'est un titre/CTA) ou `font-normal` (la ou c'est metadata).
- [ ] Verifier que chaque ecran a **un** CTA vert maximum (cart bar OU add button, pas les deux en meme temps).
- [ ] Convertir le bouton "+" sur les menu item cards en fond noir `#1a1a1a` avec `+` blanc.
- [ ] Garder la cart bar en `#1A1A1A` (deja OK).
- [ ] Garder l'indicateur d'onglet actif en `#2e7d32`.
