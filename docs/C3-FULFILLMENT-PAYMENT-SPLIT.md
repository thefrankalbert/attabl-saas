# C3 - Cadrage : split statut fulfillment / paiement

> Dossier de **cadrage** (pas d'implementation). Issu de la refonte commande->paiement
> (`docs/AUDIT-CYCLE-COMMANDE-PAIEMENT.md`), ou C3 / Phase 3 a ete differe en place.
> Objectif : poser le probleme, les options, et les points de decision a trancher avant
> de coder. L'approche sera choisie ensemble dans une session dediee.

## 1. Le probleme

Aujourd'hui `orders.status` est une **seule colonne surchargee** qui melange deux axes
independants : l'avancement en cuisine/service (fulfillment) ET le fait que payer une
commande **force `status='delivered'`**.

Consequence directe : deux etats parfaitement valides sont **impossibles a representer** :

- **Servi mais pas paye** : le client mange, l'addition n'est pas encore reglee.
- **Paye mais pas servi** : prepaiement / commande a emporter reglee d'avance.

C'est exactement le cas d'usage restaurant "addition a table" que la refonte visait.

## 2. Etat actuel (les 2 machines, couplees)

### `orders.status` - CHECK a 7 valeurs

`pending, confirmed, preparing, ready, delivered, served, cancelled`

- L'app n'ecrit JAMAIS `confirmed` ni `served` (la DB les autorise, code mort).
- Progression applicative via `ORDER_STATUS_RANK` (`order.service.ts:86`) :
  `pending(0) -> preparing(1) -> ready(2) -> delivered(3)`.
- Type TS plus etroit (`admin.types.ts:18`) : `pending|preparing|ready|delivered|cancelled`.

### `orders.payment_status` - CHECK a 4 valeurs

`pending, paid, partial, refunded` (la refonte a ajoute `partial`).

- Derive du **ledger `payments`** (append-only) via `payment.service.ts deriveStatus()`.
  C'est l'argent qui pilote le statut paiement, jamais l'inverse - bon design.

### Les 3 points de couplage a casser

Payer ecrit `status='delivered'` ici :

1. `src/services/order.service.ts:784` - `markPaid()` met `status:'delivered'`.
2. `src/services/payment.service.ts:174` - `recompute()` met `status:'delivered'` quand la
   commande devient `paid`.
3. `src/app/api/orders/pos/route.ts:40` - ecriture conditionnelle du statut au paiement POS.

Chaque point porte deja un commentaire "Phase 3 / interim" expliquant le couplage volontaire
(sinon une commande payee resterait sur le board KDS actif).

### Ce qui existe DEJA (a reutiliser, ne pas reinventer)

- **Fulfillment fin par item** : `order_items.item_status` (`pending/preparing/ready/served`)
  - `held` / `fired_at` (coursing). Pilote par `setItemStatus` / `setCourseHeld`.
- **`table_sessions`** (`open/closed`) : l'addition par table. `closeSessionIfFullySettled`
  (`order.service.ts:105`) ferme la session quand toutes ses commandes sont payees.
- Donc le "servi" existe deja au niveau **item**, jamais au niveau **commande**. C'est le
  trou que C3 comble.

## 3. Les options

### Option A - Split complet (renommage)

`orders.status` -> `orders.fulfillment_status` + enum propre (`pending -> preparing -> ready
-> served`), paiement totalement decouple.

- **Touche ~36 fichiers** : colonne DB, RPC `create_order_with_items` recreee, types generes,
  `admin.types.ts`, `design-tokens.ts`, services, routes API (orders / pos / claim), toutes
  les lectures UI (POS `OrdersClient`/`OrderDetails`, KDS `KDSTicket`/`FooterSummaryBar`,
  tracking client `order-confirmed`/`ClientOrders`), hooks, tous les tests de transition.
- **+** : le plus propre a terme, une seule source de verite par axe.
- **-** : gros big-bang, migration cassante, surface de regression maximale (1 seul tenant).

### Option B - Decouplage minimal (recommande pour demarrer)

Garder `orders.status` mais **arreter de forcer `delivered` au paiement** (retirer les 3
couplages). Deriver le fulfillment de la commande depuis `order_items.item_status` :
commande consideree "servie" quand tous ses items sont `served`. Ajouter `orders.served_at`
(timestamp) pour la lisibilite. Le paiement vit purement sur `payment_status`.

- **Touche peu** : 3 points de decouplage + logique de derivation "tous items servis" +
  ajout `served_at` + ajuster le filtre du board KDS (servi-impaye doit RESTER visible) +
  tests.
- **+** : petit, peu cassant, **debloque immediatement** les 2 etats manquants. Reutilise
  `item_status` deja en place.
- **-** : `orders.status` reste semantiquement charge (mais plus pilote par le paiement) ;
  la valeur `delivered` devient ambigue (a clarifier : la mapper a "servi" ?).

### Option C - Colonne additive incrementale

Ajouter `orders.fulfillment_status` **a cote** de `status`, dual-write transitoire, migrer
les lectures UI une par une, puis dropper `status` plus tard.

- **+** : le plus sur, reversible a chaque etape, pas de big-bang.
- **-** : periode de double-ecriture a maintenir, 2 colonnes a synchroniser le temps de la
  transition (risque de divergence si un chemin oublie le dual-write).

## 4. Recommandation

**Demarrer par B** (decouplage minimal) : c'est le plus petit pas qui rend les 2 etats
manquants representables, en reutilisant `item_status` deja en place. Si l'experience
montre qu'on a besoin d'un vrai enum fulfillment distinct, **evoluer vers C** (additif)
puis A. **Eviter A en big-bang.**

## 5. Points de decision a trancher ensemble

1. **Enum fulfillment** : on garde les valeurs `status` actuelles ou on en definit un propre
   (`pending/preparing/ready/served`) ? Sort-on `delivered` au profit de `served` ?
2. **Derivation order-level** : "commande servie" = tous les items `served` ? Et "prete" =
   tous `ready` ? Qui ecrit `served_at` (KDS au dernier item servi, ou action serveur) ?
3. **Board KDS** : une commande **payee-mais-pas-servie** doit RESTER sur le board actif
   (sinon la cuisine la perd). Quel filtre exact remplace "status != delivered" ?
4. **Back-compat** : `delivered` existe sur 106 commandes prod. On le mappe a quoi
   (`served` ?) lors de la migration ?
5. **UI double badge** : afficher 2 badges (fulfillment + paiement) sur OrderDetails /
   OrdersClient / tracking client ? Impact `design-tokens.ts` (ajouter styles `confirmed`,
   `served`).
6. **`table_sessions`** : la fermeture de session reste pilotee par `payment_status` seul
   (deja le cas) - aucune dependance au fulfillment. A confirmer.

## 6. Effort / risque (estimation)

| Option                  | Effort              | Risque regression | Migration                   |
| ----------------------- | ------------------- | ----------------- | --------------------------- |
| A - split complet       | Gros (~36 fichiers) | Eleve             | Cassante (renommage)        |
| B - decouplage minimal  | Petit-Moyen         | Faible-Moyen      | Additive (`served_at`)      |
| C - additif incremental | Moyen (etale)       | Faible            | Additive (nouvelle colonne) |

## 7. Hors-scope (rappel)

- Phase 4 PaymentProvider / PSP mobile money : decision produit, hors C3.
- Le ledger `payments` et la derivation `payment_status` ne changent PAS - ils sont deja bons.

---

_Prochaine etape : choisir l'option (reco B) + trancher les 6 points de la section 5, puis
ouvrir une session d'implementation dediee._
