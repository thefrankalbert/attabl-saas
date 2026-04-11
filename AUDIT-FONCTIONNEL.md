# AUDIT FONCTIONNEL - ATTABL SaaS

**Projet :** ATTABL SaaS
**Date :** 2026-04-11
**Mode :** Lecture seule - aucune modification de code
**Scope :** Tous les composants, services, API routes, Server Actions, middleware

---

## RESUME EXECUTIF

| Severite  | Nombre | Zones impactees             |
| --------- | ------ | --------------------------- |
| CRITIQUE  | **8**  | Paiement, securite, donnees |
| HAUTE     | **15** | Auth, panier, commandes, UX |
| MOYENNE   | **18** | UX, edge cases, performance |
| BASSE     | **10** | Code quality, accessibilite |
| **TOTAL** | **51** |                             |

---

## BUG SIGNALE PAR L'UTILISATEUR : SCROLL COMMANDES RECENTES

### BUG-00 : Impossible de scroller dans "Commandes recentes" du Dashboard

**Fichier :** `src/components/admin/DashboardClient.tsx`
**Lignes :** 305, 330, 538, 553
**Severite :** HAUTE

**Diagnostic :** La chaine de scroll est cassee sur tablette. Voici le probleme :

```
Ligne 305 : <div className="h-full flex flex-col p-3 ... overflow-hidden">
  Ligne 330 : <div className="flex-1 min-h-0 ... overflow-y-auto @lg:overflow-hidden">
    Ligne 538 : <div className="flex-1 min-h-[200px] @lg:min-h-0 ... overflow-hidden">
      Ligne 553 : <div className="overflow-hidden flex-1 min-h-0 flex flex-col">
        Ligne 554 : <div className="overflow-y-auto flex-1 scrollbar-hide">  <-- SEUL element scrollable
```

**Probleme 1 :** Ligne 305 — Le conteneur racine a `overflow-hidden` qui empeche tout debordement. Sur tablette, si la hauteur calculee de la colonne droite (commandes) depasse le viewport, le contenu est tronque mais pas scrollable.

**Probleme 2 :** Ligne 330 — `overflow-y-auto @lg:overflow-hidden` signifie que sous le breakpoint `@lg` (container query), le conteneur parent EST scrollable. Mais au-dessus de `@lg` (cas tablette paysage et desktop), `overflow-hidden` est applique. Si la colonne droite n'a pas assez de hauteur (car `flex-1` ne peut pas s'etendre au-dela de la hauteur du parent `overflow-hidden`), le scroll interne a la ligne 554 ne fonctionne pas.

**Probleme 3 :** Ligne 538 — `min-h-[200px]` force une hauteur minimale de 200px sur la colonne des commandes. Sur mobile/tablette, cette hauteur est insuffisante pour afficher les 15 commandes (`.slice(0, 15)`), et `overflow-hidden` sur ce conteneur EMPECHE le scroll de la div enfant.

**Probleme 4 :** Ligne 553 — `overflow-hidden` sur le wrapper intermediaire entre la colonne et le `overflow-y-auto` — c'est un conteneur superflu qui pourrait clipper le scroll.

**Correction :**

```tsx
// Ligne 305 : Retirer overflow-hidden du root (il est gere par main#main-content)
<div className="h-full flex flex-col p-3 sm:p-5 lg:p-6 xl:p-8 2xl:p-10">

// Ligne 330 : Garder overflow-hidden a tous les breakpoints car le scroll doit etre dans la colonne droite
<div className="flex-1 min-h-0 flex flex-col @md:flex-row @lg:flex-row gap-3 overflow-hidden">

// Ligne 538 : Retirer min-h-[200px] et overflow-hidden, utiliser min-h-0 pour permettre flex shrink
<div className="flex-1 min-h-0 flex flex-col min-w-0 border border-app-border rounded-xl">

// Ligne 553 : Retirer overflow-hidden du wrapper intermediaire
<div className="flex-1 min-h-0 flex flex-col">
```

**Verification :** Apres correction, tester sur 768px (tablette portrait), 1024px (tablette paysage), 1280px (desktop). Le scroll doit fonctionner dans la liste des commandes recentes uniquement.

