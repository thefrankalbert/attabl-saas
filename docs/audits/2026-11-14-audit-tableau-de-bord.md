# Audit du tableau de bord, page par page (14 novembre 2026)

## Pourquoi cet audit

Le propriétaire a constaté en production des défauts visibles : dans les paramètres, un tableau dont le contenu « bouge entièrement » quand on le fait défiler, et des textes qui se chevauchent. Il a demandé un passage au peigne fin de toutes les pages du tableau de bord, du code mort et du code cassé, selon une méthode de test reconnue.

## Référentiels utilisés

| Référentiel                                       | Ce qu'il couvre                                                                                                                                    | Ce qu'on en a tiré ici                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ISO/IEC 25010:2023 (modèle de qualité logicielle) | Adéquation fonctionnelle, performance, compatibilité, facilité d'utilisation, fiabilité, sécurité, maintenabilité                                  | Grille générale : chaque défaut est classé dans l'une de ces familles                                                                            |
| WCAG 2.2 niveau AA, critère 1.4.10 « Reflow »     | Le contenu doit tenir à 320 px de large sans défilement dans deux directions. Un tableau peut défiler latéralement, mais **dans son propre cadre** | Règle appliquée aux tableaux : seule la zone du tableau défile, la page jamais, et les colonnes fixes restent lisibles                           |
| OWASP ASVS 5.0                                    | Vérification de la sécurité applicative (niveaux 1 à 3)                                                                                            | Validation des entrées au point d'entrée (règle des adresses d'images ci-dessous). Le reste a été couvert par le test d'intrusion du 12 novembre |

