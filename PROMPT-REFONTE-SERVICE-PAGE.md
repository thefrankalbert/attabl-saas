# PROMPT DE REFONTE — Page Service (ServiceManager.tsx)

## Contexte

Tu dois faire une refonte complete du composant `src/components/admin/ServiceManager.tsx` pour que son design corresponde exactement a l'image de reference ci-dessous. Tu adaptes UNIQUEMENT le design visuel et la disposition (layout). Tu gardes TOUTES les features existantes (assignations, commandes pretes, serveurs disponibles, zones, realtime, recherche). Tu ne crees PAS de nouvelles features (pas de reservations, pas de date picker, pas de bouton "New Reservation").

## Image de reference — Description detaillee de la disposition

L'image montre un dashboard sombre avec un layout en 2 colonnes :

### LAYOUT GLOBAL

```
┌──────────────────────────────────────────────────────────────────────┐
│  [RESERVATION] [WAITING]   < Thu, Jan 19 >  Dinner v   [icons] [+] │  ← TOP BAR
├─────────────────────┬────────────────────────────────────────────────┤
│                     │  Main Room [3]  Patio [2]  Terrace [1]        │  ← ZONE TABS
│  Search Guest       │  ⏱ 30 min          80% Full                  │  ← STATS
│─────────────────────│────────────────────────────────────────────────│
│  SEATED        🔴 18│                                                │
│                     │   ╭─╮ ╭─╮       ╭─╮ ╭─╮       ╭─╮ ╭─╮       │  ← CHAISES TOP
│  6:00  John Doe  T1 │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  PM    0625...      │  │ T1       │  │ T12      │  │          │   │
│        3 Guests     │  │ John Doe │  │          │  │  Vacant  │   │
│                     │  │ Occupied │  │          │  │          │   │
│  6:10  Emma C.  T2  │  └──────────┘  └──────────┘  └──────────┘   │  ← CARTES TABLES
│  PM    0625...      │   ╰─╯ ╰─╯       ╰─╯ ╰─╯       ╰─╯ ╰─╯       │  ← CHAISES BOTTOM
│        3 Guests     │                                                │
│                     │   ╭─╮           ╭─╮ ╭─╮       ╭─╮ ╭─╮       │
│  6:20  David J. T11 │  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  ...                │  │ T2       │  │ T6       │  │ T9       │   │
│                     │  │ Emma C.  │  │ David J. │  │ Sarah K. │   │
│  UPCOMING      🔴 7 │  │ Occupied │  │ Occupied │  │ Reserved │   │
│                     │  └──────────┘  └──────────┘  └──────────┘   │
│  8:15  Sarah K. T9  │   ╰─╯           ╰─╯ ╰─╯       ╰─╯ ╰─╯       │
│  PM    0625...      │                                                │
│        3 Guests     │  (... plus de tables en grille ...)           │
│                     │                                                │
│  8:30  Cathy C. T6  │                                                │
│                     │                                                │
└─────────────────────┴────────────────────────────────────────────────┘
```

### COLONNE GAUCHE — SIDEBAR (environ 280px fixe)

La sidebar est une colonne fixe a gauche avec fond sombre uni (pas de card, elle fait partie du fond general). Elle contient :

1. **Barre de recherche** en haut : input avec placeholder "Search Guest", fond legerement plus clair que le fond, coins arrondis.

