# Multi-espaces - Sous-projet 1 : Socle de gestion des espaces de restauration

Date : 2026-07-17
Statut : design valide (relecture user 2026-07-17 : distinction etablissement/espace actee)
Branche : `feat/multi-etablissements`

## Vocabulaire (ACTE avec le user)

- **Etablissement** = le tenant = le compte = "Radisson Blu". Un seul par compte.
- **Espace (de restauration)** = un lieu de service distinct DANS l'etablissement :
  "Panorama", "Lobby bar", "Pool", "La promenade". Plusieurs par etablissement.
  Chacun a sa carte et a terme son propre QR.

Techniquement, un **espace = une ligne de la table `venues`**. Le code et la DB
gardent le terme `venue` (colonne `venue_id`, helpers `canAddVenue`,
`assertVenueOwnedByTenant`) pour zero churn backend. SEUL l'affichage utilisateur
(route, copy i18n, libelles) emploie **"espace"**.

## Contexte et probleme

Un etablissement (un compte restaurant) peut avoir plusieurs **espaces** de
restauration physiquement distincts : plusieurs restaurants/stands/bars dans une meme
enceinte - cas du Radisson Blu, notre premier client (Panorama, lobby bar, pool,
promenade). Chaque espace doit a terme avoir son propre QR code dedie qui pointe vers
sa carte.

Le modele de donnees supporte deja ce cas : la table `venues` existe, et `menus`,
`categories`, `tables` portent un `venue_id`. Mais **l'interface admin n'utilise
jamais qu'un seul espace** : `settings/tables` prend toujours `venues[0]` en
dur, et il n'existe **aucun ecran pour creer ou gerer un 2e espace**.
L'onboarding cree un espace par defaut, point.

Ce document concerne UNIQUEMENT le **socle** : pouvoir creer/renommer/desactiver des
espaces depuis l'admin. Les briques qui s'appuient dessus (rattachement du
contenu par espace, QR par espace, storefront venue-aware) sont des
sous-projets separes, listes en fin de document.

## Objectif

Permettre a un etablissement dont le plan l'autorise de gerer plusieurs espaces depuis
`Parametres > Espaces`, avec l'espace principal protege (jamais zero).

### Criteres de succes

- Un owner sur un plan Business (maxVenues=10) peut creer un 2e espace, le
  renommer, le desactiver.
- Un owner sur un plan Starter (maxVenues=1) voit le bouton "Ajouter" desactive avec
  un upsell vers l'abonnement ; il ne peut PAS creer un 2e espace, meme via un
  appel direct a l'action (garde serveur) ou via SQL (garde trigger).
- On ne peut jamais desactiver/supprimer le dernier espace actif.
- Aucun impact sur les tenants existants (ils gardent leur espace par defaut).

## Ce qui existe deja (a reutiliser, ne pas reconstruire)

- **Entitlement** : `src/lib/plans/features.ts` -> `maxVenues` par plan
  (Starter 1, Pro 2, Business 10, Enterprise -1 = illimite).
- **Enforcement applicatif** : `src/services/plan-enforcement.service.ts` ->
  `canAddVenue(tenant)` : lit les limites du plan, `return` si illimite, compte les
  venues `is_active=true`, `throw ServiceError('VALIDATION')` avec un message
  "Limite atteinte : N etablissement(s) maximum..." si depassement. Deja teste.
  **A flipper dans le socle** : ce message dit "etablissement(s)" -> le corriger en
  "espace(s)" (fr + en si i18n) pour coller au vocabulaire acte. Ajuster le test
  correspondant.
- **Garde de propriete** : `src/services/table-config.service.ts` ->
  `assertVenueOwnedByTenant(tenantId, venueId)`.
