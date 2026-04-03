---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "supabase/**/*.sql"
---

# Security Rules - ATTABL SaaS

## Authentication (CRITIQUE)

- TOUJOURS utiliser `auth.getUser()` pour verifier l'authentification (verifie le token cote serveur)
- JAMAIS `auth.getSession()` ou `getSession()` (lit le JWT sans verification serveur, falsifiable)
- Deriver `tenant_id` de la session authentifiee, JAMAIS l'accepter en parametre client
- Verifier l'appartenance user-tenant via join `admin_users` avant toute operation

## Multi-Tenant Isolation (CRITIQUE)

- CHAQUE requete DB sur une table multi-tenant DOIT filtrer par `tenant_id`
- Le `tenant_id` vient du header `x-tenant-slug` (injecte par le middleware, pas le client)
- Pattern obligatoire : Auth check -> Tenant derivation -> Service call
- RLS est un filet de securite supplementaire, PAS la protection principale
- JAMAIS faire confiance a un `tenant_id` venant du body, query params, ou headers custom client

## Input Validation

- TOUTE entree utilisateur validee avec un schema Zod AVANT interaction DB
- Utiliser `safeParse()` et retourner 400 avec les erreurs de validation
- Schemas Zod dans `src/lib/validations/[domaine].schema.ts`
- Valider les UUIDs, limiter les longueurs de chaines, borner les nombres
- JAMAIS inserer de donnees non-validees en base

## API Routes - Checklist Obligatoire

Chaque route API DOIT suivre cet ordre :
1. Rate limiting (Upstash Redis, fail-closed pour endpoints sensibles)
2. Validation Zod (`safeParse()`)
3. Authentification (`supabase.auth.getUser()`)
4. Derivation tenant (join `admin_users` → `tenant_id`)
5. Appel service layer
6. Reponse JSON avec mapping `ServiceError` → HTTP status

## Supabase Clients - Regles Strictes

| Client | Usage | RLS |
|--------|-------|-----|
| `client.ts` (browser) | Composants client uniquement | OUI |
| `server.ts` (server) | Server Components, Actions, API routes | OUI |
| `admin.ts` (service_role) | Signup, webhooks, super admin UNIQUEMENT | NON (bypass) |

- JAMAIS utiliser `admin.ts` pour des operations utilisateur normales
- JAMAIS exposer `SUPABASE_SERVICE_ROLE_KEY` cote client ou dans les logs
- JAMAIS `console.log()` des tokens, mots de passe, cles API

## Rate Limiting

- Endpoints auth (login, signup, forgot-pwd) : strict, fail-closed
- Endpoints billing (checkout) : strict, fail-closed
- Endpoints publics (commandes, menus) : modere
- Si Redis indisponible en prod : bloquer (fail-closed par defaut)
- IP extraite de `x-forwarded-for` puis `x-real-ip`

## Secrets et Variables d'Environnement

- JAMAIS commit `.env.local`, `.env.production`, ou tout fichier contenant des secrets
- JAMAIS hardcoder de cles API, tokens, ou mots de passe dans le code
- Utiliser `process.env.VARIABLE` pour tous les secrets
- Logger avec `logger.error()` / `logger.warn()` / `logger.info()` — JAMAIS `console.*`
- En cas de doute, preferer le logging minimal (pas de PII dans les logs)

## Headers de Securite

- Middleware doit injecter Content-Security-Policy
- Pas d'inline scripts non-nonces
- Cookies : `sameSite: 'lax'`, `httpOnly: true`, `secure: true` en production
- CORS restreint aux domaines *.attabl.com en production

## SQL et Migrations

- TOUJOURS utiliser des prepared statements / requetes parametrees
- JAMAIS de concatenation de strings dans les requetes SQL
- RLS active sur TOUTES les tables multi-tenant
- Migrations : fichiers SQL dans `/supabase/migrations/YYYYMMDD_description.sql`
- JAMAIS modifier une migration deja appliquee — creer une nouvelle migration corrective
