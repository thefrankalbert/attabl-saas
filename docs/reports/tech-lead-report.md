# Rapport d'Audit Technique - ATTABL SaaS

**Date** : 2026-03-24
**Auditeur** : Tech Lead (Agent IA)
**Perimetre** : Architecture complete, qualite du code, securite, dependances, tests, CI/CD
**Score de sante technique global** : **B+**

---

## 1. Resume executif

ATTABL est un SaaS multi-tenant bien structure, avec une architecture en couches clairement definie, un service layer testable par injection de dependances, et une bonne couverture de securite (rate limiting, RLS, CSP, HSTS). Le projet compte 534 fichiers TypeScript/TSX pour environ 79 000 lignes de code, 35 API routes, 23 services, et 39 fichiers de tests.

Les principaux points d'attention sont : des vulnerabilites critiques dans les dependances (jsPDF, xlsx), un fichier de types DB vide, l'absence de barrel exports pour la plupart des modules, et quelques violations de la regle typographique ASCII. Le projet est neanmoins solide pour sa maturite.

---

## 2. Structure du projet

### 2.1 Forces

- **Architecture en couches respectee** : Presentation (`app/`, `components/`) / Service (`services/`) / Persistance (`lib/supabase/`) bien separees
- **Service layer exemplaire** : 23 services avec injection de dependances du client Supabase, entierement testables avec des mocks
- **Pattern ServiceError uniforme** : Erreurs typees (`NOT_FOUND`, `CONFLICT`, `VALIDATION`, `AUTH`, `INTERNAL`) avec mapping HTTP centralise
- **3 clients Supabase distincts** : `client.ts` (browser), `server.ts` (SSR), `admin.ts` (service role) - separation correcte
- **Schemas Zod complets** : 17 schemas de validation dans `src/lib/validations/`, couvrant tous les domaines
- **Multi-tenant robuste** : Middleware proxy avec extraction de sous-domaine, support custom domains, injection de `x-tenant-slug` sur les request headers (pas response), protection contre l'injection client du header
- **Rate limiting exhaustif** : 20 limiteurs distincts couvrant 28/35 routes API
- **Hooks organises** : Separation queries/mutations avec barrel exports
- **Permissions granulaires** : Systeme 3 niveaux (role matrix + permission codes + overrides)
- **Feature gating centralise** : Plan limits et feature flags dans `src/lib/plans/features.ts`
- **i18n complet** : fr-FR et en-US (2285 lignes chacun, parfaitement synchronises)
- **Logger centralise** : Sentry en prod, console en dev - aucun `console.*` dans le code source (sauf dans le logger lui-meme)

### 2.2 Faiblesses

- **Absence de barrel exports** : Seulement 3 index.ts (`qr/templates`, `hooks/mutations`, `hooks/queries`). Les dossiers `services/`, `lib/`, `contexts/`, `components/shared/` n'ont pas de re-exports, obligeant des imports verbeux
- **Absence de `.env.example`** : Pas de documentation des variables d'environnement requises. Le CI utilise 12 secrets ; un nouveau developpeur ne sait pas quoi configurer
- **Fichier `database.types.ts` vide** (0 lignes) : Le typage Supabase auto-genere est absent. Toutes les requetes Supabase sont non-typees au niveau DB
- **Middleware renomme `proxy.ts`** : Coherent avec Next.js 16 mais le CLAUDE.md reference `middleware.ts` dans la structure de dossiers, creant une confusion documentaire
- **Documents marketing a la racine** : 12 fichiers .docx/.pdf et 6 fichiers .tmp polluent la racine du repo. Devraient etre dans `docs/` ou ignores par `.gitignore`

---

## 3. Dette technique identifiee

### 3.1 Severite CRITIQUE

