# Design System Rules - ATTABL SaaS

## Source de vérité

DESIGN.md à la racine du projet encode le design system Square (extrait CSS réel de squareup.com, fetched 2026-04-13).
PRODUCT.md encode la stratégie produit, la marque, et les anti-références ATTABL.

REGLE : tout travail frontend doit respecter ces deux fichiers. Aucune décision visuelle arbitraire.

## Tokens Square → shadcn/ui

Les tokens Square sont mappés sur les variables CSS shadcn dans `src/app/globals.css`. Les composants shadcn héritent automatiquement. Ne jamais hardcoder une couleur Square directement dans un composant.

### Mapping obligatoire

```css
@layer base {
  :root {
    /* Backgrounds */
    --background:             255 255 255;   /* #FFFFFF — surface principale */
    --foreground:             26 26 26;      /* #1A1A1A — texte principal */

    /* Primary = Square Blue */
    --primary:                0 106 255;     /* #006AFF */
    --primary-foreground:     255 255 255;

    /* Secondary / Accent surface */
    --secondary:              247 246 245;   /* #F7F6F5 */
    --secondary-foreground:   26 26 26;

    /* Muted */
    --muted:                  247 246 245;   /* #F7F6F5 */
    --muted-foreground:       102 102 102;   /* #666666 */

    /* Borders & inputs */
    --border:                 217 217 217;   /* #D9D9D9 */
    --input:                  217 217 217;
    --ring:                   0 106 255;     /* focus ring Square blue */

    /* Radius — Square différencie boutons vs cards */
    --radius:                 0.25rem;       /* 4px — boutons, inputs, badges */
    --radius-card:            0.5rem;        /* 8px — cards standard */
    --radius-card-lg:         0.75rem;       /* 12px — modales, panels */
  }
}
```

### Couleurs sémantiques Square

| Rôle | Token | Valeur |
|------|-------|--------|
| CTA primary | `--primary` | `#006AFF` |
| CTA hover/focus | `--primary-hover` | `#0055CC` |
| Texte principal | `--foreground` | `#1A1A1A` |
| Texte secondaire | `--muted-foreground` | `#666666` |
| Surface accent | `--secondary` | `#F7F6F5` |
| Bordures | `--border` | `#D9D9D9` |
| Focus ring | `--ring` | `#006AFF` |

## Radius — règle stricte

Square utilise deux niveaux de radius — ne jamais les inverser ni les unifier.

| Élément | Variable | Valeur |
|---------|----------|--------|
| Boutons, inputs, badges | `--radius` | `4px` |
| Cards standard | `--radius-card` | `8px` |
| Modales, panels larges | `--radius-card-lg` | `12px` |
| Jump links (a11y) | `5px` | hardcodé ok |

INTERDIT : `rounded-full`, `rounded-2xl`, pill `999px` sur boutons ou cards — Square est sharp, pas arrondi.

## Hover overlay bouton (pattern Square)

Square utilise un overlay `::before` opacity pour le hover plutôt qu'un changement de background. Appliquer sur tous les boutons primary.

```css
/* globals.css */
.btn-square {
  position: relative;
  overflow: hidden;
}
.btn-square::before {
  content: "";
  position: absolute;
  inset: 0;
  background: #0055CC;
  opacity: 0;
  transition: opacity 150ms ease;
  pointer-events: none;
}
.btn-square:hover::before,
.btn-square:focus-visible::before {
  opacity: 1;
}
```

Usage dans les composants :
```tsx
<Button className="btn-square">Get started</Button>
```

## Typographie Square

Polices propriétaires — utiliser les fallbacks open-source.

```css
--font-display: "Square Sans Display VF", "Plus Jakarta Sans", Helvetica, Arial, sans-serif;
--font-sans:    "Square Sans Text VF", "Inter", "DM Sans", Helvetica, Arial, sans-serif;
--font-mono:    "Square Sans Mono", "SF Mono", Menlo, monospace;
```

| Rôle | Taille | Weight | Tracking |
|------|--------|--------|----------|
| Hero | clamp(40px, 6vw, 72px) | 700 | -0.03em |
| Section heading | 28-40px | 600-700 | -0.02em |
| Card title | 16-20px | 600 | -0.01em |
| Body | 14-16px | 400 | 0 |
| Button | 15-16px | 600 | 0 |
| Caption | 12px | 400 | 0 |

## Shadows Square

```css
--shadow-card:    0 2px 8px rgba(0, 0, 0, 0.08);
--shadow-dropdown: 0 4px 16px rgba(0, 0, 0, 0.12);
--shadow-modal:   0 8px 32px rgba(0, 0, 0, 0.16);
```

INTERDIT : shadows bleues ou colorées — Square utilise uniquement `rgba(0,0,0,x)` neutre.

## Motion Square

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Hover bouton | 150ms | ease |
| Nav toggle | 200ms | ease-out |
| Card hover | 180ms | ease |
| Modal open | 250ms | ease-out |

## Règles anti-pattern

### INTERDIT dans tout le codebase

- Hardcoder `#006AFF` directement — utiliser `hsl(var(--primary))`
- `border-radius: 999px` sur boutons ou inputs — Square = 4px
- `border-radius` > 12px sur cards — Square = 8-12px max
- Utiliser `Cash Sans` comme font UI — Cash App only, jamais ATTABL
- Fond sombre par défaut — Square est light-first
- Gradients décoratifs — Square = surfaces solides uniquement
- Shadows colorées ou bleues — uniquement `rgba(0,0,0,x)`

### OBLIGATOIRE

- Tout token couleur via variable CSS `hsl(var(--primary))`, jamais valeur brute
- Cards : `rounded-[var(--radius-card)]` explicite
- Boutons primary : classe `btn-square` pour overlay hover
- Focus ring : visible, couleur `--ring` (#006AFF)
- Inputs : `border-radius: var(--radius)` (4px), jamais pill

## Interaction avec shadcn/ui

Les composants `src/components/ui/` NE SONT JAMAIS MODIFIES. Le design Square s'applique exclusivement via :
1. Variables CSS dans `globals.css`
2. Classes utilitaires Tailwind sur les wrappers
3. Classe `btn-square` pour le pattern hover

Si un composant shadcn résiste au token (ex: radius forcé), créer un wrapper dans `src/components/shared/` — jamais éditer `src/components/ui/`.

## Vérification DESIGN.md

Avant tout travail frontend :
1. Lire `DESIGN.md` à la racine
2. Vérifier que le champ `fetched_at` est présent — si absent, le fichier est une version imaginée, le remplacer
3. Jamais remplacer `DESIGN.md` par une version communautaire sans extraction CSS réelle

## Source de référence Square officielle

- Site : squareup.com
- Design system : Square DS (tokens `--color-*`, `--action-variant-*`, `--font-family-*`)
- Framework : SvelteKit (CSS scopé `.svelte-*`)
- DESIGN.md projet : extraction CSS 2026-04-13
