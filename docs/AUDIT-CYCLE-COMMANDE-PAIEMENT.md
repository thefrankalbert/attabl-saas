# Audit approfondi - Cycle commande -> paiement (ATTABL)

> Statut: rapport d'audit (lecture seule). Date: 2026-06-29.
> Methode: 6 agents d'inspection specialises (intake, fulfillment/KDS, paiement,
> modele de donnees/RLS, cycle de vie/stock, recherche marche). Toutes les preuves sont
> citees `fichier:ligne` contre `origin/main` (95d8cf2). Aucun fichier applicatif modifie
> pendant l'audit.

## 1. Declencheur et perimetre

Un client commande au QR, la cuisine prepare et sert via le KDS, mais **la caisse ne voit
rien a facturer**. L'inspection montre que ce n'est pas un bug isole: c'est le symptome
d'un modele de domaine ad-hoc pour tout le cycle commande -> paiement. Perimetre audite:
prise de commande (QR, POS, serveur, room/delivery), tarification et verification de prix,
KDS / service / expedition, paiement / encaissement / facturation, modele de donnees + RLS,
stock, coupons, quota, annulation / remboursement, reporting.

## 2. Cause racine

**ATTABL modelise une commande comme un evenement isole "one-shot", avec UN seul champ
`status` surcharge, et SANS entite centrale "addition / ticket / table ouverte".**

Les systemes de reference (Toast, Square, Lightspeed, Foodics) sont construits autour du
**check / ticket / tab** (addition ouverte par table) auquel s'ajoutent des **rounds
d'items** dans le temps, regle une seule fois a la fin (split possible), via des **tenders**
(lignes de paiement). ATTABL a inverse ce modele:

- Une 2e commande sur une table dine-in occupee est **rejetee** (`TABLE_ACTIVE_ORDER`,
  `supabase/migrations/20260628010000_*.sql:89-101`, surface `src/services/order.service.ts:497-502`).
- A l'inverse, takeaway / delivery / room_service autorisent des doublons illimites (garde
  non appliquee).
- La caisse ne sait que **creer** de nouvelles ventes; aucune query ne charge les commandes
  existantes (`src/components/admin/POSClient.tsx`, `src/hooks/usePOSData.ts`). Encaisser une
  commande QR oblige a quitter le POS, ouvrir Commandes, ouvrir le detail, cliquer Encaisser
  (`src/components/admin/OrderDetails.tsx:320`). Re-saisir au POS cree un **doublon**.
- Le `status` unique melange 3 axes (cuisine / service / paiement). `markPaid` force
  `status='delivered'` (`src/services/order.service.ts:548-553`): impossible de representer
  "servi mais pas paye" ou "paye mais pas servi".

Tout le reste (table en texte libre, modifiers tarifes par nom, argent en float, absence de
tenders, annulation qui ne reverse rien) se greffe sur cette abstraction manquante.

## 3. Findings (par severite)

### CRITICAL

| #   | Finding                                                                                                           | Preuve                                                                                | Direction                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| C1  | Pas d'entite addition/ticket/table ouverte; chaque soumission = order isole; 2e tournee dine-in rejetee           | `20260628010000_*.sql:89-101`; `cart/page.tsx:322`                                    | Entite `table_session` + rounds rattaches + settlement unique                                    |
| C2  | La caisse ne peut pas facturer une commande existante (QR); cree toujours du neuf -> doublon                      | `POSClient.tsx:231-253`; `usePOSData.ts:435`                                          | Panneau "A encaisser" chargeant `payment_status='pending'` -> `PaymentModal(order)` + `markPaid` |
| C3  | Un seul `status` surcharge (cuisine+service+paiement); `markPaid` force `delivered`                               | `order.service.ts:548-553`; `ServiceManager.tsx:196`                                  | Axes orthogonaux `fulfillment_status` / `payment_status` / `served_at`                           |
| C4  | Pourboire double-compte sur commandes POS (total inclut le tip ET `tip_amount`, agregats `SUM(total+tip_amount)`) | `api/orders/route.ts:190` vs `api/orders/pos/route.ts:308-325`; `schema.sql:382,429`  | Unifier la semantique de `orders.total` (total HORS tip)                                         |
| C5  | Le CA compte les commandes non payees et remboursees; 3 definitions du CA coexistent                              | RPC `20260310000003:21-24`; dashboard `page.tsx:230` vs `page.tsx:37-43`              | Definir le CA une fois (payees uniquement), centraliser                                          |
| C6  | Destock non transactionnel (`after()`/fire-and-forget) et non idempotent                                          | `api/orders/route.ts:326-335`; `pos/route.ts:397-408`; `20260516140000_*.sql:101-165` | Garde d'idempotence + destock dans la TX ou outbox                                               |
| C7  | Annuler/supprimer ne reverse rien; DELETE physique detruit l'historique financier                                 | `order.service.ts:526-536`; `actions/orders.ts:94-111,126`                            | `cancelOrder` transactionnel (restock+unclaim) + soft-delete + snapshot                          |

