---
paths:
  - "src/app/api/**/*.ts"
  - "src/app/actions/**/*.ts"
  - "src/services/**/*.ts"
  - "src/lib/**/*.ts"
---

# Backend & API Rules - ATTABL SaaS

## API Routes (`src/app/api/`)

### Structure Obligatoire

Chaque route API DOIT implementer dans cet ordre exact :

```typescript
export async function POST(request: Request) {
  // 1. Rate limiting
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const { success } = await rateLimit.limit(ip);
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  // 2. Validation Zod
  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 });

  // 3. Authentification
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 4. Derivation tenant
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .maybeSingle();  // maybeSingle() pour supporter super_admin
  if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // 5. Service layer
  try {
    const service = createXxxService(supabase);
    const data = await service.doSomething(adminUser.tenant_id, result.data);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json({ error: err.message }, { status: serviceErrorToStatus(err.code) });
    }
    logger.error('Unexpected error', { error: err, userId: user.id });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Regles API

- TOUJOURS utiliser `.maybeSingle()` au lieu de `.single()` pour les lookups admin_users
- TOUJOURS catch `ServiceError` et mapper vers HTTP status via `serviceErrorToStatus()`
- JAMAIS de logique metier dans la route — tout deleguer au service
- JAMAIS retourner les details d'erreur internes au client (schema DB, stack trace)
- Logger les erreurs inattendues avec contexte (userId, tenantId, action)
- Routes publiques (menu, commandes) : pas d'auth requise mais rate limiting obligatoire

## Server Actions (`src/app/actions/`)

- Prefixer TOUTES les fonctions avec `action` : `actionCreateOrder()`, `actionUpdateTenant()`
- Utiliser `'use server'` en haut du fichier
- Meme pattern de validation/auth que les API routes
- Retourner `{ success: true, data }` ou `{ success: false, error }` — jamais throw

## Service Layer (`src/services/`)

### Pattern Factory (OBLIGATOIRE)

```typescript
export function createXxxService(supabase: SupabaseClient) {
  return {
    async methodName(tenantId: string, input: ValidatedInput): Promise<Result> {
      // Logique metier ici
      // TOUJOURS filtrer par tenantId
      const { data, error } = await supabase
        .from('table')
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) throw new ServiceError('INTERNAL', 'Failed to fetch data');
      return data;
    },
  };
}
```

### Regles Services

- CHAQUE methode de service qui touche une table multi-tenant DOIT recevoir et filtrer par `tenant_id`
- JAMAIS d'import Next.js dans un service (pas de `headers()`, `cookies()`, `redirect()`)
- JAMAIS de reponse HTTP dans un service — retourner des donnees ou lancer `ServiceError`
- Verification des prix cote serveur obligatoire pour les commandes (anti-fraude)
- Types d'entree et sortie explicites (pas de `any`)

## Gestion d'Erreurs

### ServiceError

```typescript
type ErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'INTERNAL' | 'AUTH' | 'UNAUTHORIZED';
```

- `NOT_FOUND` → 404
- `VALIDATION` → 400
- `AUTH` → 401
- `UNAUTHORIZED` → 403
- `INTERNAL` → 500

### Logging

- Utiliser `logger` de `src/lib/logger.ts` — JAMAIS `console.log/error/warn`
- Niveaux : `logger.error()` (erreurs), `logger.warn()` (situations anormales), `logger.info()` (events business)
- Inclure le contexte : `{ userId, tenantId, action, error }`
- JAMAIS logger de PII (email, nom, adresse), tokens, ou secrets

## Base de Donnees

### Nommage

- Tables : snake_case pluriel (`menu_items`, `order_items`)
- Colonnes : snake_case (`created_at`, `tenant_id`)
- Primary keys : `id` (UUID)
- Foreign keys : `[table_singulier]_id` (`tenant_id`, `order_id`)
- Timestamps : `created_at`, `updated_at` (TIMESTAMPTZ avec defaut)
- Booleens : prefixe `is_` (`is_active`, `is_visible`)

### Migrations

- Fichiers SQL dans `/supabase/migrations/YYYYMMDD_description.sql`
- JAMAIS modifier une migration deja appliquee
- TOUJOURS tester la migration sur un environnement de dev avant prod
- Inclure les rollback instructions en commentaire quand possible

### Requetes

- TOUJOURS utiliser les methodes SDK Supabase (pas de raw SQL dans l'app)
- `.eq('tenant_id', tenantId)` sur CHAQUE requete multi-tenant
- `.maybeSingle()` pour les lookups qui peuvent ne rien retourner
- `.select('colonnes_necessaires')` — ne pas select `*` en production