| #   | Probleme                                                | Localisation                  | Impact                                                                                                                       |
| --- | ------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | **jsPDF v4.1.0 - HTML Injection (GHSA-wfv2-pwc8-crg5)** | `package.json`                | Vulnerabilite critique : injection HTML via New Window. Patcher vers >= 4.2.1                                                |
| 2   | **xlsx v0.18.5 - Prototype Pollution + ReDoS**          | `package.json`                | 2 vulnerabilites hautes, pas de patch disponible (patched: `<0.0.0`). Remplacer par `exceljs` ou `sheetjs-ce`                |
| 3   | **Next.js 16.1.6 - 2 vulnerabilites**                   | `package.json`                | CSRF bypass HMR + autre vuln. Patcher vers >= 16.1.7                                                                         |
| 4   | **`database.types.ts` vide**                            | `src/types/database.types.ts` | Aucun typage auto-genere Supabase. Toutes les requetes DB sont `any` implicitement. Risque eleve de regressions silencieuses |

### 3.2 Severite HAUTE

| #   | Probleme                                            | Localisation                                                                                                                                | Impact                                                                                                                                                                         |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5   | **7 routes API sans rate limiting**                 | `upload`, `billing-portal`, `revalidate-menu`, `admin/reset`, `health`, `webhooks/stripe`, `auth/[...supabase]`                             | Les routes `upload` et `admin/reset` sont particulierement sensibles. `health` et `webhooks/stripe` sont des cas acceptables (webhook verifie par signature Stripe)            |
| 6   | **Violations typographiques Unicode**               | `proxy.ts:161`, `QRCustomizerPanel.tsx`, `StockHistoryClient.tsx`, `SuppliersClient.tsx`, `reset-password/page.tsx`, `kitchen-mock-data.ts` | 11+ occurrences de `\u2019` (smart quote) et `\u2014` (em dash) dans le code source, violation de la regle CLAUDE.md                                                           |
| 7   | **TODO non resolu : integration email**             | `src/app/actions/contact.ts:61`                                                                                                             | Le formulaire de contact ne fonctionne pas (commentaire TODO). `resend` est en dependance mais pas branche                                                                     |
| 8   | **Dependance dupliquee `framer-motion` + `motion`** | `package.json`                                                                                                                              | 16 fichiers importent `framer-motion`, 5 fichiers importent `motion/react`. Double bundle. `motion` est le successeur ; migrer tout vers `motion` et supprimer `framer-motion` |

### 3.3 Severite MOYENNE

| #   | Probleme                                         | Localisation                      | Impact                                                                                                                                                                                |
| --- | ------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | **32 vulnerabilites npm au total**               | `pnpm audit`                      | 1 critique, 23 hautes, 7 moderees, 1 basse. Inclut des transitives via `next-pwa > workbox-build > glob > minimatch` et `supabase > tar`                                              |
| 10  | **`getSession()` utilise dans reset-password**   | `src/app/reset-password/page.tsx` | Fichier client (browser) donc acceptable en contexte, mais le CLAUDE.md interdit cette pratique. A clarifier ou remplacer par `onAuthStateChange` (deja utilise dans le meme fichier) |
| 11  | **Dependance `@anthropic-ai/sdk` en production** | `package.json`                    | SDK Anthropic dans les `dependencies` (pas devDependencies). Augmente le bundle si tree-shaking echoue. A verifier si utilise en runtime                                              |
| 12  | **`agentation` en production dependencies**      | `package.json`                    | Meme probleme - potentiellement un outil de dev                                                                                                                                       |
| 13  | **Aucun test E2E fonctionnel**                   | `tests/e2e/`                      | Le dossier existe mais aucun test significatif n'est execute en CI (gate 4 = Vitest uniquement)                                                                                       |

### 3.4 Severite BASSE

| #   | Probleme                                     | Localisation                   | Impact                                                                                                         |
| --- | -------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 14  | **Fichiers temporaires non gitignored**      | Racine (`lu*.tmp`, `.~lock.*`) | Pollution du working tree                                                                                      |
| 15  | **130+ composants `'use client'`**           | Global                         | Ratio eleve mais justifie par la nature de l'app (dashboard interactif). A surveiller pour les pages marketing |
| 16  | **38 migrations non trackees en production** | `supabase/migrations/`         | Ecart documente dans MEMORY.md. Pas de systeme de verification automatique                                     |