- **Contexte abonnement** : `src/contexts/SubscriptionContext.tsx` porte deja la cle
  de limite pour les espaces (utilisable pour l'upsell cote client).
- **Table `venues`** : colonnes `id, tenant_id, name, slug, is_active, ...`.

Le garde `canAddVenue` existe mais **n'est appele par aucun flux de creation** cote
admin aujourd'hui. Le socle consiste surtout a batir l'UI + des actions minces qui
appellent ces briques existantes.

## Perimetre

### Dans le socle
- Ecran `settings/espaces` : lister, creer, renommer, desactiver un espace.
- Actions serveur `actions/venues.ts` : create / rename / deactivate.
- Methodes de service (dans `restaurant-group.service.ts`) : createVenue,
  renameVenue, deactivateVenue, avec garde de propriete tenant.
- Flip du copy de limite `canAddVenue` : "etablissement(s)" -> "espace(s)" (fr+en).
- Belt SQL : trigger bloquant l'INSERT de venue au-dela de `maxVenues` (parite avec
  le pattern `enforce_qr_customization`), + test de parite TS<->SQL.

### Hors socle (sous-projets suivants)
- Selecteur d'espace "actif" (global) dans le shell admin.
- Rattachement zones/tables/menus/categories par espace (rendre
  `settings/tables` et la gestion des menus multi-espaces).
- QR par espace (selecteur dans l'onglet "Choisir", `?v=` dans `buildQRUrl`,
  export en lot par espace).
- Storefront venue-aware (verifier que `?v=` filtre bien le menu/tables).
- Verification/ajustement du pricing exact et du copy d'upsell.

## Architecture

Suit l'architecture en 3 couches du projet.

```
settings/espaces (Server Component)
  -> fetch venues du tenant (is_active + inactifs) cote serveur
  -> <EspacesManager> (Client Component)
       liste + dialog "Ajouter" + renommer inline + desactiver
       -> actionCreateVenue / actionRenameVenue / actionDeactivateVenue
            -> getAuthenticatedUserWithTenant('settings.edit')  (auth + tenant + RBAC)
            -> createRestaurantGroupService(supabase).<methode>
                 -> canAddVenue(tenant)          (paywall, uniquement pour create)
                 -> assertVenueOwnedByTenant      (rename/deactivate)
                 -> insert/update venues
            -> revalidatePath('settings/espaces')
  Belt : trigger SQL sur venues (INSERT) applique la meme limite cote DB.
```

### Composants (chacun une responsabilite)

1. **`src/app/sites/[site]/admin/settings/espaces/page.tsx`** (Server)
   - Auth + tenant deja assures par le layout admin ; fetch la liste des venues du
     tenant (`id, name, slug, is_active` + nb de tables par venue), et l'entitlement
     courant (nb max autorise, nb actuel) pour piloter le bouton "Ajouter".
   - Passe tout en props a `EspacesManager`.

2. **`src/components/admin/settings/EspacesManager.tsx`** (Client)
   - Liste des espaces (nom, nb tables, actif/inactif, badge "principal" sur le
     plus ancien / defaut).
   - Bouton "Ajouter un espace" : desactive + upsell quand
     `nbActuel >= maxAutorise` (et `maxAutorise != -1`).
   - Renommer (dialog ou inline), desactiver (confirm, refuse le dernier actif).
   - Toasts succes/erreur (sonner). Utilise les composants shadcn (Card, Dialog,
     Button, Input, Label).

3. **`src/app/actions/venues.ts`** (Server Actions)
   - `actionCreateVenue(name: string)`
   - `actionRenameVenue(id: string, name: string)`
   - `actionDeactivateVenue(id: string)`
   - Chacune : `'use server'`, validation Zod, `getAuthenticatedUserWithTenant('settings.edit')`,
     appel service, retourne `{ success, error? }` (jamais throw vers le client),
     `revalidatePath`. Rate-limit sur create (reutiliser un limiter existant).

