# Deploy & Visual Safety Rules - ATTABL SaaS

Ces regles existent a cause d'un incident (2026-07-03) : des refontes UI/responsive
mergees sans verification visuelle live + des deploiements prod rapides en rafale
pour une demo ont casse visuellement le dashboard (boutons qui se chevauchent).
Elles s'appliquent a l'agent principal ET a tout agent/session.

## 0. NE JAMAIS DEVINER - OBSERVER (regle absolue)

Pour tout bug visuel / layout / responsive / comportement UI : INTERDIT de conclure
ou de proposer un fix a partir d'un raisonnement "dans ma tete" (calcul de
breakpoints, lecture de classes, deduction). Il FAUT reproduire et REGARDER l'effet
reel avant tout diagnostic ou fix.

- Ouvrir la page dans un navigateur (dev local, `ALLOW_DEV_AUTH_BYPASS=true` sur
  localhost permet d'atteindre `/sites/<slug>/admin` sans login), la rendre au(x)
  viewport(s) concerne(s), prendre un screenshot, LIRE l'etat rendu (largeur reelle
  du conteneur, tier actif, element qui deborde).
- Ne pas faire perdre de temps a l'utilisateur avec des hypotheses successives non
  verifiees. Un diagnostic = une observation, pas une deduction.
- Apres un fix visuel : re-observer au navigateur AVANT de dire que c'est corrige
  (cf regle globale verify-visually + section 2 ci-dessous).
- Si l'observation est impossible (pas d'acces), le DIRE explicitement et demander
  le moyen d'observer (screenshot, acces), au lieu de deviner.

## 1. Deploiements prod - regles strictes

- **JAMAIS de deploiement prod "cosmetique" ou "pour la demo".** Un deploy prod
  ne sert QU'A livrer de la valeur reelle verifiee. Ne jamais merger sur `main`
  dans le seul but de "declencher un deploy" ou "montrer quelque chose".
- **UN seul deploy prod a la fois.** Apres un merge, attendre que le deploy
  Vercel soit LIVE et verifie avant d'en declencher un autre. Interdit d'enchainer
  2+ merges/deploys en rafale (cela cree du skew d'assets : ancien CSS + nouveau JS
  = layout casse dans les onglets ouverts).
- **Pas de merge sur main sans valeur produit.** Les commits "chore/trigger-deploy",
  "bump", commentaire-seul pour forcer un build = INTERDITS sur main.
- Pour tester un comportement lie au deploiement, utiliser un build/preview local,
  PAS la prod.

## 2. Verification visuelle OBLIGATOIRE avant merge (UI/layout/responsive)

Toute PR qui touche un composant visuel, un layout, une classe Tailwind de mise en
page, une container-query, ou le shell admin DOIT, AVANT merge :

1. Etre rendue et regardee (navigateur ou screenshots), PAS juste "les classes ont
   l'air bonnes" (cf regle globale verify-visually).
2. Etre verifiee a CHAQUE breakpoint : **375, 768, 1024, 1280, 1440 px**, en
   **dark ET light**.
3. Confirmer : aucun chevauchement d'elements, aucun bouton/texte tronque, aucun
   debordement horizontal, un seul conteneur scrollable (`main#main-content`).
4. `pnpm build && pnpm start` (prod local) pour les changements responsive - Turbopack
   dev est plus permissif que le build prod (Lightning CSS minify).

Si la verification visuelle n'a pas ete faite, la PR UI n'est PAS terminee.

## 3. Changements a HAUT RISQUE (verification renforcee)

Ces surfaces cassent TOUTES les pages admin d'un coup si elles regressent. Toute
modification ici exige des screenshots multi-viewport joints a la PR + un smoke
visuel prod post-deploy :

- `src/components/admin/AdminLayoutClient.tsx`, `ShellSidebar.tsx`, `AdminBottomNav.tsx`
- `src/app/sites/[site]/admin/layout.tsx` (shell tenant)
- Tout recalibrage global de container-queries (`@sm/@md/@lg/@xl` -> `@3xl/@5xl/...`)
- `src/app/globals.css`, tokens de theme, contrat viewport
- Composants `fixed`/`sticky` (banniere, bottom-nav, toolbars) : verifier qu'ils ne
  se superposent PAS entre eux (memes `bottom-0`/`z-index`).

## 4. Smoke visuel prod post-deploy (shell/dashboard)

Apres un deploy qui touche le shell ou le dashboard : verifier la surface reelle en
prod (au moins 1 viewport desktop + 1 mobile) AVANT de considerer la tache finie.
Si un skew d'assets est suspecte : hard refresh d'abord, puis juger.

## 5. Composants fixed/sticky superposes (piege recurrent)

Avant d'ajouter un element `fixed`/`sticky`, verifier tous les autres elements
ancres au meme bord :
- La nav mobile `AdminBottomNav` est `fixed bottom-0 z-50 h-14`. Tout element ancre
  en bas (banniere, toast, CTA) DOIT s'en decaler (offset >= hauteur nav + safe-area)
  sur les breakpoints ou la bottom-nav est visible, ou etre masque quand elle l'est.
- Ne jamais empiler deux `fixed bottom-0` au meme `z-index`.
