# PROMPT DE REFONTE — Page Service (ServiceManager.tsx)

Fais une refonte complete du design de `src/components/admin/ServiceManager.tsx`. Tu gardes TOUTES les features et la logique existante (state, hooks, handlers, data fetching, realtime). Tu changes UNIQUEMENT le JSX rendu et les classes Tailwind. Tu ne crees AUCUNE nouvelle feature. L'image de reference est jointe a ce prompt.

---

## ANALYSE DETAILLEE DE L'IMAGE DE REFERENCE

### A. TOP BAR (pleine largeur, en haut)

L'image montre une top bar horizontale avec 3 zones :

- **Gauche** : Deux boutons toggle cote a cote dans un conteneur arrondi (style pill/segmented control). "RESERVATION" et "WAITING" en texte uppercase. L'onglet actif a un fond plus clair.
- **Centre** : Un date picker avec fleches gauche/droite entourant la date (ex: "Thu, Jan 19"), suivi d'un dropdown "Dinner".
- **Droite** : Des icones (grille, QR code, parametres) puis un bouton bleu "+ New Reservation".

**POUR NOTRE CODE** : On n'a PAS de reservation/date picker. A la place, mettre sur cette ligne :

- A gauche : le titre "Service" (h1 existant)
- Au centre/droite : les stats existantes (duree moyenne, % capacite, tables occupees/total) dans des pills compacts
- Les stats sont dans des conteneurs arrondis avec fond `bg-app-card`, bordure subtile, icone + texte

---

### B. SIDEBAR GAUCHE (colonne fixe, environ 280-300px)

La sidebar est une colonne fixe qui prend toute la hauteur du contenu. Elle n'a PAS un fond de "card" distincte — elle fait partie du layout global avec une bordure droite subtile ou un fond legerement different (`bg-app-card/30` ou `bg-app-bg`).

#### B1. Barre de recherche (tout en haut de la sidebar)

- Input avec placeholder "Search Guest" (dans notre cas : `searchPlaceholder` existant)
- Fond legerement plus clair que le background
- Icone Search a gauche
- Coins arrondis (rounded-lg)
- Pas de bordure visible ou bordure tres subtile

#### B2. Section "SEATED" (= "En Service" dans notre code)