---

## PHASE 1 : BUGS CRITIQUES (8)

### BUG-01 : Extension illimitee de la periode d'essai Stripe

**Fichier :** `src/app/api/create-checkout-session/route.ts` (lignes 131-138)
**Severite :** CRITIQUE

**Probleme :** La session checkout Stripe est hardcodee avec `trial_period_days: 14`. Si un utilisateur s'inscrit avec un essai de 14 jours (cree dans `signup.service.ts` ligne 56-68), puis change de plan pendant l'essai, il obtient 14 jours d'essai supplementaires. En repetant l'operation, l'essai est illimite.

**Correction :** Ne pas mettre `trial_period_days` dans la session checkout, OU le rendre conditionnel :

```tsx
// Dans create-checkout-session/route.ts
const hasExistingTrial = tenant.trial_ends_at && new Date(tenant.trial_ends_at) > new Date();
const trialDays = hasExistingTrial
  ? Math.ceil((new Date(tenant.trial_ends_at).getTime() - Date.now()) / 86400000)
  : tenant.subscription_status === 'trial' ? 14 : undefined;

// Utiliser trialDays au lieu de 14 en dur
subscription_data: {
  trial_period_days: trialDays,
}
```

---

### BUG-02 : Race condition coupon claim/order creation sans transaction

**Fichier :** `src/app/api/orders/route.ts` (lignes 157-163, 191-195)
**Severite :** CRITIQUE

**Probleme :** `claimUsage()` est appele AVANT `createOrderWithItems()`. Si la commande echoue partiellement (certains items inseres, commande echouee), `unclaimUsage()` dans le catch peut aussi echouer, laissant le compteur de coupon incorrect.

**Correction :** Wrapper les deux operations dans une transaction DB, ou utiliser un pattern saga avec compensation garantie :

```tsx
// Option 1 : Transaction
const { data, error } = await supabase.rpc('create_order_with_coupon', {
  order_data: ...,
  coupon_id: ...,
});

// Option 2 : Saga avec retry
try {
  const order = await orderService.createOrderWithItems(input);
  try {
    await couponService.claimUsage(couponId, order.id);
  } catch {
    // Rollback order si coupon fail
    await orderService.cancelOrder(order.id);
    throw new ServiceError('COUPON_CLAIM_FAILED', ...);
  }
}
```

---

### BUG-03 : Resolution tenant par domaine custom sans verification

**Fichier :** `src/proxy.ts` (lignes 81-111)
**Severite :** CRITIQUE

**Probleme :** Quand un domaine custom est resolu via `getCachedTenantByDomain()`, le `tenantSlug` retourne est utilise directement pour le header `x-tenant-slug`. Pas de verification que le hostname de la requete correspond reellement au domaine configure en base.

**Correction :**

```tsx
// Apres getCachedTenantByDomain()
const cachedResult = await getCachedTenantByDomain(hostWithoutPort);
if (cachedResult && cachedResult.domain === hostWithoutPort) {
  // OK - le domaine correspond
  tenantSlug = cachedResult.slug;
} else {
  // Mismatch - ignorer le cache
  tenantSlug = null;
}
```

---

### BUG-04 : Destock inventaire silencieux sans validation

**Fichier :** `src/services/inventory.service.ts` (lignes 118-126)
**Severite :** CRITIQUE

**Probleme :** L'appel RPC `destockOrder` n'a aucune validation que la commande existe ou que les items existent avant de tenter le destock. Si le RPC echoue silencieusement, la commande reussit mais l'inventaire n'est pas mis a jour.

**Correction :**

```tsx
const { data, error } = await supabase.rpc('destock_order', { ... });
if (error) {
  throw new ServiceError('INVENTORY_DESTOCK_FAILED', `Destock failed: ${error.message}`);
}
if (data === 0) {
  logger.warn('destockOrder returned 0 items updated', { orderId });
}
```

---

### BUG-05 : Double-soumission de commande possible

**Fichier :** `src/app/sites/[site]/cart/page.tsx` (lignes 474-536, 1122)
**Severite :** CRITIQUE

