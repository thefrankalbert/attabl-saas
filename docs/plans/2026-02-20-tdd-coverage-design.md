# TDD Coverage Complète — Design Document

**Date:** 2026-02-20
**Objectif:** Passer de 201 tests à ~700 tests en couvrant tous les services, schemas, API routes, Server Actions et utilitaires non testés.

## Contexte

L'audit révèle que seuls 7 services sur 18, 9 schemas sur 13, et 0 API routes sur 25 sont testés. Les zones critiques (paiements, pricing, inventaire, authentification) n'ont aucune couverture.

## Architecture des tests

**Pattern unique** : Mock Supabase injecté (cohérent avec les 201 tests existants).

| Couche         | Pattern de test                                     | Mock                                          |
| -------------- | --------------------------------------------------- | --------------------------------------------- |
| Services       | Factory function avec client Supabase mocké         | `vi.fn()` sur `supabase.from().select()` etc. |
| Schemas Zod    | Validation pure, pas de mock                        | Aucun                                         |
| API Routes     | Import direct de la fonction handler, mock services | `vi.mock()` des services + `NextRequest`      |
| Server Actions | Mock Supabase auth + services                       | `vi.mock()` de `createClient`                 |
| Lib utilities  | Mock minimal (Sentry, Redis)                        | Selon dépendance                              |

**Structure fichiers** :

```
src/services/__tests__/[service].test.ts     (existant)
src/lib/validations/__tests__/[schema].test.ts (existant)
src/lib/__tests__/[util].test.ts             (existant)
src/app/api/__tests__/[route-name].test.ts   (NOUVEAU)
src/app/actions/__tests__/[action].test.ts   (NOUVEAU)
```

## Plan en 3 vagues

### Vague 1 — CRITICAL (~120 tests)

Modules touchant directement l'argent, les stocks et l'authentification.

| #   | Fichier                                        | Type    | Tests |
| --- | ---------------------------------------------- | ------- | ----- |
| 1   | `src/lib/pricing/tax.ts`                       | Lib     | 10    |
| 2   | `src/services/coupon.service.ts`               | Service | 15    |
| 3   | `src/services/plan-enforcement.service.ts`     | Service | 14    |
| 4   | `src/app/api/create-checkout-session/route.ts` | API     | 12    |
| 5   | `src/app/api/verify-checkout/route.ts`         | API     | 10    |
| 6   | `src/app/api/webhooks/stripe/route.ts`         | API     | 18    |
| 7   | `src/app/api/orders/route.ts`                  | API     | 22    |
| 8   | `src/services/inventory.service.ts`            | Service | 24    |
| 9   | `src/services/notification.service.ts`         | Service | 12    |
| 10  | `src/app/api/signup/route.ts`                  | API     | 10    |
| 11  | `src/app/api/signup-oauth/route.ts`            | API     | 8     |

### Vague 2 — HIGH (~100 tests)

Menu, import Excel, rate-limiting, logging, email, schemas manquants.

| Fichier                                  | Type    | Tests |
| ---------------------------------------- | ------- | ----- |
| `src/services/menu.service.ts`           | Service | 18    |
| `src/services/excel-import.service.ts`   | Service | 16    |
| `src/lib/rate-limit.ts`                  | Lib     | 14    |
| `src/lib/logger.ts`                      | Lib     | 10    |
| `src/services/email.service.ts`          | Service | 10    |
| `src/lib/validations/checkout.schema.ts` | Schema  | 8     |
| `src/lib/validations/coupon.schema.ts`   | Schema  | 10    |
| `src/lib/validations/menu.schema.ts`     | Schema  | 8     |

### Vague 3 — MEDIUM+LOW (~280 tests)

Server Actions, invitations, assignments, onboarding, utilitaires.

## Décisions clés

1. **Mock Supabase injecté** — Pas de MSW ni d'intégration Supabase locale
2. **Par vagues prioritaires** — CRITICAL d'abord, HIGH ensuite, MEDIUM+LOW après
3. **RED-GREEN pattern** — Chaque test écrit en mode TDD strict
4. **Un commit par tâche** — Traçabilité complète
