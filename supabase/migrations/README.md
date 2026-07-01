# Migrations Supabase - ATTABL

## Convention de nommage

```
YYYYMMDD_description.sql
```

Exemples :

- `20260207_complete.sql` — Schema initial complet
- `20260207_newsletter.sql` — Table newsletter_subscribers
- `20260207_rls_security.sql` — Politiques RLS

## Regles

1. **Ne JAMAIS modifier une migration deja appliquee** — creer une nouvelle migration pour corriger
2. **Toujours inclure `IF NOT EXISTS`** pour les CREATE TABLE/INDEX (idempotence)
3. **Toujours ajouter `tenant_id`** sur les nouvelles tables multi-tenant
4. **Toujours ajouter les politiques RLS** sur les nouvelles tables
5. **Tester en local** avant d'appliquer en production

## Commandes

```bash
# Appliquer les migrations vers le projet Supabase distant
pnpm db:migrate

# Demarrer Supabase en local pour tester
supabase start

# Pousser les changements vers la base distante
supabase db push

# Generer une nouvelle migration (optionnel)
supabase migration new nom_de_la_migration
```

## Processus de creation

1. Creer le fichier : `supabase/migrations/YYYYMMDD_description.sql`
2. Ecrire le SQL (CREATE TABLE, ALTER TABLE, CREATE POLICY, etc.)
3. Tester en local : `supabase start` puis `supabase db push --local`
4. Appliquer en production : `supabase db push`
5. Verifier : se connecter au dashboard Supabase pour confirmer

## Tests d'integration du moteur de stock (`pnpm test:db`)

Les tests unitaires (Vitest) mockent `supabase.rpc`, donc la logique SQL des RPC de
stock (`destock_order`, `restock_order`, `set_opening_stock`, `get_stock_status`) n'est
jamais executee. Pour la verrouiller reellement :

```bash
pnpm test:db     # Docker requis
```

Ce script (`scripts/run-stock-integration.sh`) monte un Supabase LOCAL, charge le
snapshot du schema prod (`tests/journeys/fixtures/schema.sql`) puis rejoue les migrations
posterieures au marqueur, et execute la suite `tests/integration/stock/` qui appelle les
VRAIS RPC et asserte les lignes resultantes (decrementation recette x quantite, idempotence,
bascule `is_available`/`is_low`, restock a l'annulation, isolation multi-tenant).

- N'est PAS dans les 5 portes CI : depend de Docker + du snapshot prod (les migrations du
  repo ne reconstruisent pas une base vierge - schema initial etabli en prod avant tracking).
- Meme raison que le harness `run-journeys-local.sh` (memes fixtures/env, garde-fou anti-prod).
- Suivi (hors scope de ce lot) : activer un job CI dedie une fois la reproductibilite du
  snapshot durcie (backfill des migrations de base). En attendant, lancer `pnpm test:db`
  localement avant tout changement touchant le moteur de stock.

## Structure des tables

Voir `agent_docs/database-conventions.md` pour les conventions detaillees.

## Environnements

| Environnement            | Usage                          |
| ------------------------ | ------------------------------ |
| Local (`supabase start`) | Developpement et tests         |
| Production               | Base de donnees Supabase cloud |

> **Recommandation** : Creer un second projet Supabase pour un environnement staging
> afin de tester les migrations avant de les appliquer en production.