- **Label "SEATED"** en couleur ROUGE/CORAIL (`text-red-400` ou `text-rose-400`), tout en MAJUSCULES, taille tres petite (`text-[10px]`), tracking large (espacement lettres)
- **A droite du label** : icone de personnes (rouge) + badge compteur rouge (nombre d'assignations actives)
- **Liste des entrees** : chaque entree est une ligne horizontale avec :

```
┌─ barre coloree (3px, verte) ──────────────────────────────────────────┐
│  6:00   John Doe                                              [T1]   │
│  PM     06254989796                                                   │
│         3 Guests / Main Room                                          │
└───────────────────────────────────────────────────────────────────────┘
```

- **Barre coloree a gauche** : fine barre verticale de 3px sur toute la hauteur de l'entree. Verte pour les tables en service.
- **Colonne heure (extreme gauche)** : heure en gras sur une ligne ("6:00"), "PM" en dessous, taille petite. La colonne fait ~45-50px.
- **Colonne infos (centre)** : Nom en gras (texte principal), numero de telephone en dessous (texte muted), "3 Guests / Main Room" en dessous (texte muted). Des petites icones decoratives (etoile, checkmark) peuvent apparaitre a cote du nom.
- **Badge table (extreme droite)** : Le numero de table dans un badge arrondi (`rounded-lg`). Fond colore selon le statut : vert pour occupe (`bg-status-success/20 text-status-success`). Le badge fait environ 28-32px.

**POUR NOTRE CODE** : Mapper ainsi :

- Heure = `formatTime(assignment.started_at)`
- Nom = `assignment.server?.full_name`
- Sous le nom = `assignment.server?.role` + `·` + nom de la zone
- Badge = `assignment.table?.display_name || assignment.table?.table_number`
- Barre gauche = verte (`border-l-status-success`)
- On n'a pas de telephone ni "3 Guests" — remplacer par role + zone

#### B3. Section "UPCOMING" (= "Commandes pretes" dans notre code)

- **Label "UPCOMING"** : meme style que SEATED — ROUGE/CORAIL, majuscules, petite taille
- **Badge compteur** : rouge aussi
- **Entrees** : meme structure que SEATED mais les badges table sont JAUNES/ORANGE au lieu de vert (`bg-status-warning/20 text-status-warning`)
- La barre de gauche est jaune/orange aussi

**POUR NOTRE CODE** : Mapper les `readyOrders` existantes :

- Heure = temps depuis creation
- Nom = "Table " + `order.table_number`
- Sous le nom = nombre d'articles
- Badge = numero de table en jaune
- Barre gauche = jaune (`border-l-status-warning`)
- Bouton "Livre" existant en bas de chaque entree

#### B4. Section "Disponibles" (serveurs disponibles)

- Pas visible sur l'image de reference mais ON LA GARDE dans notre code
- Meme style de section avec label en bleu (`text-status-info`), majuscules
- Liste des serveurs avec avatar rond + nom + role

---

### C. COLONNE DROITE — ZONE TABS + GRILLE DE TABLES

#### C1. Zone Tabs (ligne horizontale en haut de la colonne droite)

L'image montre des tabs avec :

- Noms de zones : "Main Room", "Patio", "Terrace"
- Chaque tab a un petit **badge colore CARRE arrondi** a cote du nom. Les couleurs des badges sont DIFFERENTES pour chaque zone (vert, bleu, rouge). Ce sont des petits indicateurs de ~14x14px.
- Le tab actif a un texte plus lumineux (blanc/clair)
- Les tabs inactifs ont un texte muted
- Pas de fond rempli ni de bordure sur les tabs — ils sont sur fond transparent
- **A droite des tabs, sur la meme ligne** : icone horloge + "30 min" puis "80% Full" avec icone capacite

**POUR NOTRE CODE** :

- Garder les boutons `activeZoneId` existants
- Retirer le fond/bordure des tabs : fond transparent, juste texte + badge
- Tab actif : texte `text-app-text` (lumineux) + badge colore
- Tab inactif : texte `text-app-text-muted`
- Le badge d'occupation (ex: "3/8") reste dans un petit rectangle arrondi
- Les stats (avgDuration + stats.pct) sont positionnes a droite des tabs avec `ml-auto`

#### C2. Grille de Tables (ELEMENT LE PLUS CRITIQUE)

La grille fait **4 colonnes maximum** sur desktop, 3 sur tablette, 2 sur mobile. L'espacement entre les cartes est GENEREUX (environ 20-24px, soit `gap-5` ou `gap-6`).

Les tables sont arrangees en colonne par zone. Dans l'image on voit :

- Colonne 1 : T1, T2, T3 (empilees verticalement)
- Colonne 2 : T12, T5 (espace entre)
- Colonne 3 : grande table au milieu (T6), T7, T8
- Colonne 4 : T9, T10, T11

Chaque table est une carte avec des chaises autour.

---

### D. CARTE DE TABLE (element le plus important — a reproduire exactement)

Voici la structure EXACTE d'une carte de table 2 places (T1, T2, T11, T12) :

```
        ╭──╮  ╭──╮               ← 2 chaises haut (rectangles courts, quasi colles a la carte)
     ┌──────────────────┐
     │ T1               │        ← Numero de table, haut-gauche, petit, gras
     │                  │
     │ John Doe         │        ← Nom, centre-bas de la carte, gras
     │ Occupied         │        ← Statut en vert, juste sous le nom
     └──────────────────┘
        ╰──╯  ╰──╯               ← 2 chaises bas (memes rectangles)
```

Carte de table 4+ places (T5, T3, T6) — avec chaises laterales :

```
           ╭──╮  ╭──╮
      ┌──────────────────┐
 ╭─╮  │ T5               │  ╭─╮
 │ │  │                   │  │ │   ← 1 chaise de chaque cote (rectangle vertical)
 ╰─╯  │ Cathy            │  ╰─╯
      │ Reserved          │
      │ 8:30              │
      └──────────────────┘
           ╰──╯  ╰──╯
```

IMPORTANT sur les proportions :

- Les chaises sont PETITES par rapport a la carte (environ 1/8e de la largeur de la carte)
- Elles sont PROCHES de la carte (1-2px de gap)
- Elles sont CENTREES par rapport a la carte
- La carte fait environ 3x plus haute que large pour les rectangles de chaises

#### D1. Dimensions et forme des chaises (NON NEGOCIABLE)

Les chaises sont des PETITES BARRES COMPACTES arrondies, vues de dessus (plan de table). Chaque chaise fait environ 1/6e de la largeur de la carte. Les coins sont BIEN arrondis (borderRadius: 4px), donnant une forme de barre arrondie compacte — ni un rectangle brut, ni une capsule complete.

**Forme : BARRE COMPACTE aux coins bien arrondis (`borderRadius: 4`) — NON NEGOCIABLE**

**Chaises horizontales (haut et bas de la table) :**

- Largeur : 24px (`style={{ width: 24 }}`)
- Hauteur : 8px (`style={{ height: 8 }}`)
- Coins : `borderRadius: 4` (bien arrondi, compact, forme de barre arrondie)
- Ratio largeur:hauteur = 3:1
- Elles sont compactes et bien visibles — petites barres arrondies vues de dessus

**Chaises verticales (gauche et droite, pour tables 4+ places) :**

- Meme barre pivotee : largeur 8px, hauteur 24px
- `style={{ width: 8, height: 24, borderRadius: 4 }}`

**Espacement entre les chaises :**

- Horizontal : `gap: 5px` entre chaises cote a cote
- Vertical : `gap: 4px` entre chaises empilees

**Distance chaise → bord de la carte :**

- Quasi collees : 2px de gap (`style={{ marginBottom: 2 }}` et `style={{ marginTop: 2 }}`)
- Les chaises sont quasi collees a la carte avec un micro-espace a peine visible

**Nombre de chaises selon la capacite (reprendre `getChairLayout` existant) :**

- 2 places : 1 haut, 1 bas, 0 gauche, 0 droite
- 4 places : 1 haut, 1 bas, 1 gauche, 1 droite
- 6 places : 2 haut, 2 bas, 1 gauche, 1 droite
- 8 places : 2 haut, 2 bas, 2 gauche, 2 droite
- etc. (la logique `getChairLayout` existante est correcte, ne pas la changer)

#### D2. Couleurs des chaises (IDENTIQUES a la barre de statut)

La couleur des chaises est TOUJOURS identique a la couleur de la barre gauche de la carte :

- **Occupe** : VERT vif — utiliser `bg-emerald-400` (clair, lumineux, pas sombre)
- **Reserve/Commande prete** : JAUNE — utiliser `bg-amber-400`
- **Vacant** : GRIS moyen — utiliser `bg-gray-500/40` ou `bg-app-text-muted/40`

IMPORTANT : Sur fond sombre, les couleurs doivent etre LUMINEUSES et SATUREES (emerald-400, amber-400), pas des tons sombres (emerald-700). C'est ce qui donne le rendu vibrant de l'image de reference.

#### D3. Carte (surface de la table)

- **Fond** : gris moyen-fonce, NETTEMENT VISIBLE sur le fond de page (contraste clair). Utiliser `bg-app-elevated/80` ou `bg-app-card`. La carte doit se distinguer clairement du fond.
- **Coins** : `rounded-lg` (8px) — PAS `rounded-xl`. Arrondis moderes, comme sur l'image.
- **Bordure** : PAS de bordure visible sur les 4 cotes. SEULEMENT une barre coloree a GAUCHE de 3-4px (`border-l-[3px]` ou `border-l-4`)
  - Verte (`border-l-emerald-400`) si occupe
  - Jaune (`border-l-amber-400`) si reserve/commande prete
  - Transparente (`border-l-transparent`) si vacant
- **Dimensions** : laisser la grille gerer la largeur. Hauteur minimum : `min-h-[120px]`
- **Ombre** : aucune ombre visible. Le contraste fond/carte suffit.

#### D4. Contenu de la carte

**En haut a gauche** :

- Numero de table en gras, petit (`text-sm font-bold`)
- Couleur : texte principal (`text-app-text`)

**Au centre-bas** :

- Nom de la personne (serveur dans notre cas) : `text-xs font-semibold text-app-text`
- Statut sous le nom : `text-[11px] font-bold`
  - "Occupied" en vert (`text-status-success` ou `text-emerald-400`)
  - "Vacant" en gris (`text-app-text-muted`)
  - "Reserved" en jaune (`text-amber-400`) avec l'heure en dessous

**Pour les tables VACANTES dans notre code** :

- Afficher "Vacant" en gris au centre
- Le Select dropdown existant pour assigner un serveur — le garder mais styliser avec fond transparent, petit

#### D5. Rendu par statut (resume visuel)

**Table OCCUPEE (isAssigned === true)** :

- Chaises : vertes
- Barre gauche : verte
- Contenu : nom du serveur + "Occupied" en vert
- Fond carte : `bg-app-elevated/70`

**Table VACANTE (isAssigned === false, pas de commande prete)** :

- Chaises : grises
- Pas de barre gauche (ou transparente)
- Contenu : "Vacant" en gris + Select serveur
- Fond carte : `bg-app-elevated/50` (un peu plus sombre que occupe)

---

## MAPPING COMPLET : Image → Code existant

| Element de l'image      | Donnee dans le code                         | Ou dans le JSX            |
| ----------------------- | ------------------------------------------- | ------------------------- |
| Top bar titre           | `t('title')` ("Service")                    | Header h1                 |
| Stats "30 min"          | `avgDuration`                               | Pill dans header          |
| Stats "80% Full"        | `stats.pct`                                 | Pill dans header          |
| Stats "X/Y tables"      | `stats.occupied`/`stats.total`              | Pill dans header          |
| Sidebar recherche       | `sidebarSearch` + `setSidebarSearch`        | Input en haut sidebar     |
| Section "SEATED"        | `filteredAssignments`                       | Liste dans sidebar        |
| Entree seated : heure   | `formatTime(a.started_at)`                  | Colonne gauche            |
| Entree seated : nom     | `a.server?.full_name`                       | Colonne centre            |
| Entree seated : details | `a.server?.role` + zone name                | Sous le nom               |
| Entree seated : badge   | `a.table?.display_name`                     | Badge droite vert         |
| Section "UPCOMING"      | `readyOrders`                               | Liste dans sidebar        |
| Entree upcoming : heure | `order.created_at` age                      | Colonne gauche            |
| Entree upcoming : nom   | `"Table " + order.table_number`             | Colonne centre            |
| Entree upcoming : badge | `order.table_number`                        | Badge droite jaune        |
| Bouton "Livre"          | `handleMarkDelivered`                       | Bouton dans entree        |
| Section "Disponibles"   | `availableServers`                          | Troisieme section sidebar |
| Zone tabs               | `zones` + `activeZoneId`                    | Tabs horizontaux          |
| Badge zone tab          | `zoneStats[zone.id]`                        | Badge dans chaque tab     |
| Grille tables           | `filteredZones` > `activeTables`            | Grid responsive           |
| Carte table occupee     | `table` + `getAssignmentForTable(table.id)` | VisualTable component     |
| Chaises                 | `getChairLayout(table.capacity)`            | ChairRow component        |
| Nom sur carte           | `assignment.server?.full_name`              | Dans VisualTable          |
| "Occupied"              | `t('occupied')`                             | Texte statut vert         |
| "Vacant"                | `t('vacant')`                               | Texte statut gris         |
| Select serveur          | `onAssign` + `servers`                      | Select dans carte vacante |
| Bouton release (X)      | `onRelease(assignment.id)`                  | Bouton hover sur carte    |
| Section mobile          | Sections `@md:hidden` existantes            | Bas de page mobile        |

---

## INSTRUCTIONS TECHNIQUES

### Fichier a modifier

`src/components/admin/ServiceManager.tsx`

### Ce que tu NE touches PAS

- Tous les imports
- Tous les types et interfaces (Props, ZoneWithTables)
- Toutes les fonctions helper (formatTime, getElapsedMinutes, getChairLayout)
- Tout le corps de `ServiceManager` SAUF le JSX return
- Les hooks, state, effects, handlers, callbacks, useMemo
- La logique de loading skeleton (tu peux adapter son style)

### Ce que tu MODIFIES

1. **`ChairShape` et `ChairRow`** : Les chaises sont des BARRES COMPACTES arrondies (borderRadius: 4px) :
   - Horizontal : `style={{ width: 24, height: 8, borderRadius: 4 }}`
   - Vertical : `style={{ width: 8, height: 24, borderRadius: 4 }}`
   - Gap entre chaises : `style={{ gap: 5 }}` horizontal, `style={{ gap: 4 }}` vertical
   - Couleurs vives : `bg-emerald-400` (occupe), `bg-amber-400` (reserve), `bg-gray-500/40` (vacant)
   - 2px de gap entre chaises et carte (`style={{ marginBottom: 2 }}`)

2. **`VisualTable`** : Revoir le layout complet de la carte :
   - Structure verticale : chaises haut (mb-1) → conteneur horizontal [chaises gauche | carte | chaises droite] → chaises bas (mt-1)
   - Les chaises sont PROCHES de la carte (gap de 4px soit `mb-1`/`mt-1`), PAS eloignees
   - La carte utilise `bg-app-elevated/80` ou `bg-app-card`, `rounded-lg` (PAS rounded-xl), `border-l-[3px]`, `min-h-[120px]`
   - Bordure gauche coloree : `border-l-emerald-400` (occupe), `border-l-amber-400` (reserve), `border-l-transparent` (vacant)
   - PAS de bordure sur les 3 autres cotes (ou tres subtile `border-app-border/20`)
   - Numero de table haut-gauche (`text-sm font-bold`)
   - Nom centre-bas, statut sous le nom en couleur vive
   - Couleurs des statuts LUMINEUSES sur fond sombre : `text-emerald-400`, `text-amber-400`, `text-app-text-muted`

3. **`SidebarEntry`** : Ajouter une barre coloree a gauche de chaque entree (`border-l-[3px] border-l-status-success`). Heure a gauche dans une colonne fixe. Badge table a droite avec fond colore.

4. **Layout de la sidebar** : Fond plus integre au background (`bg-app-card/30` ou `bg-app-bg`), bordure droite subtile au lieu d'un fond card distinct. Largeur : `w-72` en `@md`, `w-80` en `@lg`.

5. **Section labels** : Les labels "SEATED" (En Service), "UPCOMING" (Commandes pretes), "Disponibles" doivent etre en couleur ROUGE/CORAIL pour les deux premiers (`text-rose-400` ou `text-red-400`), BLEU pour le troisieme (`text-status-info`). Tout en MAJUSCULES, `text-[10px]`, `tracking-[0.15em]`.

6. **Zone tabs** : Retirer les fonds/bordures des tabs. Fond transparent. Tab actif = texte lumineux. Tab inactif = texte muted. Badges colores a cote de chaque nom de zone. Stats a droite des tabs (`ml-auto`).

7. **Grille** : `grid-cols-2 @sm:grid-cols-3 @xl:grid-cols-4` (PAS de 5e colonne). Gap : `gap-5` ou `gap-6`. Retirer les separateurs de zone (les h-px dividers).

8. **Commandes pretes sidebar** : Style jaune/orange au lieu de vert. Badge jaune. Barre gauche jaune.

### Variables de theme a utiliser

| Usage                                 | Classe Tailwind                                                |
| ------------------------------------- | -------------------------------------------------------------- |
| Fond page                             | `bg-app-bg`                                                    |
| Fond carte table                      | `bg-app-elevated/80` ou `bg-app-card`                          |
| Fond sidebar                          | `bg-app-card/30` ou `bg-app-bg`                                |
| Fond badge occupe                     | `bg-emerald-400/15`                                            |
| Fond badge reserve/pret               | `bg-amber-400/15`                                              |
| Texte principal                       | `text-app-text`                                                |
| Texte secondaire                      | `text-app-text-secondary`                                      |
| Texte muted                           | `text-app-text-muted`                                          |
| Vert occupe (chaises, barre, texte)   | `text-emerald-400` / `bg-emerald-400` / `border-l-emerald-400` |
| Jaune reserve (chaises, barre, texte) | `text-amber-400` / `bg-amber-400` / `border-l-amber-400`       |
| Gris vacant (chaises)                 | `bg-gray-500/40`                                               |
| Rouge labels sections                 | `text-rose-400`                                                |
| Bleu disponible                       | `text-status-info`                                             |
| Bordure subtle                        | `border-app-border/50`                                         |
| Coins carte table                     | `rounded-lg` ou `style={{ borderRadius: 8 }}`                  |
| Coins chaises                         | `style={{ borderRadius: 3 }}` (rectangle legerement arrondi)   |
| Gap chaise-carte                      | 3px (`style={{ marginBottom: 3 }}`) — quasi collees            |

### Regles a respecter

- Mobile-first (styles base pour mobile, puis prefixes responsive)
- Pas de `h-screen` — utiliser `h-full` (cf. `08-viewport-production.md`)
- Pas de `overflow-y-auto` sauf sur le conteneur scrollable principal
- Touch targets minimum `min-h-[44px]` sur les boutons
- Pas de `text-[10px]` sur elements interactifs (cf. `03-responsive-design.md`)
- Pas de `any` TypeScript
- Pas de `console.log` — utiliser `logger`
- Pas de caracteres Unicode speciaux dans les strings

### Apres modification, lancer

```bash
pnpm typecheck && pnpm lint && pnpm format
```
