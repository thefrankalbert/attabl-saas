# Patterns de Securite - ATTABL

## 1. Authentification

### Verifier l'utilisateur connecte

```typescript
import { createClient } from '@/lib/supabase/server';

const supabase = await createClient();
const {
  data: { user },
  error,
} = await supabase.auth.getUser();

if (!user) {
  // Rediriger ou retourner 401
}
```

**IMPORTANT** : Toujours utiliser `auth.getUser()` et non `auth.getSession()`.
`getSession()` lit le JWT sans le verifier cote serveur. `getUser()` fait un appel au serveur Supabase pour confirmer la validite du token.

### Recuperer le tenant de l'utilisateur

```typescript
const { data: adminUser } = await supabase
  .from('admin_users')
  .select('tenant_id, role')
  .eq('user_id', user.id)
  .eq('is_active', true)
  .single();
```

## 2. Isolation Multi-Tenant

### Regles d'or

1. **JAMAIS** accepter un `tenant_id` venant du client
2. Toujours deriver le `tenant_id` de la session utilisateur
3. Le RLS est un filet de securite, pas la seule protection
4. Verifier AUSSI cote application (defense en profondeur)

### Pattern : Deriver le tenant du contexte

```typescript
// BON : deriver de la session
const tenantId = adminUser.tenant_id;

// MAUVAIS : accepter du client
const tenantId = request.body.tenantId; // DANGEREUX
```

### Pattern : Double verification (belt & suspenders)

```typescript
// Le RLS filtre deja par tenant_id
// Mais on verifie aussi dans le code applicatif
const { data } = await supabase
  .from('orders')
  .select('*')
  .eq('tenant_id', tenantId) // Verification explicite
  .eq('id', orderId);
```

## 3. Validation des Entrees

### Toujours valider avec Zod AVANT d'interagir avec la DB

```typescript
import { z } from 'zod';

const CreateOrderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  tableNumber: z.string().optional(),
  notes: z.string().max(500).optional(),
});

// Dans l'API route
const parsed = CreateOrderSchema.safeParse(body);
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
}
```

### Pattern : Safe Action (Server Actions)

```typescript
// src/lib/safe-action.ts
// Wrapper qui combine : Zod + Auth + Error handling
export function createSafeAction<TInput, TOutput>(config: {
  schema: z.ZodSchema<TInput>;
  requireAuth: boolean;
  handler: (input: TInput, ctx: { user: User; tenantId: string }) => Promise<TOutput>;
}) { ... }
```

## 4. Protection des API Routes

### Checklist pour chaque API route

- [ ] Input valide avec Zod
- [ ] Authentification verifiee (si necessaire)
- [ ] Tenant_id derive de la session (pas du client)
- [ ] Rate limiting applique
- [ ] Erreurs catchees et loguees
- [ ] Pas de donnees sensibles dans la reponse d'erreur

### Pattern : API Route securisee

```typescript
export async function POST(request: Request) {
  try {
    // 1. Rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const { success } = await rateLimit.limit(ip);
    if (!success) return NextResponse.json({ error: 'Trop de requetes' }, { status: 429 });

    // 2. Validation
    const body = await request.json();
    const parsed = MySchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    // 3. Auth (si necessaire)
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

    // 4. Logique metier via service
    const result = await MyService.doSomething(supabase, parsed.data);

    // 5. Reponse
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Erreur dans /api/...', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
```

## 5. Clients Supabase : Quand utiliser lequel

| Situation                         | Client     | Fichier                      |
| --------------------------------- | ---------- | ---------------------------- |
| Composant Client (navigateur)     | Browser    | `lib/supabase/client.ts`     |
| Server Component (lecture)        | Server     | `lib/supabase/server.ts`     |
| Server Action (mutation)          | Server     | `lib/supabase/server.ts`     |
| API Route (operation utilisateur) | Server     | `lib/supabase/server.ts`     |
| Signup (creation user + tenant)   | Admin      | `lib/supabase/admin.ts`      |
| Webhook Stripe                    | Admin      | `lib/supabase/admin.ts`      |
| Super Admin                       | Admin      | `lib/supabase/admin.ts`      |
| Middleware (session)              | Middleware | `lib/supabase/middleware.ts` |

### Regle : Le client Admin (service_role) ne doit JAMAIS etre utilise pour des operations standard.

Il bypass le RLS et a acces total a la base. Usage limite a :

- Creation de comptes (signup)
- Webhooks externes (Stripe)
- Operations super admin