2. **Section "SEATED"** (correspond a "En service" dans notre code) :
   - Label "SEATED" en rouge/corail (couleur d'accent), tout en majuscules, petite taille
   - A droite du label : icone de personnes + nombre total en badge rouge
   - Liste des entrees, chaque entree contient :
     - **A gauche** : l'heure (ex: "6:00 PM") en gras, empilee verticalement
     - **Au centre** : nom en gras (ex: "John Doe"), en dessous un numero de telephone, en dessous "3 Guests / Main Room"
     - **A droite** : badge avec le numero de table (ex: "T1") sur fond colore (vert pour occupe)
     - Une petite barre coloree a GAUCHE de chaque entree (vert = en service, jaune = a venir)

3. **Section "UPCOMING"** (correspond a "Commandes pretes" dans notre code) :
   - Meme structure que SEATED mais avec label en rouge/corail
   - Les entrees futures ont un badge jaune/orange au lieu de vert
   - Icone de personnes + nombre a droite du label

### COLONNE DROITE — ZONE PRINCIPALE (flex-1)

#### Zone Tabs (en haut de la colonne droite)

- Tabs horizontaux : "Main Room", "Patio", "Terrace"
- Chaque tab a un petit badge colore a droite indiquant le nombre
- Tab actif : texte blanc sur fond transparent avec un indicateur
- Les badges sont de couleurs differentes selon la zone (vert, bleu, rouge)
- A droite des tabs : statistiques inline "⏱ 30 min" et "80% Full"

#### Grille de Tables

- Les tables sont disposees en **grille de 3-4 colonnes** (pas 5)
- Espacement genereux entre les cartes

#### CARTE DE TABLE (element le plus important) :

Chaque carte de table a cette structure precise :

```
      ╭───╮  ╭───╮           ← Chaises du haut (rectangles arrondis LARGES)
   ┌─────────────────┐
   │                 │
   │  T1             │       ← Numero de table en haut a gauche
   │                 │
   │  John Doe       │       ← Nom du serveur/client au centre-bas
   │  Occupied       │       ← Statut en vert/jaune/gris sous le nom
   │                 │
   └─────────────────┘
      ╰───╯  ╰───╯           ← Chaises du bas (rectangles arrondis LARGES)
```

**Details critiques des cartes :**

- Fond : gris fonce semi-transparent avec leger effet de profondeur
- Coins : bien arrondis (border-radius ~12px)
- Pas de bordure visible SAUF une barre coloree a gauche (3-4px)
  - Vert brillant (#4ade80 ou similaire) si occupe
  - Jaune/orange si reserve
  - Pas de barre si vacant
- Dimensions : environ 160-180px de large, 130-140px de haut
- Les chaises en haut et en bas sont des **rectangles arrondis epais et larges** (environ 28-32px de large, 8-10px de haut), pas des petits points fins
- Les chaises ont la meme couleur que la barre de statut (vert si occupe, gris si vacant)
- Le numero de table (T1, T2...) est en haut a gauche en petit, gras
- Le nom de la personne est plus bas, taille moyenne, gras
- Le statut ("Occupied", "Vacant", "Reserved") est sous le nom en petite taille, colore selon le statut
- Pour les tables vacantes : pas de nom, juste "Vacant" en gris
- Pour les tables reservees : nom + "Reserved" en jaune + heure de reservation en dessous

**Couleurs des statuts sur les cartes :**

- Occupied : barre gauche verte, chaises vertes, texte "Occupied" vert
- Vacant : pas de barre, chaises grises, texte "Vacant" gris
- Reserved : barre gauche jaune, chaises jaunes, texte "Reserved" jaune (avec heure)

**Chaises laterales (gauche/droite) :**

- Pour les tables 4+ places : des chaises verticales apparaissent aussi sur les cotes gauche et droit
- Meme style rectangle arrondi mais oriente verticalement (8-10px large, 28-32px haut)

---

## Mapping des features existantes vers le design de reference

| Design reference                     | Feature actuelle a garder                    | Adaptation                                     |
| ------------------------------------ | -------------------------------------------- | ---------------------------------------------- |
| Section "SEATED" dans sidebar        | `filteredAssignments` (assignations actives) | Renommer visuellement, garder la logique       |
| Section "UPCOMING" dans sidebar      | `readyOrders` (commandes pretes)             | Adapter le style des entrees                   |
| Badge table (T1, T2...) dans sidebar | `assignment.table.display_name`              | Badge colore a droite de chaque entree         |
| Statut "Occupied" sur carte          | `isAssigned === true`                        | Barre verte + chaises vertes + texte vert      |
| Statut "Vacant" sur carte            | `isAssigned === false`                       | Pas de barre + chaises grises + texte gris     |
| Nom sur la carte                     | `assignment.server.full_name`                | Affiche au centre-bas de la carte              |
| Select serveur sur carte vacante     | `Select` component existant                  | Garder mais adapter au style                   |
| Zone tabs                            | Logique `activeZoneId` + `zoneStats`         | Adapter le style des tabs                      |
| Stats (30 min, 80% Full)             | `avgDuration` + `stats.pct`                  | Repositionner a droite des zone tabs           |
| Serveurs disponibles                 | Section `availableServers`                   | Garder dans sidebar sous les 2 autres sections |
| Recherche                            | `sidebarSearch`                              | Garder en haut de sidebar                      |
| Section mobile                       | Sections `@md:hidden` existantes             | Garder tel quel pour mobile                    |

---

## Instructions techniques precises

### Fichier a modifier

`src/components/admin/ServiceManager.tsx`

### Choses a NE PAS toucher

- Toute la logique de state (useState, useEffect, useMemo, useCallback)
- Les hooks (useAssignments, useAssignServer, useReleaseAssignment, useRealtimeSubscription)
- Les fonctions helper (formatTime, getElapsedMinutes, getChairLayout)
- Le data fetching (fetchData, loadReadyOrders)
- Les handlers (handleAssign, handleRelease, handleMarkDelivered)
- Les computed data (stats, zoneStats, filteredZones, availableServers, avgDuration, filteredAssignments)
- Les types et imports

### Choses a MODIFIER (design uniquement)

1. **ChairRow / ChairShape** : Les chaises doivent etre des rectangles arrondis EPAIS et LARGES (pas des petits points de 5-7px). Dimensions cibles : horizontal 28-32px large x 8-10px haut, vertical 8-10px large x 28-32px haut. `rounded-md` au lieu de `rounded-sm`.

2. **VisualTable** : Revoir completement le layout de la carte :
   - Les chaises en haut/bas sont EN DEHORS de la carte (pas a l'interieur)
   - La carte elle-meme a un fond `bg-app-elevated/60` avec `backdrop-blur-sm`
   - Bordure gauche coloree de 3-4px selon le statut
   - Le numero de table est en haut a gauche
   - Le nom du serveur est au centre de la carte
   - Le statut est sous le nom
   - Dimensions minimum : `min-h-[130px]`
   - `rounded-xl` pour les coins
   - Pas de bordure visible sauf la barre de statut a gauche

3. **Sidebar** :
   - Largeur fixe plus grande : `w-72` minimum, `w-80` en `@lg`
   - Fond integre au background (utiliser `bg-app-bg/80` ou `bg-app-card/40` au lieu de `bg-app-card`)
   - La barre de recherche avec `Search Guest` placeholder
   - Section "SEATED" (= En Service) avec label en couleur d'accent (utiliser `text-status-error` ou `text-accent` pour le rouge/corail)
   - Chaque entree de la sidebar : heure a gauche, nom + details au centre, badge table a droite
   - Badge table colore (vert pour occupe, jaune pour commande prete)
   - Ajouter une barre fine coloree a gauche de chaque entree sidebar
   - Section "UPCOMING" (= Commandes pretes) meme style

4. **Zone Tabs** :
   - Badges colores a droite de chaque nom de zone
   - Stats (duree moyenne + % capacite) a droite des tabs sur la meme ligne
   - Les tabs n'ont PAS de bordure — fond transparent ou legerement sureleve pour le tab actif

5. **Grille de tables** :
   - Maximum 4 colonnes en desktop (`@xl:grid-cols-4`), pas 5
   - Gap plus genereux : `gap-4 sm:gap-5`
   - Pas de separateur de zone (retirer le divider avec h-px)

6. **Header** :
   - Le titre "Service" et les stats sont sur la meme ligne
   - Les stats sont a droite (ml-auto) dans des pills compacts

### Regles de style a respecter

- Utiliser UNIQUEMENT les classes Tailwind avec les variables du theme (`bg-app-*`, `text-app-*`, `border-app-*`, `text-status-*`, `bg-status-*`)
- Mobile-first : ecrire les styles base pour mobile, puis `sm:`, `md:`, `lg:`, `xl:`
- Respecter les regles de `08-viewport-production.md` : pas de `h-screen`, pas de `overflow-y-auto` sauf dans le conteneur scrollable principal
- Pas de `any` TypeScript
- Pas de `console.log`
- Pas de caracteres Unicode speciaux dans les strings

### Tests apres modification

Lancer dans cet ordre :

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm format`
4. Verifier visuellement sur 375px, 768px, 1280px