Sources : [ISO/IEC 25010](https://webstore.iec.ch/en/publication/90024), [WCAG 2.2 Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow), [OWASP ASVS](https://quality.arc42.org/standards/owasp-asvs).

## Méthode

1. Base de démonstration locale jetable (aucune écriture en production), restaurant « L'Epicurien » avec 656 commandes, 51 plats, stock et équipe.
2. Connexion avec le compte propriétaire de démonstration.
3. **Mesure automatique** sur chaque page, à 5 largeurs (375, 768, 1024, 1280, 1440 px) :
   - débordement horizontal de la page ;
   - élément qui sort de la zone de contenu ;
   - texte qui en recouvre un autre (y compris sous la ligne de flottaison) ;
   - texte coupé sans « ... », ou coupé au point d'être illisible ;
   - colonne fixe à fond transparent dans un tableau qui défile (le défaut signalé) ;
   - erreurs de la console du navigateur (traductions manquantes, plantages).
4. **Témoins** : la mesure a été éprouvée avant usage. Sur une page propre elle ne signale rien ; un texte superposé et une colonne fixe transparente injectés volontairement sont bien détectés.
5. **Captures d'écran** de chaque défaut signalé, pour écarter les fausses alertes, puis de chaque correction, en clair et en sombre.
6. Code mort : outil `knip` + vérification manuelle de chaque élément.
7. Les 5 portes qualité : types, lint (0 avertissement), formatage, tests unitaires, build de production.
   8## Pages contrôlées (35)

Tableau de bord, Commandes, Détail d'une commande, Ardoises, Service, Cartes, Détail d'une carte, Catégories, Plats, QR codes, Caisse, Cuisine, Inventaire, Inventaires tournants, Détail d'un inventaire tournant, Rapports d'inventaire, Historique du stock, Fournisseurs, Fiches techniques, Rapports, Factures, Pertes, Journal d'audit, Équipe, Paramètres, Permissions, Tables, Espaces, Abonnement, Annonces, Publicités, Coupons, Suggestions, Aide, Supports imprimés.

**Résultat final, mesuré sur le build de production : 0 défaut** sur les 35 pages, aux 5 largeurs, en clair et en sombre (350 rendus), sans plantage ni erreur de console. Seule réponse réseau en erreur : la liste des invitations (Équipe) refusée en 429, parce que le banc n'a pas de Redis. En production réelle, Redis est configuré.

## Défauts trouvés et corrigés (15)

| #   | Page                                          | Défaut constaté                                                                                                                                                                                                                                                  | Famille ISO 25010                                   | Correction                                                                                                                                                                                   |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Paramètres > Permissions                      | En faisant défiler le tableau, les interrupteurs passaient sous les libellés (fond transparent de la colonne fixe) et les titres de groupe disparaissaient. **C'est le défaut signalé.**                                                                         | Facilité d'utilisation                              | Fonds de ligne opaques, titre de groupe fixé                                                                                                                                                 |
| 2   | Détail d'une commande (téléphone et tablette) | La liste des plats était écrasée à une hauteur nulle (invisible) et les étiquettes « #3 / Serveur » recouvraient le bloc Impression                                                                                                                              | Adéquation fonctionnelle                            | Hauteur fixe réservée aux écrans de 1024 px et plus, la page défile normalement en dessous                                                                                                   |
| 3   | Commandes (tablette)                          | Les onglets de statut étaient coupés au milieu d'un mot                                                                                                                                                                                                          | Facilité d'utilisation                              | Onglets sur leur propre ligne entre 768 et 1023 px                                                                                                                                           |
| 4   | QR codes (téléphone)                          | L'onglet « Télécharger » était caché derrière le bouton Guide                                                                                                                                                                                                    | Facilité d'utilisation                              | Les 4 onglets sur une ligne pleine largeur                                                                                                                                                   |
| 5   | Équipe (téléphone)                            | Le nom et l'e-mail réduits à une lettre (« A... ») par l'étiquette du rôle                                                                                                                                                                                       | Facilité d'utilisation                              | Le rôle passe sous l'e-mail sur téléphone                                                                                                                                                    |
| 6   | Caisse (tablette)                             | « Room service » coupé                                                                                                                                                                                                                                           | Facilité d'utilisation                              | Le libellé passe sur deux lignes                                                                                                                                                             |
| 7   | Commandes                                     | Bouton du son sans libellé accessible (le code appelait une traduction sous un mauvais nom)                                                                                                                                                                      | Accessibilité                                       | Le code appelle la traduction existante `common.aria.soundSettings`                                                                                                                          |
| 8   | Caisse, Plats, Publicités, carte client       | **Une seule photo dont l'adresse n'est pas celle de notre stockage faisait planter toute la page** (écran 500), et la Caisse gardait cette carte défectueuse en mémoire hors ligne. Plats, cartes, catégories et publicités acceptaient n'importe quelle adresse | Fiabilité, sécurité (ASVS : validation des entrées) | Adresses d'images validées au point d'entrée : stockage Supabase du projet ou image interne uniquement. Vieux brouillons d'onboarding nettoyés au lieu de bloquer. Tests ajoutés et éprouvés |
| 9   | Cuisine                                       | Bouton d'impression des tickets sans libellé (traduction appelée sous un mauvais nom) et info-bulle en anglais (« Print »)                                                                                                                                       | Accessibilité                                       | Traduction existante `common.aria.print` pour les deux                                                                                                                                       |
| 10  | Cuisine                                       | « - Sur place » : tiret orphelin quand aucun nom de serveur ou de client ne précède                                                                                                                                                                              | Facilité d'utilisation                              | Le tiret n'apparaît qu'entre deux informations                                                                                                                                               |
| 11  | Cuisine                                       | Le voile « Appuyez pour activer le son » laissait lire les tickets à travers, ce qui brouillait le message                                                                                                                                                       | Facilité d'utilisation                              | Voile opaque                                                                                                                                                                                 |
| 12  | Cuisine (téléphone)                           | Le bouton plein écran sortait de l'écran à droite                                                                                                                                                                                                                | Facilité d'utilisation                              | Onglets « Actives / Terminées » plus compacts sur téléphone                                                                                                                                  |
| 13  | Cuisine (téléphone)                           | Le compteur d'un filtre chevauchait « Page 1/1 » en bas d'écran                                                                                                                                                                                                  | Facilité d'utilisation                              | Sur téléphone, les filtres défilent dans leur bande et seules les flèches de page restent                                                                                                    |
| 14  | Cuisine                                       | Le bouton plein écran s'annonçait « Réduire » même quand l'écran n'était pas en plein écran                                                                                                                                                                      | Accessibilité                                       | Libellé selon l'état : « Plein écran » ou « Quitter le plein écran »                                                                                                                         |
| 15  | Plats (modification)                          | 2 plats sur 357 en production ont une galerie enregistrée comme objet `{}` au lieu d'une liste : ouvrir leur fiche faisait planter le formulaire (`.filter` sur un objet)                                                                                        | Fiabilité                                           | Une galerie qui n'est pas une liste est traitée comme vide (`galleryExtras` + test). Le prochain enregistrement réécrit la galerie sous forme de liste                                       |

## Relecture indépendante

Un relecteur distinct a relu la première série de modifications pour chercher des erreurs. Il a trouvé 5 points, tous corrigés :

1. Les publicités et les images de catégories laissaient encore passer la même panne d'image : règle appliquée.
2. Un commentaire du code disait à tort qu'une fiche existante ne pouvait jamais être refusée : corrigé.
3. Un brouillon d'onboarding ancien pouvait bloquer la dernière étape : l'adresse morte est désormais ignorée.
4. Une adresse du type `/\site.com` passait le contrôle : refusée.
5. Un test dépendait de la configuration de la machine : rendu indépendant.

Une seconde relecture indépendante a porté sur la suite du travail (suppressions, Cuisine, types). Elle a relevé 4 points, tous traités :

1. Les migrations semblaient supprimées : c'était le banc de test qui les met de côté pendant qu'il tourne. Elles sont revenues à son arrêt (188 fichiers, vérifié).
2. Six animations CSS ne servaient qu'aux composants supprimés : retirées de `globals.css`.
3. La traduction `common.aria.minimize` n'était plus utilisée : retirée.
4. Sur téléphone, la position « Page x/y » de la Cuisine restait lisible par les lecteurs d'écran : conservée pour eux.

## Code mort

**Résultat : l'outil `knip` ne signale plus rien** (aucun fichier, export, type ni dépendance inutilisé).

| Élément                                                                                                                               | Décision                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `OrdersPagination.tsx` (jamais importé)                                                                                               | Supprimé                                                                                              |
| 17 composants d'interface jamais utilisés dans `src/components/ui/` (globe 3D, effets animés, aperçu « Safari », carte de prix, etc.) | Supprimés, avec l'accord écrit du propriétaire                                                        |
| Dépendances `cobe`, `@radix-ui/react-tooltip`, `@radix-ui/react-separator`, devenues inutiles                                         | Retirées                                                                                              |
| Réexportations et constante sans aucun usage                                                                                          | Supprimées                                                                                            |
| 17 fonctions et 40 types utilisés seulement dans leur propre fichier                                                                  | Ne sont plus exposés                                                                                  |
| 17 types jamais utilisés nulle part                                                                                                   | Supprimés                                                                                             |
| Une réexportation de type inutilisée dans `order.service.ts` (fichier protégé)                                                        | Retirée, à la demande explicite du propriétaire de finir tout le code mort. Aucun effet à l'exécution |
| Six animations CSS orphelines (`globals.css`, fichier protégé) et la traduction `common.aria.minimize`                                | Retirées, à la demande explicite du propriétaire                                                      |
| Fausses alertes de l'outil (service hors ligne, outils de test)                                                                       | Configuration de `knip` corrigée                                                                      |

## Points relevés, sans correction

- Service : la grille des tables défile dans sa propre zone, barre de défilement masquée volontairement. Rien n'est perdu (vérifié).
- Commandes : un espace au-dessus du tableau est réservé à la barre « N commandes sélectionnées », pour que le tableau ne saute pas. Choix voulu.
- Mode sombre : à l'ouverture, la page s'affiche en clair puis passe en sombre en moins d'une seconde. Choix documenté du projet (éviter une erreur d'affichage au chargement).

## Vérification en production (faite par le propriétaire)

Script en lecture seule (session `default_transaction_read_only = on`), testé d'abord sur une base jetable avec des cas piégés et un témoin d'écriture refusée. Résultat en production le 14 novembre 2026 : **0 adresse d'image hors stockage** pour les plats (photo principale et galerie), les catégories, les cartes et les publicités. La nouvelle règle de validation ne bloque donc la modification d'aucune fiche existante. Le diagnostic a révélé les 2 galeries mal formées corrigées au point 15.