**Probleme :** `handleSubmitOrder` set `isSubmitting` via useState, mais le state update est asynchrone. Un double-clic rapide peut envoyer 2 requetes avant que le state ne se mette a jour. Le bouton est disable par `isSubmitting || items.length === 0` (ligne 1122) mais avec la latence du state React, ce n'est pas suffisant.

**Correction :**

```tsx
// Utiliser un ref pour bloquer immediatement
const submitLock = useRef(false);

const handleSubmitOrder = async () => {
  if (submitLock.current) return;
  submitLock.current = true;
  setIsSubmitting(true);
  try {
    // ... logique existante
  } finally {
    submitLock.current = false;
    setIsSubmitting(false);
  }
};
```

---

### BUG-06 : Validation des modifiers obligatoires absente

**Fichier :** `src/components/tenant/ItemDetailSheet.tsx` (lignes 128-181, 468-490)
**Severite :** CRITIQUE

**Probleme :** Le ItemDetailSheet permet d'ajouter un item au panier SANS valider les modifiers obligatoires. Le type `ItemModifier` dans `admin.types.ts` (lignes 278-288) n'a PAS de champ `is_required`, et le bouton "Ajouter au panier" n'a aucune validation.

**Correction :**

1. Ajouter `is_required: boolean` au type `ItemModifier`
2. Avant l'ajout au panier :

```tsx
const missingRequired = modifiers.filter((m) => m.is_required && !selectedModifiers[m.id]);
if (missingRequired.length > 0) {
  toast.error(t('selectRequiredModifiers'));
  return;
}
```

---

### BUG-07 : Signup venue creation sans rollback

**Fichier :** `src/services/signup.service.ts` (lignes 192-193)
**Severite :** CRITIQUE

**Probleme :** Apres creation de l'auth user, du tenant, et de l'admin_user (avec rollbacks), `createDefaultVenue()` est appele sans gestion d'erreur. Si ca echoue, le tenant existe sans venue — ce qui casse les features qui attendent au moins une venue.

**Correction :**

```tsx
try {
  await createDefaultVenue(supabase, tenant.id);
} catch (venueError) {
  logger.error('Failed to create default venue, rolling back signup', { venueError });
  // Rollback tenant + admin_user + auth user
  await rollbackSignup(supabase, tenant.id, adminUser.id, authUser.id);
  throw new ServiceError('SIGNUP_FAILED', 'Could not complete signup');
}
```

---

### BUG-08 : Password reset sans confirmation email

**Fichier :** `src/proxy.ts` (lignes 162-182), `src/app/api/forgot-password/route.ts`
**Severite :** CRITIQUE

**Probleme :** Le middleware bloque les utilisateurs non-confirmes des routes protegees MAIS autorise l'acces a `/reset-password` et `/auth/*`. Un attaquant peut :

1. S'inscrire avec l'email de quelqu'un sans confirmer
2. Cliquer "Mot de passe oublie"
3. Recevoir un lien de recovery (le endpoint a un fallback qui envoie un lien de confirmation)
4. Changer le mot de passe pour un compte non confirme

**Correction :** Dans `/api/forgot-password/route.ts`, verifier que l'email est confirme avant d'envoyer le lien de reset. Sinon, envoyer uniquement le lien de confirmation.

---

## PHASE 2 : BUGS HAUTS (15)

### BUG-09 : Desynchronisation essai DB / essai Stripe

**Fichier :** `src/services/signup.service.ts` (lignes 56-68) + `src/app/api/create-checkout-session/route.ts` (lignes 131-138)
**Severite :** HAUTE

**Probleme :** Le signup cree un tenant avec `subscription_status: 'trial'` et `trial_ends_at` en base. Le checkout Stripe ajoute `trial_period_days: 14` independamment. Les deux periodes d'essai ne sont pas synchronisees.

**Correction :** Un seul mecanisme d'essai : soit la base, soit Stripe. Supprimer `trial_period_days` de Stripe et gerer l'essai uniquement via la base.

---

### BUG-10 : Cle de panier inconsistante (cart item key)

**Fichier :** `src/app/sites/[site]/cart/page.tsx` (lignes 53-62)
**Severite :** HAUTE