### HIGH

| #   | Finding                                                                                                                            | Preuve                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| H1  | Argent en float; `toFixed(2)` faux pour XAF/XOF (zero-decimal)                                                                     | `tax.ts:26,40,73`; `coupon.service.ts:129`; `usePOSData.ts:335-342`         |
| H2  | Aucune table `payments`/`tenders`; `payment_status` enum mutable ecrase en place; pas de split/partiel/refund auditables           | `order.service.ts:543-567`; `schema.sql:1404-1410`                          |
| H3  | Derive du set de statuts: DB CHECK=7, TS=5, design-tokens=6; `confirmed`/`served` injoignables; `served` bloquerait la table a vie | `schema.sql:1413` vs `admin.types.ts:18` vs `design-tokens.ts:10-16`        |
| H4  | Modifiers/variants tarifes par NOM, pas par id (collision/renommage)                                                               | `order.service.ts:165,174,232,258`; `order.schema.ts:19-22`                 |
| H5  | Pas de validation conditionnelle du service_type ni des table/room/zone contre la DB                                               | `order.schema.ts:49-55`; `table-config.service.ts` jamais appele a l'intake |
| H6  | Claim serveur = last-write-wins (pas de `WHERE server_id IS NULL`)                                                                 | `assignment.service.ts:120-128`                                             |
| H7  | `markPaid` sans garde d'idempotence (double-tap re-stampe `paid_at`, ecrase le tip)                                                | `order.service.ts:558-562` vs garde POS `pos/route.ts:46`                   |
| H8  | Aucune piste d'audit des paiements; especes recues/monnaie jetees                                                                  | `PaymentModal.tsx:94-104`                                                   |
| H9  | `claim_coupon_usage`/`unclaim_coupon_usage` SECURITY DEFINER + EXECUTE anon sur compteur d'argent                                  | `schema.sql:79-97,3330,3487`                                                |
| H10 | `order_items` sans `tenant_id` (isolation transitive uniquement)                                                                   | `schema.sql:1343-1362`                                                      |
| H11 | Coupon jamais reverse a l'annulation; redemption = compteur non auditable                                                          | `coupon.service.ts:154-161`                                                 |
| H12 | KDS par item = code mort; coursing/fire-hold absents; `order_items` pas en realtime                                                | `KDSTicket.tsx:74-99`; `lib/printing/kitchen-ticket.ts:62-81`               |
| H13 | Course d'avancement KDS = race last-writer-wins (update non conditionnel)                                                          | `useKitchenData.ts:266-269`; `order.service.ts:527-531`                     |
| H14 | Quota plan compte doublons/non-payes/annules                                                                                       | `plan-enforcement.service.ts:253-257`                                       |

### MEDIUM (selection)

- Preview ne renvoie que le sous-total, jamais le total autoritaire (`preview/route.ts:60-65`).
- SELECT anon sur `orders` = fuite cross-tenant non-PII sur 6h (`20260623100000_*.sql:86-88`).
- Grants DML anon residuels sur orders/order_items (`schema.sql:3649,3711`).
- `numeric(10,2)` mauvaise echelle pour XAF/XOF; `tip_amount` numeric non borne.
- Logique metier (coupon, notifs, destock, quota) dans les routes API (`api/orders/route.ts:177-369`).
- Cash-only code en dur dans `PaymentModal` (`:49,77`) au lieu de lire `ACTIVE_PAYMENT_METHOD_IDS`.
- Pas de frais de livraison dans le pricing (`tax.ts:58-75`).
- Notifs/emails fire-and-forget sans retry/outbox (`route.ts:259-264`).
- Recu re-additionne le tip pour les commandes POS (`receipt.ts:81,428`); print HTML non immuable.

## 4. Librairies / standards eprouves a adopter

- **Argent: dinero.js v2 + BIGINT en unites mineures.** XAF/XOF = **zero-decimal** (le franc
  EST l'unite mineure: 1000 XAF -> `1000`). Fallback: value object `Money` maison.
  https://github.com/dinerojs/dinero.js
- **Modele de domaine: Square "Everything is an Order"** (check + line_items + tenders[] +
  refunds en records separes; jamais muter un record financier regle). Vocab
  seat/course/fire/void/comp depuis Toast/Simphony/Floreant.
  https://developer.squareup.com/blog/everything-is-an-order/
- **Machines a etats: modele orthogonal** (order/fulfillment/payment). XState v5 pour
  authoring; persister colonnes simples + journal d'evenements append-only (PAS les snapshots
  bruts). Alternative zero-dep: fonctions de transition SQL. https://github.com/statelyai/xstate