4. **`src/services/restaurant-group.service.ts`** (extension)
   - `createVenue(tenant, name)` : `canAddVenue(tenant)` -> genere slug unique
     (reutiliser `slug.service`) -> insert `{ tenant_id, name, slug, is_active: true }`.
   - `renameVenue(tenantId, venueId, name)` : `assertVenueOwnedByTenant` -> update name
     (slug inchange pour ne pas casser d'eventuels liens).
   - `deactivateVenue(tenantId, venueId)` : `assertVenueOwnedByTenant` -> refuse si
     c'est le dernier venue `is_active` du tenant (compte >= 2 requis) -> `is_active=false`.

5. **Migration SQL** `supabase/migrations/<ts>_venues_plan_limit_trigger.sql`
   - Fonction + trigger `BEFORE INSERT` sur `venues`, `SECURITY DEFINER`, calquee sur
     `enforce_qr_customization_entitlement` (meme migration de reference).
   - **Plan effectif** : reutiliser EXACTEMENT le calcul du trigger QR - lire
     `subscription_plan, subscription_status, trial_ends_at` de `tenants`, puis
     plan effectif = `pro` si trial actif (`status='trial' AND trial_ends_at > now()`),
     sinon `subscription_plan`, sinon `starter`. NE PAS borner sur le plan brut (un
     tenant en trial serait mal limite).
   - Mapper le plan effectif vers un plafond numerique via un `CASE`
     (`starter->1, pro->2, business->10, enterprise->NULL=illimite`), compter les
     venues `is_active` du tenant, lever `check_violation` si `>= plafond`.
     `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`.
   - Objectif : parite avec la garde TS `canAddVenue`.
   - Test de parite (comme `qr-entitlement-parity.test.ts`) : la matrice TS
     `maxVenues` et la limite SQL doivent coincider.

## Modele de donnees

Aucune nouvelle table. `venues` existe deja. Le socle n'ajoute que le trigger de
limite. Slug d'espace genere unique par tenant (reutiliser le service slug).

## Flux d'erreur

- **Limite de plan atteinte** (create) : `canAddVenue` throw `ServiceError('VALIDATION')`
  -> l'action retourne `{ success:false, error: <message limite> }` -> toast + le
  bouton etait deja desactive cote UI (double securite). Le trigger SQL est le dernier
  filet.
- **Dernier espace** (deactivate) : service throw `ServiceError('VALIDATION',
  'Impossible de desactiver le dernier espace')` -> toast.
- **Venue d'un autre tenant** : `assertVenueOwnedByTenant` throw -> 403/NOT_FOUND ->
  message generique cote client (pas de fuite).
- **Nom vide/trop long** : Zod (min 1, max ~60) -> `{ success:false, error }`.

## Securite / multi-tenant

- `tenant_id` derive de la session via `getAuthenticatedUserWithTenant`, jamais du
  client.
- Toutes les mutations gated `settings.edit` (un simple membre ne peut pas gerer les
  espaces).
- `assertVenueOwnedByTenant` sur rename/deactivate.
- Trigger SQL = filet cote DB (belt & suspenders), aligne sur le pattern existant.

## Tests

- Service (`restaurant-group.service.test.ts`) : create respecte `canAddVenue`
  (mock limites : Starter refuse le 2e, Business accepte) ; rename garde la propriete ;
  deactivate refuse le dernier actif ; isolation tenant (venue d'un autre tenant
  rejete).
- Zod : nom vide/trop long rejete.
- Parite TS<->SQL sur la limite `maxVenues`.
- Pas de test E2E dans le socle (viendra avec l'UI multi-sous-projets).

## Vocabulaire

Terme retenu dans l'UI : **"espace"** (espace de restauration). ACTE avec le user
2026-07-17 : "etablissement" designe le compte/l'enceinte (Radisson Blu), "espace"
designe chaque lieu de service (Panorama, lobby bar, pool, promenade). Le message de
limite `plan-enforcement.service.ts` dit encore "etablissement(s)" -> a corriger en
"espace(s)" dans le socle (fr + en). Code/DB gardent `venue`, sans impact technique.

## Decomposition d'ensemble (rappel, hors ce spec)

1. **Socle : gestion des espaces** <- CE DOCUMENT
2. Rattachement du contenu (zones/tables/menus) par espace
3. QR par espace (`?v=` + selecteur + export en lot)
4. Storefront venue-aware
5. Ajustement pricing + copy d'upsell
6. (Migration : neant, defaut inchange)

Chaque sous-projet suivant aura son propre spec -> plan -> implementation.