**Probleme :** La fonction `getCartItemKey` dans cart/page.tsx n'inclut PAS les modifiers dans la cle. Un "Burger avec fromage" et un "Burger sans fromage" sont traites comme LE MEME item. Les boutons +/- modifient le mauvais item.

Le `CartContext.getCartItemKey()` (ligne 138-154) inclut les modifiers. Il y a une incoherence entre les deux.

**Correction :** Aligner `getCartItemKey` de cart/page.tsx sur celui de CartContext :

```tsx
function getCartItemKey(item: CartItem): string {
  const modKey =
    item.selectedModifiers
      ?.map(
        (m) =>
          `${m.id}:${m.options
            .map((o) => o.id)
            .sort()
            .join(',')}`,
      )
      .sort()
      .join('|') || '';
  return `${item.id}-${modKey}`;
}
```

---

### BUG-11 : Bulk toggle items sans feedback granulaire

**Fichier :** `src/components/admin/ItemsClient.tsx` (lignes 263-292)
**Severite :** HAUTE

**Probleme :** Le toggle de disponibilite en masse utilise `Promise.all()` et si certains items echouent et d'autres reussissent, le toast est generique. Le state `selectedIds` est clear meme si des operations ont echoue.

**Correction :**

```tsx
const results = await Promise.allSettled(promises);
const succeeded = results.filter((r) => r.status === 'fulfilled').length;
const failed = results.filter((r) => r.status === 'rejected').length;
if (failed > 0) {
  toast.warning(t('partialSuccess', { succeeded, failed }));
} else {
  toast.success(t('allUpdated', { count: succeeded }));
}
// Ne clear selectedIds que si tout a reussi
if (failed === 0) setSelectedIds([]);
```

---

### BUG-12 : Plan limit check ne reset pas le loading state

**Fichier :** `src/components/admin/ItemsClient.tsx` (lignes 222-226)
**Severite :** HAUTE

**Probleme :** Quand `actionCheckCanAddMenuItem` retourne une erreur (limite de plan atteinte), la fonction return early SANS reset `setSaving(false)`. Le spinner de chargement reste indefiniment.

**Correction :**

```tsx
const canAdd = await actionCheckCanAddMenuItem(tenantId);
if (canAdd?.error) {
  toast.error(canAdd.error);
  setSaving(false); // <-- MANQUANT
  return;
}
```

---

### BUG-13 : Textes hardcodes non traduits

**Fichiers :**

- `src/components/tenant/SearchOverlay.tsx` ligne 97 : `aria-label="Effacer"` — hardcode en francais
- `src/components/tenant/InstallPrompt.tsx` ligne 150 : `Installer ${appName} sur votre ecran d'accueil` — hardcode en francais

**Severite :** HAUTE

**Correction :** Utiliser les cles i18n : `t('clearSearch')` et `t('installOnHomeScreen', { appName })`.

---

### BUG-14 : Advance status en masse sans verification d'etat

**Fichier :** `src/components/admin/OrdersClient.tsx` (lignes 483-495)
**Severite :** HAUTE

**Probleme :** Le bouton "avancer le statut" en masse appelle `handleStatusChange()` pour chaque commande selectionnee SANS verifier si toutes les commandes sont dans un etat valide pour la transition. Les commandes deja livrees/annulees ne changent pas, mais l'utilisateur ne recoit aucun feedback.

**Correction :** Filtrer les commandes eligibles avant de traiter, et afficher le nombre de commandes non-eligibles.

---

### BUG-15 : Redirect apres paiement Stripe sans verification

**Fichier :** `src/app/checkout/success/page.tsx` (lignes 19-40) + `src/app/api/verify-checkout/route.ts`
**Severite :** HAUTE

**Probleme :** La page success requiert l'auth (`getUser()` ligne 35). Les utilisateurs non-confirmes touchent un 401. De plus, la page ne met pas a jour `subscription_status` — elle attend le webhook qui peut avoir du retard (secondes a minutes).

**Correction :** Afficher un etat "Verification en cours..." et poller le status de l'abonnement toutes les 2 secondes pendant 30 secondes max.

