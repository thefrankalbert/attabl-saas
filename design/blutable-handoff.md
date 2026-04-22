# Brief de passation — Refonte UI Blutable v3

**Destinataire** : Claude Code (ou équivalent) travaillant sur ton projet Blutable.
**Source visuelle de vérité** : `blutable-static.html` (la maquette statique).
**Portée** : refonte **visuelle uniquement**. Zéro changement fonctionnel.

---

## 1. Règles absolues (non négociables)

1. **Ne pas toucher à la stack existante** : framework, bundler, routing, state management, auth, ORM, endpoints, schémas BDD, noms de tables, modèles, migrations.
2. **Ne pas toucher à la logique métier** : panier, checkout, statuts commande, facturation, rôles, permissions, calculs de totaux, TVA.
3. **Garder 100 % des fonctionnalités actuelles** — chaque fonction existante doit rester présente et fonctionnelle.
4. **QR → Table est verrouillé** : la table est **lue depuis le QR scanné**, jamais sélectionnable dans l'UI. Pour changer de table, il faut rescanner. La facturation est rattachée à la table. Ne jamais afficher de sélecteur de table.
5. **Langue** : français partout (textes visibles et placeholders).
6. **On modifie uniquement la couche de présentation** : composants UI, styles, assets, micro-interactions.
7. **Pas de régression d'accessibilité** : contrastes ≥ 4.5:1 pour les textes, cibles tactiles ≥ 44×44 px, labels ARIA préservés.

---

## 2. Design tokens à répliquer dans la stack existante

### Couleurs

| Token        | Valeur      | Usage                                            |
|--------------|-------------|--------------------------------------------------|
| `--navy`     | `#0B1E3F`   | Texte principal, fonds sombres, CTA primaire     |
| `--navy-80`  | `#34435F`   | Texte secondaire                                 |
| `--navy-60`  | `#6B7486`   | Texte tertiaire, icônes inactives                |
| `--gold`     | `#B89968`   | Accent, prix, badges Signature, italiques Fraunces |
| `--gold-soft`| `#D9C39A`   | Chips actives, survols                           |
| `--cream`    | `#F6F1E7`   | Fond cartes douces, séparateurs doux             |
| `--bone`     | `#FBF8F1`   | Fond appli (canvas)                              |
| `--paper`    | `#FFFEF9`   | Fond cartes premium                              |
| `--line`     | `#E8E1D1`   | Filets, bordures                                 |
| `--success`  | `#2E7D5B`   | Statut « Prête », toasts                         |
| `--warn`     | `#C98A3B`   | Statut « Préparation »                           |
| `--danger`   | `#9B2C2C`   | Erreurs, suppression                             |

### Typographie

- **Display** : **Fraunces** (variable, `opsz 9..144`, italiques activées). Charger via Google Fonts.
- **UI / Body** : **Inter** (variable, 400/500/600/700). Charger via Google Fonts.
- **Règle d'usage** :
  - Titres écrans, noms de plats, noms de catégories → Fraunces 500–600.
  - Accent éditorial (mots en italique dans un titre type « Que désirez-vous *ce soir* ? ») → Fraunces italic 500, couleur `--gold`.
  - Tout le reste (prix, CTA, labels, body, prix) → Inter.
- **Échelle** : 12 / 13 / 14 / 15 / 16 / 18 / 20 / 24 / 28 / 34 (px).
- **Line-height** : 1.1 pour display, 1.4 pour body, 1.5 pour textes longs.

### Rayons

- `--r-xs` 6px — chips, pills
- `--r-sm` 10px — inputs, petits boutons
- `--r-md` 14px — cartes standard
- `--r-lg` 20px — cartes hero, modales
- `--r-xl` 28px — sheets bas d'écran
- `--r-full` 999px — pastilles, avatar

### Ombres

- `--sh-soft` : `0 1px 2px rgba(11,30,63,.04), 0 2px 8px rgba(11,30,63,.04)` — cartes au repos
- `--sh-raised` : `0 4px 14px rgba(11,30,63,.08)` — cartes flottantes, dishes
- `--sh-float` : `0 10px 30px rgba(11,30,63,.14)` — sheets, CTA sticky
- `--sh-phone` : `0 30px 80px rgba(11,30,63,.25)` — cadre iPhone mockup (présentation uniquement)

### Espacement (base 4)

`4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 / 28 / 32 / 40 / 48 / 64` px.

### Motion

