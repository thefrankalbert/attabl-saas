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

## 4bis. Un merge ne suffit PAS a livrer - verifier la promotion (piege recurrent)

Sur ce projet, un merge sur `main` cree bien un deploiement `target=production` qui
passe READY, mais Vercel ne lui assigne PAS toujours le domaine `attabl.com`. Le
code est alors builde mais **jamais servi** :

- `503c0eec` (PR #293, vitrine marketing) : jamais aliase, prod restee sur l'ancien
  build pendant des jours.
- `6cb54d46` (PR #294) : aliase seulement apres un `vercel promote` manuel.

La configuration du projet est pourtant SAINE (verifie 2026-07-30 via l'API Vercel :
`link.productionBranch=main`, domaines `attabl.com` + `*.attabl.com` verifies sans
`gitBranch` ni `redirect`, `autoAssignCustomDomains=true`, `rollingRelease=null`,
`lastRollbackTarget=null`). Il n'y a donc AUCUN reglage a corriger : le comportement
vient de la plateforme. La seule parade est de verifier apres chaque merge.

**Procedure obligatoire apres chaque merge sur main :**

```bash
./scripts/promote-prod.sh          # verifie et promeut si necessaire
./scripts/promote-prod.sh --check  # verifie seulement (CI / doute)
```

Sortie grep-friendly : `^prod: IN-SYNC|PROMOTED|OUT-OF-SYNC|ERROR`.

- Le discriminant FIABLE est `curl https://attabl.com/api/version?cb=$(date +%s)` :
  il renvoie le SHA du commit reellement servi. Comparer a `git rev-parse origin/main`.
- NE PAS se fier au check "Vercel" de GitHub : il reste `pending` (etat de PR
  `UNSTABLE`) bien apres que le deploiement soit READY. Verifier avec
  `npx vercel inspect <url>` ou l'API.
- NE PAS conclure "c'est du cache" sans preuve : verifier les en-tetes
  (`x-vercel-cache`, `age`, `cache-control`). Un `MISS` + `age: 0` + `no-store`
  signifie que le domaine sert vraiment l'ancien deploiement.

## 5. Composants fixed/sticky superposes (piege recurrent)

Avant d'ajouter un element `fixed`/`sticky`, verifier tous les autres elements
ancres au meme bord :
- La nav mobile `AdminBottomNav` est `fixed bottom-0 z-50 h-14`. Tout element ancre
  en bas (banniere, toast, CTA) DOIT s'en decaler (offset >= hauteur nav + safe-area)
  sur les breakpoints ou la bottom-nav est visible, ou etre masque quand elle l'est.
- Ne jamais empiler deux `fixed bottom-0` au meme `z-index`.
