# Programme Back-office Stock - ATTABL

Ferme les lacunes P1/P2 de l'audit besoins client (hors risque #1 deja livre PR #164).
Design complet par chantier : `docs/backoffice-stock-specs.json` (brouillons SQL, services, UI, tests).

## Principe

ATTABL POSSEDE le back-office stock (moat marche, pas une commodite). Construction NATIVE sur
Supabase, incrementale. On vole les modeles eprouves (ledger double-entree, Stock Reconciliation
facon ERPNext) sans adopter de plateforme. Migrations ADDITIVES uniquement, testees via
`pnpm test:db` avant prod. 1 PR par phase, mergee en prod progressivement.

## Insight pivot

Le `stock_movements` devient la SOURCE DE VERITE (ledger). `current_stock` = cache mutable
reconciliable. Ce socle (phase "ledger") debloque a lui seul l'inventaire physique (#12), les
pertes (#13) et l'anti-vol (#16).

## Regles de sequencage / anti-conflit (CRITIQUE)

Presque tous les chantiers stock editent les MEMES fichiers chauds :
`src/services/inventory.service.ts`, `src/types/inventory.types.ts` (union `MovementType` +
`MOVEMENT_TYPE_LABELS`), `src/components/admin/InventoryClient.tsx` (794 l), `StockHistoryClient.tsx`,
`src/messages/fr-FR.json` + `en-US.json`, et chacun re-swap le CHECK `stock_movements_movement_type_check`.

Consequences (non negociables) :

1. **Build SEQUENTIEL, pas de worktrees paralleles** sur la famille stock. Merge hell garanti sinon.
2. **La migration `ledger` est SEULE proprietaire** du CHECK `movement_type` et de `reason_code`.
   Elle pose des le depart TOUS les nouveaux types (`physical_count`, `loss`, `transfer_in`,
   `transfer_out`) + `reason_code`. Les chantiers dependants les UTILISENT, ne les redefinissent PAS
   (pas de second DROP/ADD du CHECK).
3. i18n : fichiers reels = `src/messages/fr-FR.json` + `src/messages/en-US.json` (PAS fr.json/en.json).
4. Fichiers PROTEGES a ne jamais modifier : `order.service.ts`, `next.config.mjs`, `rate-limit.ts`,
   `CartContext.tsx`, etc. Les besoins order-side (comp/gratuite) passent par route/action/payment.service.
5. Additif seulement. RPC recree = re-REVOKE/GRANT dans la meme migration (DROP efface les grants).

## Ordre d'execution (par dependance)

| PR  | Phase                                  | Lacune            | Effort | Dep    | Fichiers clefs                                                                                                                                            |
| --- | -------------------------------------- | ----------------- | ------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Panier client offline**              | #33               | M      | -      | cart/page.tsx -> submitOrder+outbox, indicateur offline convive                                                                                           |
| 2   | **Ledger canonique** (PIVOT)           | socle #12/#13/#16 | L      | -      | migration (CHECK+reason_code+created_by params destock/restock/opening, verify_stock_ledger + reconcile_stock_ledger), inventory.service, inventory.types |
| 3   | **Anti-vol + bip stock**               | #16, #7           | M      | ledger | created_by affiche (join admin_users), rapport sorties/employe, bip low-stock (SoundContext)                                                              |
| 4   | **Inventaire physique + ecart**        | #12               | L      | ledger | tables stock_counts/stock_count_lines + RPC commit -> mouvements physical_count                                                                           |
| 5   | **Pertes structurees**                 | #13               | M      | ledger | reason_code (casse/peremption/prod), recordLoss, rapport par motif                                                                                        |
| 6   | **Conversion d'unites**                | #15               | M      | -      | ingredients.purchase_unit+units_per_purchase, lib convert-units, reception en casiers                                                                     |
| 7   | **Import Excel recettes+fournisseurs** | #11               | M      | -      | extend excel-import.service, SuppliersClient/RecipesClient import dialogs                                                                                 |
| 8   | **Caisse comp/gratuite + note gerant** | #20, #19          | L      | -      | orders.is_comp/comp_reason/comped_by, house_accounts, order_notes, PaymentModal                                                                           |
| (9) | Multi-etablissement + transferts       | #17               | L      | ledger | STRETCH - gated on validated demand (aucun tenant multi-venue actif). Non construit par defaut.                                                           |

Chaque PR : migration additive -> service -> UI (shadcn + impeccable) -> tests (unit + `test:db`)
-> gstack live verify -> 5 portes CI vertes -> merge prod.

## Etat

- [x] PR1 offline-cart
- [ ] PR2 ledger
- [ ] PR3 antivol-bip
- [ ] PR4 physical-count
- [ ] PR5 pertes
- [ ] PR6 unit-conversion
- [ ] PR7 excel-import
- [ ] PR8 comp-note
- (9) transfers - deferred