---

### BUG-16 : Coupon state du panier non synchronise avec le serveur

**Fichier :** `src/contexts/CartContext.tsx` (ligne 424)
**Severite :** HAUTE

**Probleme :** `applyCoupon()` cache le coupon en localStorage sans verifier que le `couponId` retourne par l'API correspond bien au tenant actuel. Un XSS ou une interception pourrait injecter un coupon invalide.

**Correction :** Valider cote serveur lors de la creation de commande que le coupon appartient bien au tenant (deja fait partiellement dans orders/route.ts, mais renforcer).

---

### BUG-17 : Confirmation page commande : pas de detail remise/taxe

**Fichier :** `src/app/sites/[site]/order-confirmed/page.tsx` (lignes 309-369)
**Severite :** HAUTE

**Probleme :** La page de confirmation affiche les items, le pourboire et le total, mais PAS :

- Le code coupon applique
- Le montant de la remise
- La taxe (si activee)
- Les frais de service (si actives)

**Correction :** Afficher le meme detail de prix que dans la page panier.

---

### BUG-18 : Delete avec `confirm()` natif non accessible

**Fichiers :**

- `src/components/admin/ItemsClient.tsx` (ligne 240-241)
- `src/components/admin/CategoriesClient.tsx` (ligne 181-193)

**Severite :** HAUTE

**Probleme :** Utilisation de `window.confirm()` qui n'est pas accessible (pas de role ARIA, pas de focus management). Devrait utiliser le composant Dialog de shadcn/ui.

**Correction :** Remplacer tous les `confirm()` par un `<AlertDialog>` shadcn/ui.

---

### BUG-19 : Tolerance de prix a 1% trop large

**Fichier :** `src/services/order.service.ts` (ligne 191)
**Severite :** HAUTE

**Probleme :** `Math.abs(item.price - expectedPrice) > expectedPrice * 0.01` autorise 1% d'ecart. Pour un item a 100 000 XOF, ca represente 1 000 XOF non detectes.

**Correction :** Tolerance stricte a 0 ou tolerance absolue fixe :

```tsx
// Tolerance absolue : max 1 unite de la devise (ex: 1 XOF, 0.01 EUR)
if (Math.abs(item.price - expectedPrice) > 1) { ... }
```

---

### BUG-20 : Pas de pagination des commandes

**Fichier :** `src/components/admin/OrdersClient.tsx`
**Severite :** HAUTE

**Probleme :** Toutes les commandes sont chargees en memoire. Un tenant avec 10 000+ commandes aura un chargement extremement lent et une consommation memoire excessive.

**Correction :** Implementer la pagination avec `offset`/`limit` ou le scroll virtuel.

---

### BUG-21 : Couleurs de statut identiques sur confirmation commande

**Fichier :** `src/app/sites/[site]/order-confirmed/page.tsx` (lignes 391-435)
**Severite :** HAUTE

**Probleme :** Les statuts `pending`, `preparing`, `ready`, `delivered` ont TOUS le meme fond gris. Le client ne peut pas distinguer visuellement l'etat de sa commande.

**Correction :** Couleurs distinctes :

- pending → orange/amber
- preparing → bleu
- ready → vert vif
- delivered → gris
- cancelled → rouge

---

### BUG-22 : CORS non explicite sur les API orders

**Fichiers :** `src/app/api/orders/route.ts`, `src/app/api/orders/pos/route.ts`
**Severite :** HAUTE

**Probleme :** Pas de header `Access-Control-Allow-Origin` explicite. Next.js gere le CORS par defaut, mais le comportement implicite peut casser avec certaines configurations.

**Correction :** Ajouter les headers CORS explicitement dans `next.config.mjs` ou dans chaque route.

---

### BUG-23 : Confirmation email signup non idempotente

**Fichier :** `src/services/signup.service.ts` (lignes 195-216)
**Severite :** HAUTE

**Probleme :** Si l'email de confirmation echoue et l'utilisateur recharge, `generateLink()` sera appele a nouveau, envoyant potentiellement des emails en double.

**Correction :** Tracker en base si le lien a deja ete genere/envoye, ou limiter les tentatives.