- Transitions UI standard : `cubic-bezier(.2,.7,.2,1)` 180ms.
- Entrée sheet : 240ms ease-out + légère élévation.
- Pulse badge commande en cours : 1.6s loop.

---

## 3. Inventaire des écrans (dans la maquette)

1. **Accueil** — hero chef's pick, catégories 4-col, plats en vedette, filtres.
2. **Confirmation table (QR)** — carte lecture seule, CTA « Scanner un autre QR ».
3. **Info restaurant** — horaires, contact, présentation.
4. **Bannière PWA** — prompt installation.
5. **Panier vide** — état zéro avec illustration légère.
6. **Panier avec articles** — liste, table verrouillée, totaux, CTA checkout.
7. **Mes commandes** — timeline animée (Reçue / Préparation / Prête / Servie) + ETA.
8. **Mon compte** — profil, historique, table (verrouillée via QR), préférences.
9. **Catégorie (vue liste)** — header catégorie, chips filtres, liste plats.
10. **Détail plat** — photo plein cadre, cuisson (Rosé / À point / Bien cuit), accompagnements upsell (+1500 / +2000 FCFA), CTA ajouter.

---

## 4. Composants atomiques à créer / adapter

| Composant        | Notes                                                                  |
|------------------|------------------------------------------------------------------------|
| `Button.primary` | Navy fond, texte bone, radius md, hauteur 48                           |
| `Button.ghost`   | Bordure gold, texte navy                                               |
| `Chip`           | Pill, cream fond, navy texte, gold actif                               |
| `Pill.lock`      | Icône cadenas, fond cream, « Verrouillée QR »                          |
| `DishCard`       | Photo 1:1 ou 4:3, titre Fraunces, prix gold, note, temps prep, upsell  |
| `CategoryTile`   | Photo plein cadre, scrim navy gradient, label blanc Fraunces centré   |
| `NavBottom`      | Glass morphism, 4 onglets, indicateur actif en gold                    |
| `OrderTimeline`  | 4 étapes, pulse sur l'étape active, labels et horodatage               |
| `HeroChefPick`   | Section large, photo, note 4.9, badge « Signature »                    |
| `PriceTag`       | Inter 600, couleur gold, devise FCFA                                   |
| `Toast`          | Slide top, success/warn/danger                                         |
| `BottomSheet`    | Drag handle, r-xl haut, shadow float                                   |

---

## 5. Ordre de migration recommandé

1. **Tokens** — créer/mettre à jour le fichier tokens (CSS variables, theme Tailwind, thème CSS-in-JS…) selon la stack existante.
2. **Fonts** — ajouter Fraunces + Inter (Google Fonts ou self-host) et déclarer dans la CSS globale/layout racine.
3. **Atomes** — Button / Chip / Pill / PriceTag.
4. **Molécules** — DishCard / CategoryTile / OrderTimeline / BottomSheet / NavBottom.
5. **Écrans** — un par un, dans l'ordre du parcours utilisateur : Accueil → Catégorie → Détail plat → Panier → Checkout → Mes commandes → Compte.
6. **Micro-interactions** — pulse badge, toast, transitions sheets.
7. **Garde-fous** — vérifier qu'aucun appel API, modèle, ou handler n'a changé de signature.

---

## 6. Points d'attention spécifiques

- **Table lecture seule** : là où l'ancien UI avait un sélecteur, remplacer par la carte QR read-only. Aucun `onChange` sur le champ table côté client.
- **Devise FCFA** : format à 0 décimales, séparateur milliers ` ` (espace insécable) — exemple : `8 500 FCFA`.
- **Photos** : dans la maquette, URLs Unsplash. En prod, utiliser les mêmes clefs d'images que l'existant (CDN maison / bucket). Ne pas reconnecter les photos Unsplash en prod.
- **Upsells plat** : accompagnements sont des **add-ons optionnels** qui doivent s'ajouter au prix calculé côté back — ne pas coder de prix en dur côté front, utiliser le champ existant du modèle `Option`/`Variant`.
- **Italique gold dans les titres** : balise `<em>` stylée avec `font-style: italic; color: var(--gold);` — ne pas créer de composant custom.

---

## 7. Définition de « terminé »

- Tous les écrans existants reproduits au niveau visuel de la maquette.
- Aucun test fonctionnel cassé.
- Aucun changement dans les routes API, les modèles, ou les migrations.
- Lighthouse accessibilité ≥ 95.
- QR → table vérifié sur un ticket réel.