---

## 4. Dependances problematiques

| Package                    | Version | Statut                                               | Action recommandee                                     |
| -------------------------- | ------- | ---------------------------------------------------- | ------------------------------------------------------ |
| `jspdf`                    | 4.1.0   | **CRITIQUE** - HTML injection                        | Mettre a jour vers >= 4.2.1                            |
| `xlsx`                     | 0.18.5  | **HAUTE** - Prototype pollution, ReDoS, pas de patch | Remplacer par `exceljs` ou `@pdaswp/sheetjs-ce`        |
| `next`                     | 16.1.6  | **HAUTE** - 2 vulns                                  | Mettre a jour vers >= 16.1.7                           |
| `tar` (via supabase)       | < 7.5.8 | **HAUTE** - Transitive                               | Mettre a jour `supabase` devDep                        |
| `minimatch` (via next-pwa) | < 3.1.3 | **HAUTE** - ReDoS transitive                         | Mettre a jour `@ducanh2912/next-pwa` ou overrides pnpm |
| `framer-motion`            | 12.33.0 | Dupliquee avec `motion` 12.36.0                      | Migrer vers `motion`, supprimer `framer-motion`        |
| `@anthropic-ai/sdk`        | 0.78.0  | Prod dep possiblement inutile                        | Deplacer en devDependencies si non utilise en runtime  |

---

## 5. Evaluation de la grille d'audit

| Critere                                   | Evaluation                                                                                  | Score |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- | ----- |
| Structure de dossiers logique et scalable | Excellente. Route groups, separation features/shared/admin/tenant/marketing                 | A     |
| Responsabilites clairement separees       | Service layer, validation Zod, controleurs fins. Tres bien                                  | A     |
| Code duplique a factoriser                | Peu de duplication visible. Bonne utilisation de composants partages                        | A-    |
| Dependances a jour et sans vulnerabilites | 32 vulnerabilites dont 1 critique. Dependances dupliquees                                   | D     |
| Typage TypeScript strict et complet       | `strict: true` active, 0 `any` dans le code. Mais `database.types.ts` vide = faille majeure | C+    |
| Gestion d'erreurs coherente               | ServiceError + logger Sentry + error boundaries. Coherent                                   | A-    |
| Configuration centralisee et documentee   | Pas de `.env.example`. Config eparpillee entre `lib/config`, `lib/plans`, `lib/stripe`      | C     |
| Code testable (injection de dependances)  | Services avec DI du client Supabase. 39 fichiers de test, 99 tests                          | B+    |
| Patterns coherents dans le projet         | Factory function (`createXxxService`), schemas Zod, rate limiting. Coherent                 | A-    |
| Dette technique identifiee et priorisee   | Documentee dans MEMORY.md mais pas de plan formel                                           | C     |

---

## 6. Recommandations architecturales priorisees

### P0 - Immediat (cette semaine)

1. **Patcher les vulnerabilites critiques** : `jspdf >= 4.2.1`, `next >= 16.1.7`, remplacer `xlsx` par `exceljs`
2. **Generer `database.types.ts`** : Executer `supabase gen types typescript` pour obtenir le typage auto-genere. C'est la faille de qualite la plus impactante du projet
3. **Ajouter rate limiting a `/api/upload`** et `/api/admin/reset`\*\* : Routes sensibles sans protection

### P1 - Court terme (2 semaines)

4. **Creer `.env.example`** : Documenter toutes les variables d'environnement requises avec descriptions
5. **Corriger les violations typographiques Unicode** : 11+ fichiers utilisent des caracteres interdits par CLAUDE.md
6. **Unifier `framer-motion` vers `motion`** : Migrer les 16 fichiers restants et supprimer la dependance dupliquee
7. **Brancher l'integration email (Resend)** : Le formulaire de contact est un dead-end

### P2 - Moyen terme (1 mois)