---

## PHASE 3 : BUGS MOYENS (18)

### BUG-24 : Race condition checkout simultane

**Fichier :** `src/app/api/create-checkout-session/route.ts` (lignes 113-140)
**Severite :** MOYENNE

**Probleme :** Deux onglets du meme utilisateur peuvent creer deux sessions checkout simultanees, resultant en deux abonnements Stripe.

**Correction :** Ajouter un flag `checkout_in_progress` en base ou un verrou.

---

### BUG-25 : Onboarding data non persiste au retour

**Fichier :** `src/app/onboarding/page.tsx` (lignes 205-241)
**Severite :** MOYENNE

**Probleme :** La position de l'etape est sauvegardee mais pas les donnees intermediaires. Fermer le navigateur et revenir = donnees perdues pour l'etape en cours.

**Correction :** Auto-save apres chaque changement de donnees ou alerte beforeunload.

---

### BUG-26 : Forgot password retourne toujours 200

**Fichier :** `src/app/api/forgot-password/route.ts` (lignes 44-88)
**Severite :** MOYENNE

**Probleme :** Le endpoint retourne `{ success: true }` meme si l'envoi d'email echoue completement. L'utilisateur attend un email qui n'arrivera jamais.

**Correction :** Distinguer "email envoye" de "erreur d'envoi" sans reveler si l'utilisateur existe.

---

### BUG-27 : Accept invite ne verifie pas l'expiration du token

**Fichier :** `src/app/auth/accept-invite/page.tsx` (lignes 89-127)
**Severite :** MOYENNE

**Probleme :** Le formulaire s'affiche meme si le token d'invitation est expire. L'utilisateur remplit tout, soumet, et recoit une erreur generique.

**Correction :** Valider la fraicheur du token au chargement de la page et afficher "Invitation expiree" immediatement.

---

### BUG-28 : Session non invalidee immediatement entre onglets

**Fichier :** `src/lib/supabase/middleware.ts` (ligne 44)
**Severite :** MOYENNE

**Probleme :** Deconnexion dans un onglet mais l'autre onglet reste authentifie pendant quelques secondes (le middleware rafraichit le cookie).

**Correction :** Utiliser Supabase Realtime pour ecouter les changements de session cross-tab.

---

### BUG-29 : Drag reorder categories sans protection concurrence

**Fichier :** `src/components/admin/CategoriesClient.tsx` (lignes 104-151)
**Severite :** MOYENNE

**Probleme :** L'update optimiste du cache peut etre ecrase par un refetch concurrent pendant la sauvegarde du reorder.

**Correction :** Desactiver le drag pendant la sauvegarde.

---

### BUG-30 : Delete categorie sans verifier association menu

**Fichier :** `src/components/admin/CategoriesClient.tsx` (lignes 181-193)
**Severite :** MOYENNE

**Probleme :** Verifie `items_count > 0` mais pas si la categorie est liee a un menu. Supprimer une categorie liee cree des relations orphelines.

**Correction :** Verifier les associations menu-categorie avant suppression.

---

### BUG-31 : Validation tenant service couleurs manquante

**Fichier :** `src/services/tenant.service.ts` (lignes 47-87)
**Severite :** MOYENNE

**Probleme :** `primaryColor` et `secondaryColor` sont stockes directement sans valider le format hex/RGB.

**Correction :** Ajouter validation regex : `/^#[0-9A-Fa-f]{6}$/`.

---

### BUG-32 : Pas de rate limit sur resolution domaine custom

**Fichier :** `src/proxy.ts` (lignes 82-111)
**Severite :** MOYENNE

**Probleme :** `getCachedTenantByDomain()` est appele sur chaque requete domaine custom sans rate limit. Un flood de domaines invalides peut surcharger la base.

**Correction :** Cacher les resultats negatifs et/ou rate limiter par IP.

---

### BUG-33 : Quantite negative non verifiee dans le service

**Fichier :** `src/services/order.service.ts` (ligne 215)
**Severite :** MOYENNE

