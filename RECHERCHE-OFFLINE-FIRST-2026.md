# Recherche - Couche d'ecriture offline-first PWA (tablettes salle/resto)

Date: 2026-06-28. Source: deep-research (22 sources, 109 claims, 9 verifies 3-0).
Stack cible: Next.js 16, React 19, Supabase Postgres, TanStack Query v5, @ducanh2912/next-pwa v10, multi-tenant, Stripe.
Objectif demande: niveau 2 robuste = vraie base locale qui sync (pas juste une file de mutations).

## Ce que l'app a aujourd'hui (constats code, verifies)

- TanStack persiste **les queries seulement** -> localStorage (`attabl-query-cache`, 24h). Les **mutations ne sont pas persistees** = ecriture perdue hors-ligne.
- next-pwa v10, **pas de Background Sync**.
- **Aucune idempotence** sur creation commande/paiement (`grep idempotenc|client_order_id` = 0).
- Prix verifies cote serveur dans `src/services/order.service.ts` (fichier protege). C'est une **autorite serveur au moment de l'ecriture** - point critique pour le choix d'archi.

Surface d'ecriture a couvrir:

- `src/app/api/orders/route.ts` (commande client)
- `src/app/api/orders/pos/route.ts` (POS tablette - cible principale)
- `src/app/api/orders/[id]/claim` `/pay-wave` `/pay-orange-money` (statut + paiement)
- `src/app/actions/orders.ts`, `payment-methods.ts`

## Paysage techno 2026 (verifie)

| Techno                           | Quoi                                                                                                     | Verdict pour CE stack                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PowerSync**                    | Postgres<->SQLite local, sync temps reel, file d'upload durable, draine via supabase-js au retour reseau | Vrai "niveau 2". MAIS **exige un service de sync separe** (PowerSync Cloud paye OU self-host Docker). Demo officielle Next.js+Supabase+Vercel existe. (3-0) |
| **ElectricSQL**                  | Sync-engine, sync des sous-ensembles Postgres en lecture                                                 | **Lecture surtout** (read-path). Ecriture moins mature. (3-0)                                                                                               |
| **rxdb-supabase**                | Replication 2 sens RxDB<->Supabase                                                                       | **Non maintenu** (dernier release aout 2023, RxDB 14). Risque sur Next16/React19.                                                                           |
| Replicache/Zero, Triplit, Convex | Local-first complets                                                                                     | Changent le backend ou exigent leur propre serveur. Hors-stack.                                                                                             |
| IndexedDB + outbox (maison)      | File durable + cache lecture                                                                             | Pas de nouveau service. Reutilise l'API REST existante (donc garde l'autorite prix serveur).                                                                |

Faits transverses (textbook, non contestes):

- localStorage cap ~5 Mo + synchrone main thread -> **inadapte** comme couche durable. IndexedDB = le bon store.
- Idempotence: le client mint un UUID stable **a la creation** de la mutation (pas a l'envoi); le serveur dedup et renvoie le resultat memorise si rejoue (pattern Stripe). Prereq absolu quel que soit le choix.
- Conflits commandes/paiements: server-authoritative > LWW > CRDT (un paiement n'est pas un doc collaboratif).

## Deux architectures viables

### A. Full local-first (PowerSync) = "vrai niveau 2"

- SQLite local = miroir des donnees tenant. Lecture ET ecriture locales, sync en fond.
- (+) UX instantanee, lecture complete hors-ligne, file d'upload durable native.
- (-) **Nouveau service always-on** (PowerSync Cloud paye, ou Docker self-host a operer). Cout + vendor + point de panne en plus.
- (-) **Rewrite de paradigme**: lecture+ecriture passent par SQLite local au lieu de l'API REST. L'autorite-prix serveur de `order.service.ts` devient **post-hoc** (la commande est acceptee localement avec les prix client, validee seulement au drain). Regression possible: commande "confirmee" sur tablette puis rejetee a la sync.
- (-) Multi-tenant: regles de sync (sync rules) a ecrire par tenant_id.

### B. Outbox durable IndexedDB + cache lecture IndexedDB = "niveau 2 leger"

- Cache lecture: basculer le persister TanStack localStorage -> **IndexedDB** (survie + >5 Mo).
- Ecriture: **outbox durable IndexedDB** (idb/Dexie), chaque mutation a un **idempotency-key UUID** minte a la creation, rejouee vers les **routes REST existantes** au retour reseau (Background Sync + reconnect).
- (+) **Aucun nouveau service / cout**. Reste sur Vercel+Supabase.
- (+) **Garde l'autorite-prix serveur** (le rejeu frappe order.service.ts qui valide). Conflit = rejet serveur a la sync, remonte a l'operateur.
- (+) Blast radius contenu, pas de rewrite des lectures.
- (-) Pas un miroir SQLite complet: la lecture hors-ligne = ce qui etait deja en cache (suffisant pour un service de table en cours).

## Repos a reutiliser (pas reecrire)

- PowerSync: `powersync-ja/powersync-supabase-vercel-todolist-demo` (Next+Supabase+Vercel), `powersync-ja/self-host-demo` (dossier Supabase).
- Outbox: `idb` ou `Dexie` (IndexedDB), Background Sync API (oneuptime guide 2026), `@tanstack/query-async-storage-persister` deja installe (juste changer le storage backend).