- **Paiements Afrique francophone (futur):** CinetPay/Hub2 (mobile money + cartes locales),
  Paystack (carte XOF); Stripe direct a eviter pour l'acquisition locale. Interface
  `PaymentProvider` + tender asynchrone idempotent. https://docs.cinetpay.com - https://hub2.io
- **Integrite Supabase:** RPC SECURITY DEFINER atomiques; ledger append-only style pgledger
  (https://github.com/pgr0ss/pgledger); cles d'idempotence UNIQUE; `pg_advisory_xact_lock`
  (niveau transaction, jamais session a cause du pooler); RLS pour la tenancy; argent BIGINT.
- **KDS:** machine de fulfillment projetee en tableau. References: URY/Mosaic,
  getditto/demoapp-pos-kds.

## 5. Roadmap de remediation

Decisions produit confirmees: refonte complete du domaine; argent en unites mineures
maintenant; integration PSP/mobile money hors scope (on garde l'abstraction tender +
le schema, implementation `cash` seulement).

- **Phase 0 - Quick wins** (sans refonte de schema lourde): vue "A encaisser" caisse (C2),
  unifier `orders.total` (C4), CA = paye uniquement centralise (C5), `markPaid` idempotent +
  ne plus forcer `status` (C3/H7), soft-delete + snapshot (C7), destock idempotent (C6),
  `cancelOrder` restock+unclaim (C7/H11), source unique de statuts (H3), revoke grants/EXECUTE
  anon (H9), validation service_type/table (H5), claim conditionnel (H6), quota = payees (H14).
- **Phase 1 - Modele de donnees:** `table_sessions` (resout C1), `payments`/`tenders`
  append-only (resout H2/H8), `order_items.tenant_id` (H10), `coupon_redemptions` (H11),
  `orders.table_id` peuple et valide.
- **Phase 2 - Argent en unites mineures** (BIGINT + dinero.js v2) (resout H1).
  - LIVRE (2026-06-30): les colonnes TRANSACTIONNELLES sont en BIGINT unites mineures -
    `orders.{total,subtotal,tax_amount,service_charge_amount,discount_amount,tip_amount}`,
    `order_items.price_at_order`, `payments.amount` ; dinero.js v2 + helpers
    `toMinorUnits/fromMinorUnits/sumMinor/multiplyMinor/formatCurrencyMinor`. XAF/XOF zero-decimal
    donc minor == major (identite pour la prod actuelle) ; seuls EUR/USD x100.
  - FRONTIERE DELIBEREE (decision produit 2026-06-30, clause N/A zero-dette) : les PRIX CATALOGUE
    (`menu_items.price`, `item_modifiers.price`, `item_price_variants.price`, `coupons.discount_value`,
    le jsonb `prices` multi-devise) RESTENT en numeric/major. Justification : ce sont des valeurs de
    configuration, pas l'argent transactionnel vise par H1 (le bug float etait sur les agregats de
    commandes/paiements, desormais en entiers exacts). Les convertir cascade sur tout l'affichage
    menu/FX, le panier et la verification de prix anti-fraude (`previewOrderItems`) pour un gain
    arithmetique nul (aucune somme flottante sur ces valeurs). Conversion major->minor faite au
    moment de l'entree en commande. A rouvrir seulement si un besoin reel multi-devise EUR/USD
    apparait sur le catalogue.
- **Phase 3 - Machines a etats orthogonales + KDS reel** (resout C3, H12, H13): per-item bump,
  coursing + fire/hold, item en realtime, update conditionnel anti-race.
- **Phase 4 - Abstraction paiement seulement** (PSP hors scope): interface `PaymentProvider`
  - machine de tender, implementation `cash`.

## 6. Verification (par phase)

- 5 portes CI: `pnpm typecheck && pnpm lint --max-warnings 0 && pnpm format:check && pnpm test && pnpm build`.
- Tests unitaires services + RPC (price verif, markPaid idempotent, revenue=paye, destock
  idempotent, restock a l'annulation, claim concurrent).
- E2E live (Playwright headed + gstack): QR -> KDS -> caisse encaisse la commande QR; doublon
  impossible; tip non double-compte; CA reconcilie au tender.
- Migrations DB: backup-first, additives/retrocompatibles, code deploye avant toute migration
  qui retire un acces.
