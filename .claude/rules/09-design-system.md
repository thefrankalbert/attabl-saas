---
paths:
  - "src/components/**/*.tsx"
  - "src/app/**/*.tsx"
  - "src/app/globals.css"
---

# Design System Rules - ATTABL SaaS

## Source de verite

ATTABL utilise le **Square Design System** comme reference visuelle.
Tokens implementes dans `src/app/globals.css` — ce fichier fait foi.

## Identite visuelle

| Dimension        | Valeur                              |
| ---------------- | ----------------------------------- |
| Mode par defaut  | **Light-first** (`#ffffff`)         |
| Couleur primaire | Square Blue `#006AFF`               |
| Hover primaire   | `#0055CC`                           |
| Radius boutons   | `rounded` = 4px                     |
| Radius cards     | `rounded-lg` = 8px                  |
| Radius modales   | `rounded-xl` = 12px                 |
| Typographie      | Square Sans VF -> fallback Plus Jakarta Sans |
| Surfaces         | `#F7F6F5` (elevated), `#ffffff` (bg/card) |
| Borders          | `#D9D9D9`                           |
| Shadows          | `rgba(0,0,0,0.08)` — jamais colorees |

## Tokens CSS (`src/app/globals.css`)

### Mode clair (defaut - `:root`)

```css
--app-bg:              #ffffff;
--app-card:            #ffffff;
--app-elevated:        #f7f6f5;    /* Square secondary surface */
--app-hover:           #f0efed;

--app-border:          #d9d9d9;    /* Square border */
--app-border-hover:    #bdbdbd;

--app-text:            #1a1a1a;    /* Square foreground */
--app-text-secondary:  #666666;   /* Square muted foreground */
--app-text-muted:      #999999;

--app-accent:          #006aff;   /* Square Blue */
--app-accent-hover:    #0055cc;
--app-accent-muted:    rgba(0, 106, 255, 0.12);
--app-accent-text:     #ffffff;
```

### Mode sombre (classe `.dark` sur `<html>`)

Surfaces sombres ATTABL — activees uniquement si classe `.dark` presente.

## Radius — regle stricte

| Element                  | Classe         | Valeur |
| ------------------------ | -------------- | ------ |
| Boutons, inputs, badges  | `rounded`      | 4px    |
| Cards, panels            | `rounded-lg`   | 8px    |
| Modales, sheets          | `rounded-xl`   | 12px   |

INTERDIT : `rounded-xl` sur des boutons ou inputs.
INTERDIT : `rounded-2xl` sauf cas documentes (onboarding hero cards).
INTERDIT : `rounded-full` sur des boutons rectangulaires.

## Shadows Square

```css
--shadow-card:     0 2px 8px rgba(0, 0, 0, 0.08);
--shadow-dropdown: 0 4px 16px rgba(0, 0, 0, 0.12);
--shadow-modal:    0 8px 32px rgba(0, 0, 0, 0.16);
```

INTERDIT : shadows colorees (bleu, vert). Uniquement `rgba(0,0,0,x)`.

## Hover boutons (pattern Square)

Square utilise un `bg-primary/90` pour hover (Tailwind opacity modifier).
Pas de `::before` overlay — trop complexe pour shadcn.

## Regles anti-pattern

### INTERDIT

- `rounded-xl` sur boutons ou inputs (Square = 4px)
- Fond sombre par defaut (ATTABL est light-first Square)
- Shadows colorees
- Hardcoder `#006AFF` — utiliser `bg-accent` / `text-accent`
- `rounded-full` sur boutons rectangulaires

### OBLIGATOIRE

- Couleurs via `bg-app-*`, `text-app-*`, `border-app-*`
- Accent via `bg-accent`, `text-accent`, `border-accent`
- Radius : `rounded` boutons, `rounded-lg` cards, `rounded-xl` modales
- Touch targets : `min-h-[44px]` sur tout element interactif

## Interaction shadcn/ui

Les composants `src/components/ui/` ne sont jamais modifies directement.
Overrides via `className` ou wrappers dans `src/components/shared/`.

## Note historique

Une version anterieure de cette regle (session avant 2026-05-04) documentait
un design system "ATTABL dark-first lime" (#c2f542). Ce systeme etait incorrect.
Le projet a toujours vise Square Blue light-first. Cette regle remplace definitivement
la precedente.
