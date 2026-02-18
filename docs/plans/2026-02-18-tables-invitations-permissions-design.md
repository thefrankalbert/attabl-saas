# Tables, Invitations & Permissions granulaires — Design

## Vue d'ensemble

Trois features interconnectees pour completer la gestion operationnelle d'ATTABL :

1. **Configuration des tables** : onboarding + page admin dediee
2. **Invitation par email** : inviter des membres d'equipe avec magic link
3. **Permissions granulaires** : matrice de permissions par role, overridable par tenant et par individu

---

## Feature A : Configuration des tables

### A1 — Onboarding (nouvelle etape 2 sur 5)

L'onboarding passe de 4 a 5 etapes :

1. Etablissement (existant)
2. **Vos tables** (nouveau)
3. Branding (existant, etait etape 2)
4. Menu (existant, etait etape 3)
5. Lancement (existant, etait etape 4)

#### Trois modes

| Mode                       | Description                               | Donnees creees                                                       |
| -------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| **Configuration complete** | Ajouter zones + nommer tables + capacites | Zones + tables personnalisees                                        |
| **Minimum viable**         | Ajouter zones + nombre de tables par zone | Zones + tables auto-numerotees                                       |
| **Skip**                   | Bouton "Configurer plus tard"             | 1 zone "Salle principale" (SAL) + N tables (tableCount de l'etape 1) |

#### Auto-numerotation

Format : `{PREFIX}-{N}` (ex: INT-1, INT-2, TER-1, TER-2)

- Le prefixe est auto-deduit du nom de zone (3 premieres lettres uppercase)
- Le owner peut modifier le prefixe
- `table_number` = identifiant technique (ne change jamais apres creation)
- `display_name` = nom affiche (modifiable a volonte)

#### Donnees creees en DB

- 1 `venue` par restaurant (existant, cree au signup)
- N `zones` rattachees au venue (`name`, `prefix`, `display_order`)
- M `tables` par zone (`table_number`, `display_name`, `capacity`, `is_active`)

### A2 — Page admin `/admin/settings/tables`

Page dediee accessible depuis les parametres (owner/admin uniquement).

#### Layout

- **Colonne gauche** : liste des zones (drag-and-drop pour reordonner via `display_order`), bouton "+ Ajouter une zone"
- **Zone principale** : grille des tables de la zone selectionnee

#### Actions sur les zones

- Renommer (nom + prefixe)
- Supprimer (confirmation requise — cascade supprime les tables de la zone)
- Reordonner (drag-and-drop modifie `display_order`)

#### Actions sur les tables

- Renommer (`display_name`) — le `table_number` technique reste inchange
- Changer la capacite (dropdown : 1-12)
- Activer/desactiver (toggle `is_active` — table invisible dans POS, QR, TablePicker mais reste en DB)
- Supprimer (confirmation requise)
- Bouton "+ Ajouter des tables" : modale → combien ? capacite par defaut ? → auto-numerotation continue

#### Propagation automatique

Tous les composants existants lisent depuis `zones` + `tables` en DB :

- `TablePicker` : selection zone/table cote client
- `ServiceManager` : grille admin assignation serveurs
- `QRCodePage` : generation QR codes par table
- `OrderCard` / `OrderDetails` : affichage du numero de table

Modifier en DB = modifie partout sans code supplementaire. Les QR codes existants restent valides (le `table_number` ne change jamais).

---

## Feature B : Systeme d'invitation par email

### B1 — Deux modes dans la page Equipe

Le bouton "Ajouter un membre" ouvre une modale avec deux onglets :

#### Onglet 1 : "Inviter par email" (nouveau)

1. Owner/Admin entre : email + role + permissions custom (optionnel)
2. Le systeme verifie si l'email a deja un compte ATTABL :
   - **Oui** : insert direct dans `admin_users` + email de notification
   - **Non** : cree une entree dans `invitations` (status `pending`) + email d'invitation via Resend avec magic link
3. La personne clique le lien → page `/auth/accept-invite?token=xxx`
4. Token expire apres 72h. Le owner peut renvoyer l'invitation.

#### Onglet 2 : "Creation directe" (existant, ameliore)

Meme flow qu'aujourd'hui : email + mot de passe temporaire + role. Utile quand la personne est physiquement presente.

### B2 — Table `invitations`

```sql
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'chef', 'waiter')),
  custom_permissions JSONB,
  invited_by UUID NOT NULL REFERENCES admin_users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_tenant ON invitations(tenant_id);
CREATE INDEX idx_invitations_email ON invitations(email);
```

RLS : seuls les owner/admin du tenant peuvent voir/creer des invitations.

### B3 — Email d'invitation (Resend)

- **Subject** : "Rejoignez l'equipe de {restaurantName} sur ATTABL"
- **Body** : nom du restaurant, logo, role attribue, bouton CTA "Accepter l'invitation", mention expiration 72h
- Template HTML responsive (meme style que le stock alert existant)

### B4 — Page `/auth/accept-invite`

Flux :

1. Verification du token : existe ? pas expire ? status `pending` ?
2. **Token invalide/expire** : message d'erreur + lien "Contacter le proprietaire"
3. **Token valide** :
   - Si l'invite a deja un compte ATTABL (detecte via email) : bouton "Accepter l'invitation" + login
   - Sinon : formulaire (nom complet + mot de passe) → cree le compte → accepte l'invitation
4. Acceptation : insert `admin_users` + update invitation status → `accepted` + redirect vers dashboard

### B5 — Gestion cote owner

Dans la page Equipe :

- Section "Invitations en attente" avec liste des invitations pending
- Actions : renvoyer l'email, annuler l'invitation
- Les invitations expirees sont marquees via lazy check (a chaque chargement de la page)

---

## Feature C : Permissions granulaires par role

### C1 — Matrice de permissions par defaut

12 permissions regroupees en 6 categories :

| Permission              | Code             | Owner | Admin | Manager | Cashier | Chef | Waiter |
| ----------------------- | ---------------- | ----- | ----- | ------- | ------- | ---- | ------ |
| Voir le menu            | `menu.view`      | oui   | oui   | oui     | oui     | oui  | oui    |
| Modifier le menu        | `menu.edit`      | oui   | oui   | oui     | non     | non  | non    |
| Voir les commandes      | `orders.view`    | oui   | oui   | oui     | oui     | oui  | oui    |
| Gerer les commandes     | `orders.manage`  | oui   | oui   | oui     | oui     | oui  | non    |
| Voir les rapports       | `reports.view`   | oui   | oui   | oui     | non     | non  | non    |
| Utiliser la caisse      | `pos.use`        | oui   | oui   | oui     | oui     | non  | non    |
| Voir le stock           | `inventory.view` | oui   | oui   | oui     | non     | oui  | non    |
| Modifier le stock       | `inventory.edit` | oui   | oui   | oui     | non     | non  | non    |
| Voir l'equipe           | `team.view`      | oui   | oui   | oui     | non     | non  | non    |
| Gerer l'equipe          | `team.manage`    | oui   | oui   | non     | non     | non  | non    |
| Voir les parametres     | `settings.view`  | oui   | oui   | non     | non     | non  | non    |
| Modifier les parametres | `settings.edit`  | oui   | oui   | non     | non     | non  | non    |

### C2 — Stockage : deux niveaux d'override

#### Niveau 1 : Override par role (pour tout le restaurant)

Nouvelle table `role_permissions` :

```sql
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'chef', 'waiter')),
  permissions JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES admin_users(id),
  CONSTRAINT role_permissions_unique UNIQUE (tenant_id, role)
);
```

Le JSONB ne contient que les overrides (ce qui differe des defaults). Ex: `{"reports.view": true}` pour donner aux managers l'acces aux rapports.

#### Niveau 2 : Override par individu

Nouvelle colonne `custom_permissions JSONB` sur `admin_users` :

```sql
ALTER TABLE admin_users ADD COLUMN custom_permissions JSONB DEFAULT NULL;
```

Permet au owner de dire "ce serveur specifique peut aussi voir le stock" sans changer les permissions de tous les serveurs.

#### Ordre de resolution

```
custom_permissions (individu) > role_permissions (tenant) > defaults (matrice)
```

### C3 — Helper de verification

```typescript
function hasPermission(
  adminUser: AdminUser,
  permission: PermissionCode,
  roleOverrides?: RolePermissions | null,
): boolean {
  // 1. Check individual override
  if (adminUser.custom_permissions?.[permission] !== undefined) {
    return adminUser.custom_permissions[permission];
  }
  // 2. Check role override for this tenant
  if (roleOverrides?.permissions?.[permission] !== undefined) {
    return roleOverrides.permissions[permission];
  }
  // 3. Fall back to default matrix
  return DEFAULT_PERMISSIONS[adminUser.role][permission];
}
```

Utilise dans :

- Server Actions (avant execution)
- API Routes (avant execution)
- Composants admin (afficher/masquer elements du sidebar)
- Middleware (optionnel, pour bloquer les routes)

### C4 — UI : Page "Permissions" dans les parametres

- Accessible uniquement au role `owner`
- Affiche la matrice complete sous forme de grille de toggles (switches on/off)
- Chaque ligne = un role, chaque colonne = une permission
- Les cases owner sont grisees (non modifiables — toujours tout acces)
- Bouton "Restaurer les defauts" par role
- Les modifications sont sauvegardees dans `role_permissions`

---

## Schema de donnees — resume

### Nouvelles tables

| Table              | Colonnes cles                                     | But                                          |
| ------------------ | ------------------------------------------------- | -------------------------------------------- |
| `invitations`      | tenant_id, email, role, token, status, expires_at | Invitations par email                        |
| `role_permissions` | tenant_id, role, permissions (JSONB)              | Overrides de permissions par role par tenant |

### Colonnes ajoutees

| Table         | Colonne              | Type           | But                                   |
| ------------- | -------------------- | -------------- | ------------------------------------- |
| `admin_users` | `custom_permissions` | JSONB nullable | Overrides de permissions par individu |

### Tables existantes utilisees (pas de modification)

| Table                 | Utilisation                                             |
| --------------------- | ------------------------------------------------------- |
| `venues`              | Rattachement des zones                                  |
| `zones`               | Configuration des zones (nom, prefixe, ordre)           |
| `tables`              | Configuration des tables (numero, nom, capacite, actif) |
| `admin_users`         | Membres d'equipe avec roles                             |
| `onboarding_progress` | Suivi des etapes (passe de 4 a 5)                       |

---

## Securite

- RLS sur `invitations` : seuls owner/admin du tenant
- RLS sur `role_permissions` : lecture par tous les membres du tenant, ecriture owner uniquement
- Tokens d'invitation : 64 chars crypto random, expires apres 72h
- Le role `owner` ne peut jamais etre invite (seulement cree au signup)
- Les permissions du role `owner` ne sont jamais modifiables
- Validation Zod sur toutes les entrees (emails, roles, permissions)
- Rate limiting sur l'endpoint d'acceptation d'invitation (anti brute-force token)
