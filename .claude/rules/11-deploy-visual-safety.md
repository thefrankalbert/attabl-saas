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

## 4bis. Un merge ne suffit PAS a livrer - la promotion production

Sur ce projet, un merge sur `main` cree bien un deploiement `target=production` qui
passe `READY`, mais il reste en substate **`STAGED`** : le domaine `attabl.com`
continue de servir l'ancien build. Le code est alors builde mais **jamais servi**.
C'est arrive a `503c0eec` (PR #293, vitrine marketing), restee non servie pendant
des jours sans que personne le voie.

### Ce que l'audit a etabli (2026-07-30/31, mesures et non hypotheses)

1. **Ce n'est pas un delai.** Un deploiement production de test est reste `STAGED`
   plus de **18 heures** sans aucune intervention.
2. **La regression est datee.** Ecart mesure entre `ready` et `aliasAssigned` sur
   les 13 derniers deploiements production : **1 a 2 s** du 18 au 21 juillet
   (8 deploiements d'affilee), puis **jamais** a partir du 26 juillet.
3. **Ce n'est pas le compte.** Les autres projets de la meme equipe Vercel sont
   promus en 0-1 s, `lamaisonomade` y compris le 27 juillet (donc apres la
   bascule). Le probleme est **propre au projet attabl-saas**.
4. **Ce n'est pas un reglage.** Diff complet des reglages contre un projet qui
   fonctionne : aucune difference pertinente. `link.productionBranch=main`,
   domaines verifies et `misconfigured=false`, `autoAssignCustomDomains=true`,
   `rollingRelease=null`, `lastRollbackTarget=null`, compte sans `softBlock` ni
   `featureBlocks`, plan hobby actif.
5. **Seule particularite restante** : attabl-saas est le seul projet a avoir un
   domaine **wildcard** (`*.attabl.com`). Symptome associe : sur `lamaisonomade`,
   `targets.production.alias` contient le domaine custom ; sur attabl-saas il ne
   contient que les URLs `vercel.app`, `attabl.com` en est absent.

Conclusion : comportement cote plateforme, specifique a ce projet. Ne pas perdre
de temps a chercher un reglage a corriger, et ne PAS detacher/rattacher le domaine
(tous les sous-domaines tenants en dependent).

### La parade

Un workflow (`.github/workflows/promote-prod.yml`) promeut automatiquement apres
chaque push sur `main`. Il exige le secret `VERCEL_TOKEN` (token cree sur
https://vercel.com/account/tokens, puis `gh secret set VERCEL_TOKEN`). Le secret
EST configure et le workflow fonctionne : sans lui, il ne casse pas le merge, il
explique la marche a suivre dans son resume.

**Aucune etape manuelle n'est requise apres un merge.** Mesure du 09/08/2026,
deux merges d'affilee (`70553be5`, `1d0cbe96`) : merge -> build -> promotion ->
domaine a jour en **environ 3 minutes**, sans intervention.

```
19:58:13  attendu 70553be5 / servi 6bef62ef   <- normal, le build tourne
20:00:46  promotion demandee (HTTP 201)
20:01:02  prod: PROMOTED - attabl.com sert maintenant 70553be5
```

**Piege : ne PAS verifier dans la minute qui suit le merge.** Le domaine sert
encore l'ancien commit tant que le build n'est pas fini, et `--check` repond alors
`OUT-OF-SYNC`. Ce n'est PAS une panne de promotion, c'est un build en cours.
Attendre ~3 min, ou lire le resultat du workflow `promote-prod` sur le commit, qui
est la source de verite. Conclure "la promotion est bloquee" sur une verification
prematuree fait perdre du temps a l'utilisateur (constate le 09/08/2026).

En local, ou si le workflow est indisponible :

```bash
./scripts/promote-prod.sh            # verifie et promeut si necessaire
./scripts/promote-prod.sh --check    # verifie seulement
./scripts/promote-prod.sh --wait 15  # attend la fin du build (usage CI)
```

Sortie grep-friendly : `^prod: IN-SYNC|PROMOTED|OUT-OF-SYNC|NOT-READY|ERROR`.
Le deploiement est choisi **par son commit**, jamais "le plus recent" : le plus
recent est souvent une preview de branche, et la promouvoir enverrait du code non
merge en production.

### Piege du 409 (corrige le 2026-11-08)

`promote-prod.sh` sortait en `prod: ERROR` quand l'API Vercel repondait **409
"already the current production deployment"** - c'est-a-dire quand la promotion
etait DEJA faite, l'etat recherche. Ca arrive systematiquement si on lance le
script a la main pendant que le workflow fait le meme travail. Mesure sur
`555697d4`: `ERROR` affiche alors que le domaine servait deja le bon commit.

Desormais: un 409 n'est pas une panne, et le script ne croit pas le message de
l'API - c'est le domaine qui tranche (jusqu'a 90 s, car l'assignation n'est pas
instantanee). Les vrais refus (401, 403, ...) restent des erreurs. Verrouille
par `scripts/__tests__/promote-prod-409.test.sh`, lance par la CI (porte "Tests
des scripts"), avec un cas de non-regression par code d'erreur.

### Pieges verifies

- Le discriminant FIABLE est `curl https://attabl.com/api/version?cb=$(date +%s)` :
  il renvoie le SHA du commit reellement servi. Comparer a `git rev-parse origin/main`.
- NE PAS se fier au check "Vercel" de GitHub : il reste `pending` (etat de PR
  `UNSTABLE`) plus d'une heure apres que le deploiement soit READY. Verifier avec
  `npx vercel inspect <url>` ou l'API.
- NE PAS conclure "c'est du cache" sans preuve : un `x-vercel-cache: MISS` avec
  `age: 0` et `no-store` signifie que le domaine sert vraiment l'ancien deploiement.
- Le token du CLI (`vercel login`) EXPIRE (constate en une nuit). Pour la CI,
  utiliser un token cree dans le dashboard, pas celui de la session locale.
- Contre-verification du 09/08/2026, pistes que l'audit de juillet n'avait pas
  ouvertes - toutes negatives, NE PAS les rouvrir : `attabl.com` et `*.attabl.com`
  ont `gitBranch=null` et `redirect=null` (aucun domaine lie a une branche) ; les
  8 derniers deploiements production sont tous `readySubstate=PROMOTED` avec
  `aliasAssigned=true` et **aucun `aliasError`** ; `lastRollbackTarget=null`,
  pas de rolling release. La configuration du projet est saine. Il ne reste plus
  rien a corriger cote projet : le workflow EST la procedure normale.

## 5. Composants fixed/sticky superposes (piege recurrent)

Avant d'ajouter un element `fixed`/`sticky`, verifier tous les autres elements
ancres au meme bord :
- La nav mobile `AdminBottomNav` est `fixed bottom-0 z-50 h-14`. Tout element ancre
  en bas (banniere, toast, CTA) DOIT s'en decaler (offset >= hauteur nav + safe-area)
  sur les breakpoints ou la bottom-nav est visible, ou etre masque quand elle l'est.
- Ne jamais empiler deux `fixed bottom-0` au meme `z-index`.
