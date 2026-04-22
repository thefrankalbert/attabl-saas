# Prompt à coller dans ton Claude de projet

Copie **tout le bloc ci-dessous** dans ton environnement Claude (Claude Code, etc.) **après avoir ajouté les deux fichiers de référence au projet** :
- `blutable-static.html` (maquette)
- `blutable-handoff.md` (brief)

---

```
Tu vas porter la refonte UI de Blutable dans notre projet existant.

## Références (à lire EN PREMIER, dans l'ordre)
1. `./design/blutable-handoff.md` — le brief de passation, règles et tokens
2. `./design/blutable-static.html` — la maquette visuelle (source unique de vérité pour le rendu)

## Règles impératives (non négociables)
- REFONTE VISUELLE UNIQUEMENT. Ne change rien à :
  * la stack (framework, bundler, routing, state, auth)
  * les endpoints, modèles, schémas, migrations, noms de tables
  * la logique métier (panier, checkout, statuts commande, facturation, calculs, TVA)
- Garde 100 % des fonctionnalités existantes. Aucune régression.
- La table est VERROUILLÉE depuis le QR. Jamais de sélecteur de table dans l'UI.
- Français partout.
- Respecter la charte (Fraunces + Inter, palette navy/gold/cream) décrite dans le brief.
- Accessibilité : contrastes ≥ 4.5:1, cibles tactiles ≥ 44px, aria préservé.

## Avant de coder, fais ceci
1. Liste les fichiers de style / tokens actuels du projet et dis-moi comment tu comptes y injecter les nouveaux tokens (sans casser l'existant).
2. Liste les composants UI actuels qui seront remplacés ou remappés.
3. Propose un ordre de migration et attends ma validation avant d'écrire du code.

## Ordre de travail validé (à exécuter après ma validation)
1. Tokens (couleurs, rayons, ombres, espacements) dans le système de theming existant.
2. Typographie : ajouter Fraunces + Inter via Google Fonts (ou self-host si la politique projet l'exige) sans toucher aux autres polices du système.
3. Atomes : Button, Chip, Pill, PriceTag.
4. Molécules : DishCard, CategoryTile, OrderTimeline, BottomSheet, NavBottom.
5. Écrans dans l'ordre du parcours : Accueil → Catégorie → Détail plat → Panier → Checkout → Mes commandes → Compte → Info resto.
6. Micro-interactions (pulse badge, toast, transitions sheets).

## Contraintes techniques spécifiques
- Devise : FCFA, 0 décimale, séparateur milliers = espace insécable. Exemple : « 8 500 FCFA ».
- Les add-ons / accompagnements de plat doivent continuer à utiliser le modèle Option/Variant existant. Aucun prix en dur dans les composants.
- Les URLs d'images Unsplash présentes dans la maquette sont des placeholders — remplace-les par les assets du CDN/bucket du projet.
- L'italique gold des titres éditoriaux doit se faire avec `<em>` stylée (italique + couleur gold), pas un composant custom.

## Critères de validation (pour chaque PR / commit)
- [ ] Rendu pixel-proche de la maquette (à 95 %)
- [ ] Aucun test existant cassé
- [ ] Aucun changement dans les routes API ou les modèles
- [ ] Parcours utilisateur complet validé en local (scan QR → commande → paiement → suivi)
- [ ] Lighthouse accessibilité ≥ 95 sur les écrans modifiés

Commence par l'étape « Avant de coder ». Ne modifie aucun fichier tant que je n'ai pas validé ton plan.
```

---

## Comment l'utiliser

1. Crée un dossier `design/` à la racine de ton projet Blutable.
2. Copie dedans `blutable-static.html` et `blutable-handoff.md`.
3. Ouvre Claude Code dans le projet.
4. Colle le bloc encadré ci-dessus dans la conversation.
5. Claude lira d'abord les références, te proposera un plan d'injection des tokens, puis te demandera validation avant de coder. À partir de là tu avances étape par étape.

## Astuce pour garder le contrôle

Ne laisse pas Claude toucher aux fichiers de routing, services, stores ou schémas. Si tu veux être strict, ajoute à la fin du prompt :

```
Fichiers interdits en écriture : /routes, /api, /server, /db, /models, /migrations, /services.
Si tu penses devoir modifier l'un d'eux, arrête-toi et demande-moi confirmation.
```