8. **Ajouter des barrel exports** (index.ts) pour `services/`, `contexts/`, `components/shared/`, `lib/validations/`
9. **Nettoyer les fichiers racine** : Deplacer les .docx/.pdf dans `docs/`, ajouter `*.tmp` et `.~lock.*` au `.gitignore`
10. **Creer des tests E2E significatifs** : Le pipeline CI n'execute que les tests unitaires
11. **Auditer les dependances prod vs dev** : `@anthropic-ai/sdk`, `agentation`, `pg`, `postgres` sont-ils necessaires en runtime ?
12. **Verifier les migrations en production** : Automatiser la detection d'ecarts entre `supabase/migrations/` et la DB de prod

### P3 - Long terme (trimestre)

13. **Mettre en place un systeme de migration fiable** : Supabase CLI ou script custom pour eviter les gaps documentes dans MEMORY.md
14. **Augmenter la couverture de tests** : Les composants React n'ont que 7 fichiers de tests sur potentiellement 200+ composants
15. **Documenter les ADR** : Aucun Architecture Decision Record n'existe dans `docs/architecture/adr/`

---

## 7. ADR proposes pour les decisions manquantes

### ADR-001 : Choix du pattern multi-tenant (subdomain routing)

**Contexte** : Le systeme route les tenants par sous-domaine avec rewrite URL.
**Decision a documenter** : Pourquoi le subdomain routing plutot que path-based (`/t/radisson/`) ou base de donnees separee.
**Consequences** : Necessite wildcard DNS, cookies partages cross-subdomain, gestion custom domains.

### ADR-002 : Migration de middleware.ts vers proxy.ts (Next.js 16)

**Contexte** : Next.js 16 introduit `proxy.ts` comme remplacement du middleware.
**Decision a documenter** : Migration effectuee, mais CLAUDE.md reference encore `middleware.ts`.
**Impact** : Mettre a jour la documentation.

### ADR-003 : Strategie de typage Supabase

**Contexte** : `database.types.ts` est vide. Les requetes DB ne sont pas typees.
**Decision requise** : Generer les types automatiquement via CI ou manuellement lors des migrations.

### ADR-004 : Remplacement de xlsx par une alternative securisee

**Contexte** : `xlsx` a des vulnerabilites sans patch disponible.
**Decision requise** : Evaluer `exceljs` vs `sheetjs-ce` vs parsing CSV uniquement.

---

## 8. Metriques cles

| Metrique                  | Valeur                                         |
| ------------------------- | ---------------------------------------------- |
| Fichiers TypeScript/TSX   | 534                                            |
| Lignes de code            | ~79 000                                        |
| Services metier           | 23                                             |
| Schemas de validation Zod | 17                                             |
| Routes API                | 35                                             |
| Server Actions            | 9                                              |
| Tests unitaires           | 99 (39 fichiers)                               |
| Composants UI (shadcn)    | 37                                             |
| Contexts React            | 9                                              |
| Custom Hooks              | 26+                                            |
| Migrations DB             | 38                                             |
| Rate limiters             | 20                                             |
| Vulnerabilites npm        | 32 (1 critique, 23 hautes)                     |
| Couverture CI             | typecheck + lint + format + unit tests + build |
| Langues supportees        | 2 (fr-FR, en-US)                               |

---

## 9. Conclusion

Le projet ATTABL presente une architecture solide et bien pensee pour un SaaS multi-tenant. Le service layer avec injection de dependances, la validation Zod systematique, le rate limiting exhaustif et le logger centralise Sentry sont des marqueurs de maturite technique.

Les axes d'amelioration prioritaires sont :

1. La securite des dependances (patcher immediatement jsPDF, Next.js, remplacer xlsx)
2. Le typage DB (generer `database.types.ts`)
3. La documentation (`.env.example`, ADR, mise a jour CLAUDE.md)

Le score **B+** reflete un projet dont l'architecture est solide (A-) mais dont la gestion des dependances (D) et la documentation operationnelle (C) tirent la note vers le bas. Avec les corrections P0 et P1, le projet pourrait atteindre un A-.
