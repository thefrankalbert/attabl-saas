# Architecture en Couches - ATTABL

## Vue d'ensemble

ATTABL suit une architecture en 3 couches hermétiques :

```
[Presentation]  →  [Service]  →  [Persistance]
  Next.js UI       Logique       Supabase DB
                   Metier
```

## Couche 1 : Presentation (Next.js App Router)

**Fichiers concernes** : `src/app/`, `src/components/`

### Regles

- Les Server Components fetch les donnees via les services ou directement via Supabase (lecture seule)
- Les Client Components (`'use client'`) : uniquement pour l'interactivite (formulaires, modales, panier)
- Les pages ne contiennent PAS de logique metier complexe
- Les mutations passent par des Server Actions ou des API routes

### Pattern Server Component (lecture)

```typescript
// src/app/sites/[site]/page.tsx
export default async function MenuPage({ params }: Props) {
  const tenant = await TenantService.getBySlug(params.site);
  const menuItems = await MenuService.getByTenant(tenant.id);
  return <MenuDisplay items={menuItems} />;
}
```

### Pattern Client Component (interactivite)

```typescript
// src/components/tenant/MenuItemCard.tsx
'use client';
export function MenuItemCard({ item }: Props) {
  const { addItem } = useCart();
  return <button onClick={() => addItem(item)}>Ajouter</button>;
}
```

## Couche 2 : Service (Logique Metier)

**Fichiers concernes** : `src/services/`

### Regles

- TypeScript pur - pas d'imports Next.js (pas de `next/headers`, `next/cache`)
- Recoit un client Supabase en parametre (injection de dependance)
- Contient : validations metier, calculs, orchestration de requetes
- Retourne des objets types, jamais des Response HTTP

### Pattern Service

```typescript
// src/services/order.service.ts
export class OrderService {
  static async create(supabase: SupabaseClient, data: CreateOrderInput) {
    // 1. Valider les donnees metier
    // 2. Verifier la disponibilite
    // 3. Calculer le total
    // 4. Inserer en base
    // 5. Retourner le resultat
  }
}
```

## Couche 3 : Persistance (Supabase)

**Fichiers concernes** : `src/lib/supabase/`

### Clients disponibles

| Client     | Fichier         | Usage                           | RLS          |
| ---------- | --------------- | ------------------------------- | ------------ |
| Browser    | `client.ts`     | Composants client               | Oui          |
| Server     | `server.ts`     | Server Components, Actions, API | Oui          |
| Admin      | `admin.ts`      | Signup, Webhooks, Super Admin   | Non (bypass) |
| Middleware | `middleware.ts` | Refresh session                 | Oui          |

### Regles

- Ne JAMAIS utiliser le client admin pour des operations utilisateur standard
- Toujours filtrer par `tenant_id` dans les requetes
- Utiliser `auth.getUser()` pour verifier l'authentification (pas `getSession()`)

## Flux de donnees complet (exemple : creation de commande)

```
1. Client clique "Commander"
   → CartContext.submitOrder()

2. Appel POST /api/orders
   → API route parse la requete avec Zod
   → Verifie le rate limiting
   → Appelle OrderService.create()

3. OrderService.create()
   → Valide les donnees metier
   → Verifie les prix serveur-side
   → Insere la commande + items en base
   → Retourne { success, orderId }

4. API route retourne la reponse JSON
5. Client affiche la confirmation
```

## Anti-patterns a eviter

1. **Requete DB dans un composant React** : Toujours passer par un service ou un Server Component
2. **Logique metier dans une API route** : L'API route est un "controleur" - elle delegue au service
3. **Import de `next/headers` dans un service** : Les services sont du TypeScript pur
4. **Accepter un tenant_id en parametre client** : Toujours deriver du contexte serveur
5. **Utiliser `as` pour forcer un type** : Preferer la validation Zod
