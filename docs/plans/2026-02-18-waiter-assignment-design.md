# Waiter-Table Assignment System — Design Document

**Date:** 2026-02-18
**Status:** Approved
**Feature:** Assignation serveur-table et traçabilité commandes

---

## 1. Objectif

Permettre aux restaurants d'assigner des serveurs aux tables et de tracer quel serveur a servi chaque commande. Deux modes de fonctionnement coexistent :

- **Self-service** : pas de serveur, le client commande seul via QR code
- **Service premium** : un serveur claim une table ou une commande, sa trace est visible en cuisine et dans les rapports

## 2. Decisions

| Decision                 | Choix                                           |
| ------------------------ | ----------------------------------------------- |
| Scope du claim           | Table entiere (shift) + commande individuelle   |
| Multi-tables par serveur | Oui, illimite                                   |
| Multi-serveurs par table | Oui (pas de contrainte UNIQUE)                  |
| Pourboires               | Tracabilite seulement (pas de paiement integre) |
| Architecture             | Nouvelle table `table_assignments`              |
| Assignation par manager  | Oui, via dropdown (pas de drag-and-drop)        |

## 3. Modele de donnees

### 3.1 Nouvelle table `table_assignments`

```sql
CREATE TABLE table_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_id    UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  server_id   UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,  -- NULL = assignment actif
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pas de UNIQUE constraint : plusieurs serveurs peuvent servir la meme table
CREATE INDEX idx_table_assignments_active
  ON table_assignments(tenant_id, table_id) WHERE (ended_at IS NULL);
CREATE INDEX idx_table_assignments_server
  ON table_assignments(server_id) WHERE (ended_at IS NULL);
CREATE INDEX idx_table_assignments_tenant
  ON table_assignments(tenant_id);

-- RLS
ALTER TABLE table_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON table_assignments
  FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### 3.2 Colonnes existantes (deja en DB, non utilisees)

```
orders.server_id   UUID FK → admin_users(id) -- le serveur qui a servi
orders.cashier_id  UUID FK → admin_users(id) -- le caissier qui a encaisse
orders.assigned_to UUID FK → admin_users(id) -- assignation generique
```

Ces colonnes existent depuis la migration `20260217_permissions_system.sql`. Elles ne sont pas encore dans l'interface TypeScript `Order` ni utilisees dans le code.

### 3.3 TypeScript — nouveaux types

```typescript
export interface TableAssignment {
  id: string;
  tenant_id: string;
  table_id: string;
  server_id: string;
  started_at: string;
  ended_at: string | null;
  // Joins
  server?: AdminUser;
  table?: Table;
}
```

Ajouter a l'interface `Order` existante :

```typescript
server_id?: string;
cashier_id?: string;
assigned_to?: string;
// Joins
server?: AdminUser;
```

## 4. Flux utilisateur

### Flux 1 — Self-service (inchange)

```
Client scanne QR → Menu → Panier → Valide commande
→ orders.server_id = NULL
→ Commande arrive en cuisine sans serveur
```

### Flux 2 — Serveur claim une table (shift)

```
1. Serveur ouvre dashboard sur tablette
2. Voit la liste des tables
3. Clique "Je sers" sur table 7 → INSERT table_assignments
4. Client sur table 7 passe commande normalement
5. API detecte assignment actif sur table 7
   → orders.server_id = server_id du assignment le plus recent
