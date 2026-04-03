---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "tests/**/*.ts"
---

# Testing & Code Quality Rules - ATTABL SaaS

## Pipeline CI/CD (5 Portes de Qualite)

Avant CHAQUE commit/PR, ces 5 checks DOIVENT passer :

1. `pnpm typecheck` — Types TypeScript (mode strict, zero erreurs)
2. `pnpm lint` — ESLint (zero erreurs, zero warnings)
3. `pnpm format:check` — Prettier (formatage conforme)
4. `pnpm test` — Tests unitaires Vitest (tous passent)
5. `pnpm build` — Build Next.js (compile sans erreur)

REGLE : Si tu modifies du code, lancer au minimum `pnpm typecheck && pnpm lint` avant de considerer la tache terminee.

## Tests Unitaires (Vitest)

### Quand Ecrire des Tests

- TOUJOURS pour les services (`src/services/*.service.ts`)
- TOUJOURS pour les schemas Zod (`src/lib/validations/*.schema.ts`)
- TOUJOURS pour les fonctions utilitaires (`src/lib/utils/`)
- Pour les hooks custom complexes
- Pour les composants avec logique conditionnelle significative

### Pattern de Test Service

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('createOrderService', () => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };

  it('should validate tenant before creating order', async () => {
    // Arrange - Setup mock data
    // Act - Call service method
    // Assert - Verify behavior
  });
});
```

### Pattern de Test Zod

```typescript
describe('orderSchema', () => {
  it('should accept valid order', () => {
    const result = orderSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject order with negative quantity', () => {
    const result = orderSchema.safeParse({ ...validData, quantity: -1 });
    expect(result.success).toBe(false);
  });
});
```

### Regles de Test

- Tests dans `src/__tests__/` ou `src/[module]/__tests__/`
- Nommage : `[fichier].test.ts`
- JAMAIS de tests qui dependent d'un etat externe (DB reelle, API externe)
- Utiliser des mocks pour Supabase, Stripe, et les services externes
- Chaque test est independant — pas d'ordre d'execution requis
- Tester les cas limites : inputs invalides, erreurs DB, timeouts

## TypeScript (Mode Strict)

### Regles Absolues

- ZERO `any` dans le code — utiliser `unknown` si le type est inconnu puis narrower
- ZERO `@ts-ignore` ou `@ts-expect-error` sauf raison documentee en commentaire
- Toutes les fonctions exportees ont des types de retour explicites
- Interfaces pour les objets de donnees, type aliases pour les unions/intersections
- Generics quand le pattern le justifie (pas pour montrer qu'on sait les utiliser)

### Types Specifiques au Projet

- Types globaux dans `src/types/`
- Types locaux a un module dans le meme fichier ou un fichier `.types.ts` adjacent
- Re-exporter les types Supabase generes plutot que les redefinir manuellement

## ESLint et Prettier

- Configuration dans `eslint.config.mjs` : Next.js core-web-vitals + TypeScript + Prettier
- Ne PAS desactiver de regles ESLint avec `// eslint-disable` sauf raison documentee
- Prettier gere le formatage — ne pas essayer de formater manuellement
- Pas de conflits ESLint/Prettier (prettier-config-eslint desactive les regles conflictuelles)

## Pre-Commit (Husky + lint-staged)

- `*.{ts,tsx}` : ESLint --fix + Prettier --write
- `*.{json,md,css,mjs}` : Prettier --write
- Ces hooks s'executent automatiquement — ne pas les bypasser avec `--no-verify`

## Revue de Code - Checklist

Avant de considerer une modification terminee :

- [ ] TypeScript strict : pas de `any`, types explicites
- [ ] Validation Zod pour toute entree utilisateur
- [ ] Tenant isolation verifiee (filtrage `tenant_id`)
- [ ] Responsive : teste sur mobile (375px) et desktop (1440px)
- [ ] Pas de secrets ou PII dans les logs
- [ ] Tests unitaires pour la logique metier
- [ ] `pnpm typecheck && pnpm lint` passent
- [ ] Pas de regression sur les fonctionnalites existantes
