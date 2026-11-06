# ATTABL — Audit responsive

**Mesuré au navigateur le 6 novembre 2026.** Ce document remplace la version de
mars 2026, dont la recommandation centrale est devenue dangereuse : voir
[Pourquoi l'ancien document a été retiré](#pourquoi-lancien-document-a-été-retiré).

---

## 1. Résultat : les fondations tiennent

**31 pages mesurées, 8 tailles, clair et sombre. Un seul défaut réel trouvé.**

| Famille                                              | Pages | Débordement horizontal |
| ---------------------------------------------------- | ----- | ---------------------- |
| Espace admin d'un restaurant                         | 14    | **aucun**              |
| Carte cliente (accueil, carte, panier)               | 3     | **aucun**              |
| Vitrine (accueil, tarifs, blog, support…)            | 16    | **aucun**              |
| Entrée (connexion, inscription, mot de passe oublié) | 4     | **aucun**              |
| État (page introuvable)                              | 1     | **aucun**              |

Tailles couvertes : 320, 375, 390, 768, 1024, 1024×600 (tablette paysage
courte), 1194×744, 1280, 1440, 1920.

La base était **chargée** pour la mesure : 44 plats aux noms longs, 26 commandes
aux références longues. Un audit sur une base vide ne prouve rien.

### Les défauts trouvés et corrigés

| Page          | Défaut mesuré                                                                                       | Correction                                                     |
| ------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Carte cliente | bouton « ajouter au panier » : zone tactile de 34×34 px                                             | zone portée à 44×44 sans changer le rendu                      |
| Carte cliente | recherche et retour : 38×38 px                                                                      | idem                                                           |
| Carte cliente | pastilles de catégories : 36 px de haut                                                             | idem                                                           |
| Carte cliente | compteur de quantité : 26×26 px                                                                     | idem                                                           |
| Tarifs        | sélecteur de période : 370 px dans une colonne de 335 → « ‑20 % » coupé au bord de l'écran à 375 px | onglets resserrés sous `sm`, passage à deux lignes sous 360 px |

Aucune de ces corrections ne modifie l'apparence : les tailles visibles viennent
de la maquette et sont inchangées. Seule la **surface sensible au doigt** a été
élargie, par un pseudo-élément transparent.

---

## 2. Comment mesurer — et les deux pièges

### Piège 1 : le volet navigateur masqué fausse tout

Une page en arrière-plan ne produit pas d'images. `scroll`,
`IntersectionObserver` et `requestAnimationFrame` ne livrent plus rien, et toute
mesure qui en dépend est **fausse sans le dire**.

Lors de cet audit, une première série a conclu « 48 % de titres faux » sur la
carte cliente. Volet affiché, le même test donnait un résultat radicalement
différent. **Toujours afficher le volet avant de mesurer un défilement.**

### Piège 2 : contraindre la largeur d'un conteneur ne suffit pas

La règle `.claude/rules/12` propose de mesurer le débordement en contraignant la
largeur du conteneur de défilement. Cette méthode vaut pour les **pages
d'authentification autonomes**, pour lesquelles elle a été écrite.

Elle donne des **faux positifs en admin** : elle ne déclenche pas les
media-queries. Mesure du 6 novembre : le tableau de bord semblait déborder de
89 px à 375 px alors qu'au viewport **réellement émulé** à 375 px, il ne déborde
pas du tout — le tableau bascule en cartes, ce que la contrainte ne reproduit
pas.

**En admin, émuler la vraie taille.**

### La mesure qui compte

Le symptôme que voit l'utilisateur, c'est « la page défile de côté ». Il se lit
sur la largeur de défilement, pas en comptant les éléments :

```js
const scroller = document.getElementById('main-content') ?? document.scrollingElement;
Math.max(
  scroller.scrollWidth - scroller.clientWidth,
  document.body.scrollWidth - window.innerWidth,
);
```

Compter les éléments qui dépassent produit du bruit : ceux d'une rangée qui
défile **exprès** (les pastilles de catégories) ne sont pas des fautes. C'est le
défaut qu'avait l'ancienne garde `tests/e2e/responsive.spec.ts`, depuis reprise.

---

## 3. Les règles en vigueur

Elles vivent dans `.claude/rules/`, pas ici. Ce document ne les répète pas, il
y renvoie :

- `03-responsive-design.md` — breakpoints, grilles, zones tactiles 44 px,
  **interdiction des container-queries pour le layout de page en admin** ;
- `08-viewport-production.md` — contrat viewport, un seul conteneur scrollable ;
- `11-deploy-visual-safety.md` — ne jamais conclure sans observer, vérification
  visuelle obligatoire avant merge ;
- `12-auth-standalone-responsive.md` — contrat des pages plein écran autonomes.

---

## 4. La garde automatique

`tests/e2e/responsive.spec.ts` couvre les trois pages vues par un convive
(accueil, carte, panier) sur huit tailles, plus une vérification des zones
tactiles qui tient compte des zones élargies par pseudo-élément.

Le restaurant de test se règle par `E2E_TENANT_SLUG` (défaut : `blutable`,
comme les autres tests de bout en bout). S'il n'existe pas dans la base visée,
les tests sont **ignorés avec un message explicite** plutôt que mis en échec :
un 404 lu comme une régression responsive ferait chercher au mauvais endroit.

---

## 5. Pourquoi l'ancien document a été retiré

La version de mars 2026 recommandait de migrer l'admin vers les **container
queries**, et le modèle de PR porte encore cette consigne.

**Appliquer cette recommandation casse l'affichage.** C'est exactement ce qui
s'est produit le 3 juillet 2026 : une `@container` posée sur un conteneur de
shell vaut « viewport moins la barre latérale », donc un vrai ordinateur
recevait le layout **tablette**. La règle `.claude/rules/03` l'interdit depuis,
et ESLint bloque le merge.

Les container-queries restent légitimes pour un composant réutilisable isolé qui
possède sa propre `@container` — POS, écran cuisine, fenêtre d'encaissement.
Jamais pour le layout d'une page admin.

L'ancien document ne disait pas non plus ce qui avait été corrigé depuis sa
rédaction, ce qui rendait ses 84 « largeurs fixes » et ses 38 « grilles sans
palier » invérifiables. Les chiffres de ce document-ci sont tous reproductibles
par la méthode décrite au point 2.

---

_Mesuré et rédigé le 6 novembre 2026. À refaire après toute refonte du shell
admin ou de la carte cliente._