**Probleme :** Zod valide `quantity.min(1)` mais le service lui-meme n'a pas de garde. Si l'objet valide est modifie en memoire avant l'appel, des quantites negatives peuvent passer.

**Correction :** Ajouter `if (item.quantity < 1) throw new ServiceError(...)` dans `validateOrderItems`.

---

### BUG-34 : Recipe query sans validation tenant

**Fichier :** `src/services/inventory.service.ts` (lignes 78-87)
**Severite :** MOYENNE

**Probleme :** La requete filtre par `menu_item_id` et `tenant_id`, mais si le `menu_item_id` est d'un autre tenant, la requete retourne vide sans erreur.

**Correction :** Valider que le `menu_item_id` existe dans le tenant avant de chercher les recettes.

---

### BUG-35 : Arrondi prix pour grands montants

**Fichier :** `src/lib/pricing/tax.ts` (lignes 23-26, 32-39)
**Severite :** MOYENNE

**Probleme :** `Math.round(((subtotal * tax_rate) / 100) * 100) / 100` peut avoir des erreurs de precision pour de tres grands montants (>1M).

**Correction :** Utiliser une librairie decimal ou arrondir avec `Number((...).toFixed(2))`.

---

### BUG-36 : InstallPrompt 3 dismissals = permanent block

**Fichier :** `src/components/tenant/InstallPrompt.tsx` (lignes 66-74, 124-129)
**Severite :** MOYENNE

**Probleme :** Apres 3 refus, le prompt ne s'affiche plus jamais. Pas de reset possible.

**Correction :** Reset le compteur apres 30 jours ou ajouter une option dans les parametres.

---

### BUG-37 : MultiStep form items sans warning beforeunload

**Fichier :** `src/components/admin/ItemsClient.tsx`
**Severite :** MOYENNE

**Probleme :** Fermer l'onglet pendant la creation d'un item en multi-etapes = donnees perdues sans avertissement.

**Correction :** Ajouter `useEffect` avec `window.addEventListener('beforeunload', ...)`.

---

### BUG-38 : Coupon validation sans timeout

**Fichier :** `src/components/features/pos/POSCart.tsx`
**Severite :** MOYENNE

**Probleme :** Si l'API de validation coupon ne repond pas, `couponLoading` reste true indefiniment.

**Correction :** Ajouter un timeout de 10 secondes.

---

### BUG-39 : Pas de debounce sur recherche/filtres

**Fichiers :** `src/components/admin/OrdersClient.tsx`, `src/components/admin/ItemsClient.tsx`
**Severite :** MOYENNE

**Probleme :** Chaque frappe dans le champ de recherche trigger un re-render et une invalidation de query.

**Correction :** Debounce de 300ms sur le state de recherche.

---

### BUG-40 : Bulk delete commandes sans cascade check

**Fichier :** `src/components/admin/OrdersClient.tsx` (lignes 402-451)
**Severite :** MOYENNE

**Probleme :** `actionDeleteOrders` peut ne pas supprimer en cascade les order_items, paiements, et audit logs.

**Correction :** Verifier que la suppression est atomique avec CASCADE ou gerer manuellement.

---

### BUG-41 : Erreur onboarding step crash toute la page

**Fichier :** `src/app/onboarding/page.tsx`
**Severite :** MOYENNE

**Probleme :** Pas d'Error Boundary autour des composants d'etapes. Si un step throw, toute la page est cassee.

**Correction :** Wrapper chaque step dans un Error Boundary avec fallback.

---

## PHASE 4 : BUGS BAS (10)

### BUG-42 : Timezone trial_ends_at non UTC

**Fichier :** `src/services/signup.service.ts` (lignes 57-58)
**Severite :** BASSE

**Probleme :** `setDate(getDate() + 14)` utilise la date locale. L'essai peut finir 1 jour plus tot/tard selon le timezone.

**Correction :** Utiliser `new Date(Date.now() + 14 * 86400000).toISOString()`.

---

### BUG-43 : TablePicker utilise Promise.resolve() inutilement

**Fichier :** `src/components/tenant/TablePicker.tsx` (lignes 40, 46)
**Severite :** BASSE

**Probleme :** `Promise.resolve(zones[0]).then(setSelectedZone)` — asynchrone inutile sur une valeur synchrone.

