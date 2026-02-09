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

## Structure des tables

Voir `agent_docs/database-conventions.md` pour les conventions detaillees.

## Environnements

| Environnement            | Usage                          |
| ------------------------ | ------------------------------ |
| Local (`supabase start`) | Developpement et tests         |
| Production               | Base de donnees Supabase cloud |

> **Recommandation** : Creer un second projet Supabase pour un environnement staging
> afin de tester les migrations avant de les appliquer en production.