6. KDS cuisine affiche "Table 7 — Jeremy L."
7. Fin de service : serveur clique "Liberer" → UPDATE ended_at = now()
```

### Flux 3 — Serveur claim une commande individuelle

```
1. Commande arrive sans serveur (table non assignee)
2. Serveur voit la commande dans "Non assignees"
3. Clique "Prendre en charge" → UPDATE orders.server_id = son ID
```

### Flux 4 — Manager assigne un serveur

```
1. Manager ouvre la page "Service" dans le dashboard
2. Voit la grille des tables avec dropdown serveur
3. Selectionne "Jeremy" sur table 7 → INSERT table_assignments
4. Peut aussi reassigner (release + nouveau assignment)
```

## 5. Composants UI

| Composant                 | Page                             | Role                                                       |
| ------------------------- | -------------------------------- | ---------------------------------------------------------- |
| `ServiceManager`          | `/admin/service` (nouvelle page) | Vue manager : grille tables avec dropdown serveur          |
| `ServerDashboard`         | Integre dans sidebar serveur     | Mes tables, commandes non-assignees, boutons claim/release |
| `KDSTicket` (modifie)     | `/admin/kitchen`                 | Affiche nom du serveur sur chaque ticket                   |
| `OrderDetails` (modifie)  | Modale detail commande           | Affiche serveur + bouton reassigner                        |
| `OrdersClient` (modifie)  | `/admin/orders`                  | Colonne "Serveur" dans DataTable                           |
| `ReportsClient` (modifie) | `/admin/reports`                 | Section "Performance par serveur"                          |

## 6. Service layer

### `assignment.service.ts` (nouveau)

```typescript
export function createAssignmentService(supabase: SupabaseClient) {
  return {
    // Claim table pour un shift
    async assignServerToTable(tenantId, tableId, serverId): TableAssignment,
    // Release table
    async releaseTable(assignmentId): void,
    // Release toutes les tables d'un serveur (fin de shift)
    async releaseAllForServer(tenantId, serverId): void,
    // Claim commande individuelle
    async claimOrder(orderId, serverId): void,
    // Trouver le serveur actif pour une table
    async getActiveServerForTable(tenantId, tableId): AdminUser | null,
    // Lister les assignments actifs d'un tenant
    async getActiveAssignments(tenantId): TableAssignment[],
    // Lister les assignments d'un serveur
    async getServerAssignments(serverId): TableAssignment[],
  };
}
```

### Modification de `order.service.ts`

Dans `createOrderWithItems()`, apres avoir cree la commande :

1. Lookup `table_assignments` actifs pour ce `table_id`
2. Si un assignment existe → set `orders.server_id` au serveur le plus recent (`started_at DESC LIMIT 1`)
3. Si aucun → `server_id` reste NULL

## 7. API routes

| Route                          | Methode | Role                                   |
| ------------------------------ | ------- | -------------------------------------- |
| `/api/assignments`             | GET     | Liste assignments actifs du tenant     |
| `/api/assignments`             | POST    | Creer un assignment (claim table)      |
| `/api/assignments/[id]`        | DELETE  | Release un assignment                  |
| `/api/assignments/release-all` | POST    | Release toutes les tables d'un serveur |
| `/api/orders/[id]/claim`       | POST    | Claim commande individuelle            |

Toutes les routes : rate limiting + auth + role check (waiter/manager/admin/owner).

## 8. Realtime

- Subscribe `table_assignments` (INSERT/UPDATE/DELETE) → invalide TanStack Query cache
- Subscribe `orders` changes → met a jour la vue serveur en temps reel
- Deja en place via le pattern Supabase Realtime existant

## 9. Ce qui n'est PAS inclus

- Paiement de pourboire integre (Stripe Connect)
- Historique detaille des shifts (calendrier)
- Notifications push au serveur
- Interface mobile dediee (on utilise le dashboard responsive)

## 10. Fichiers impactes

### Nouveaux fichiers

- `supabase/migrations/20260218_table_assignments.sql`
- `src/services/assignment.service.ts`
- `src/lib/validations/assignment.schema.ts`
- `src/app/api/assignments/route.ts`
- `src/app/api/assignments/[id]/route.ts`
- `src/app/api/assignments/release-all/route.ts`
- `src/app/api/orders/[id]/claim/route.ts`
- `src/components/admin/ServiceManager.tsx`
- `src/components/admin/ServerDashboard.tsx`
- `src/hooks/queries/useAssignments.ts`
- `src/hooks/mutations/useAssignment.ts`
- `src/app/sites/[site]/admin/service/page.tsx`

### Fichiers modifies

- `src/types/admin.types.ts` — ajouter TableAssignment, maj Order
- `src/services/order.service.ts` — auto-assign server_id
- `src/lib/validations/order.schema.ts` — ajouter server_id optionnel
- `src/app/api/orders/route.ts` — passer server_id au service
- `src/components/admin/KDSTicket.tsx` — afficher serveur
- `src/components/admin/OrdersClient.tsx` — colonne serveur
- `src/components/admin/OrderDetails.tsx` — afficher/reassigner serveur
- `src/components/admin/POSClient.tsx` — auto-assign cashier_id
- `src/components/admin/ReportsClient.tsx` — stats par serveur
- `src/components/admin/AdminSidebar.tsx` — lien page Service
- `src/messages/*.json` — traductions i18n (8 locales)