**Correction :** `setSelectedZone(zones[0])` directement.

---

### BUG-44 : QRScanner pas de retry apres refus permission

**Fichier :** `src/components/tenant/QRScanner.tsx` (lignes 165-169)
**Severite :** BASSE

**Probleme :** L'etat erreur ne propose pas de bouton "Reessayer" ni de saisie manuelle.

**Correction :** Ajouter bouton retry + fallback saisie manuelle.

---

### BUG-45 : Category icons fallback incomplet

**Fichier :** `src/components/tenant/ClientMenuPage.tsx` (lignes 154-165)
**Severite :** BASSE

**Probleme :** `getCatImg()` n'a pas d'icone pour "salads", "seafood", "vegetarian". Fallback sur "caribbean.png".

**Correction :** Ajouter les icones manquantes ou utiliser un fallback generique neutre.

---

### BUG-46 : Coupon capping logic peu lisible

**Fichier :** `src/services/coupon.service.ts` (lignes 71-85)
**Severite :** BASSE

**Probleme :** Le discount est cap deux fois (par `max_discount_amount` puis par `orderSubtotal`). Logique correcte mais confuse.

**Correction :** Ajouter un commentaire explicatif.

---

### BUG-47 : OAuth email non valide defensivement

**Fichier :** `src/services/signup.service.ts` (ligne 39)
**Severite :** BASSE

**Probleme :** L'email OAuth n'est pas re-valide cote service (Supabase le fait, mais defense en profondeur).

**Correction :** `if (!input.email.includes('@')) throw new ServiceError(...)`.

---

### BUG-48 : Rate limiter pas de log au demarrage

**Fichier :** `src/lib/rate-limit.ts` (lignes 63-70)
**Severite :** BASSE

**Probleme :** Si Redis n'est pas configure en production, le rate limiting est desactive silencieusement.

**Correction :** Logger un warning au startup, pas seulement quand un check est effectue.

---

### BUG-49 : Forgot password fallback logic non documentee

**Fichier :** `src/app/api/forgot-password/route.ts` (lignes 49-88)
**Severite :** BASSE

**Probleme :** Si le recovery echoue, le code envoie silencieusement un email de confirmation. Pas documente.

**Correction :** Ajouter un commentaire explicatif clair.

---

### BUG-50 : Pas de navigation clavier dans les listes

**Fichier :** `src/components/admin/OrdersClient.tsx`
**Severite :** BASSE

**Probleme :** Les lignes de commandes ne repondent pas aux fleches du clavier.

**Correction :** Ajouter des handlers clavier pour la navigation.

---

### BUG-51 : Upload image sans indicateur de progression

**Fichier :** `src/components/admin/ItemsClient.tsx` (ligne 593)
**Severite :** BASSE

**Probleme :** Pas de barre de progression pendant l'upload d'image.

**Correction :** Ajouter un indicateur dans le composant ImageUpload.

---

## INSTRUCTIONS D'EXECUTION

### Ordre de priorite

1. **D'abord les CRITIQUES** (BUG-00 a BUG-08) — ce sont des bugs qui affectent l'integrite des donnees, la securite, ou empechent l'utilisation
2. **Puis les HAUTS** (BUG-09 a BUG-23) — bugs visibles par les utilisateurs ou risques financiers
3. **Puis les MOYENS** (BUG-24 a BUG-41) — edge cases et ameliorations UX
4. **Enfin les BAS** (BUG-42 a BUG-51) — qualite de code et polish

### Verification apres chaque correction

```bash
pnpm typecheck    # Types TypeScript
pnpm lint         # ESLint
pnpm test         # Tests unitaires
pnpm build        # Build production
```

### IMPORTANT : Pas de conflit avec la session en cours

Ce document est un audit en LECTURE SEULE. Les corrections doivent etre executees dans une session separee, fichier par fichier, en verifiant qu'aucun autre agent n'a modifie le meme fichier entre-temps.

Avant de corriger un fichier, toujours faire :

```bash
git diff src/path/to/file.tsx  # Verifier s'il a ete modifie recemment
```
