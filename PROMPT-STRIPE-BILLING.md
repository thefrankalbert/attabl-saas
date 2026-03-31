# PROMPT CLAUDE CODE - Stripe Billing & Subscription Lifecycle

## Contexte

ATTABL est un SaaS multi-tenant pour la restauration/hotellerie. Stripe est deja integre (checkout, webhooks, trial 14j). Il faut maintenant completer le cycle de vie des abonnements.

## Ce qui existe deja (NE PAS casser)

- `src/lib/stripe/server.ts` - Config Stripe + price IDs (essentiel monthly/yearly, premium monthly/yearly)
- `src/app/api/create-checkout-session/route.ts` - Checkout avec trial_period_days: 14
- `src/app/api/webhooks/stripe/route.ts` - Gere 5 events (checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed, invoice.paid)
- `src/app/api/invoices/route.ts` - Liste des factures
- `src/contexts/SubscriptionContext.tsx` - Detection trial, plan effectif
- `src/components/tenant/SubscriptionManager.tsx` - UI gestion abonnement
- `src/services/plan-enforcement.service.ts` - Limites par plan
- `src/lib/plans/features.ts` - Definition des limites (source de verite)
- `src/types/billing.ts` - Types TypeScript
- Base de donnees : champs subscription_plan, subscription_status, trial_ends_at, stripe_customer_id, stripe_subscription_id, billing_interval, subscription_current_period_start/end sur la table tenants

## Taches a realiser

### PRIORITE 1 : Nouvelle structure de plans

Les plans changent. Voici la nouvelle structure :

| Plan       | Prix mensuel (XAF)            | Prix semestriel (-15%) | Prix annuel (-20%) |
| ---------- | ----------------------------- | ---------------------- | ------------------ |
| STARTER    | 39 000                        | 33 150/mois            | 31 200/mois        |
| PRO        | 79 000                        | 67 150/mois            | 63 200/mois        |
| BUSINESS   | 149 000                       | 126 650/mois           | 119 200/mois       |
| ENTERPRISE | Sur devis (pas de self-serve) | -                      | -                  |

Actions :

1. Mettre a jour `src/lib/stripe/server.ts` avec les nouveaux price IDs (il faudra creer les produits/prices dans le Stripe Dashboard d'abord)
2. Ajouter la periode semestrielle (6 mois) comme option de billing_interval. Le type dans `billing.ts` doit passer de `'monthly' | 'yearly'` a `'monthly' | 'semiannual' | 'yearly'`
3. Mettre a jour `src/lib/plans/features.ts` avec les limites par plan :
   - STARTER : 1 etablissement, 1 admin, 3 staff, POS basique, menu QR, commandes dine-in + takeaway, dashboard basique. PAS de KDS, PAS de stock, PAS de tables, PAS de multi-devises
   - PRO : 1 etablissement, 1 admin, 10 staff, POS complet, KDS, tables + serveurs, pourboires, stock + fiches techniques, fournisseurs, multi-devises, rapports de vente, gestion equipe (roles/permissions)
   - BUSINESS : jusqu'a 10 etablissements, admins illimites, staff illimite, tout PRO + room service, delivery, analytics IA, rapports multi-sites
   - ENTERPRISE : illimite (gere manuellement)
4. Mettre a jour `SubscriptionManager.tsx` avec les 3 plans + Enterprise "Contactez-nous"
5. Le plan de l'essai gratuit 14 jours est PRO (pas premium comme avant)

### PRIORITE 2 : Toggle de facturation (mensuel / 6 mois / annuel)

Sur la page pricing (`src/app/(marketing)/pricing/page.tsx`) :

1. Ajouter un toggle 3 positions : "Mensuel" | "6 mois -15%" | "Annuel -20%"
2. Au clic, les prix sur les cartes changent instantanement (state local React)
3. Le lien "Commencer" passe le billing_interval au checkout
4. Meme toggle dans `SubscriptionManager.tsx` pour les changements de plan

### PRIORITE 3 : Mode gele (post-essai et post-echec de paiement)

Apres les 14 jours d'essai sans paiement, ou apres echec de paiement definitif :

1. Le menu public reste visible (les clients du restaurant voient toujours le menu QR)
2. Le bouton "Commander" est desactive. Message : "Etablissement en cours de configuration."
3. Le dashboard admin est accessible en lecture seule (le proprietaire voit ses stats mais ne peut rien modifier)
4. Un bandeau permanent s'affiche : "Votre essai a expire. Choisissez un plan pour continuer." avec lien vers pricing

Implementation suggeree :

- Ajouter un statut `frozen` dans le type SubscriptionStatus (en plus de trial, active, past_due, cancelled, paused)
- Dans le middleware ou dans SubscriptionContext, detecter le statut frozen
- Creer un composant `FrozenBanner` similaire a `TrialBanner`
- Dans les Server Actions et API routes, bloquer les mutations (create, update, delete) si le tenant est frozen. Les lectures restent autorisees.
- Cote client (menu public), verifier le statut du tenant. Si frozen : afficher le menu, mais desactiver la fonctionnalite de commande avec le message ci-dessus.

### PRIORITE 4 : Grace period (7 jours sur echec de paiement)

Quand `invoice.payment_failed` est recu :

1. Mettre le statut a `past_due` (deja fait)
2. NE PAS geler immediatement. Le compte reste actif pendant 7 jours (Stripe retente automatiquement via Smart Retries)
3. Afficher un bandeau d'alerte : "Votre paiement a echoue. Mettez a jour votre carte." avec lien vers la page de mise a jour de carte
4. Apres 7 jours sans paiement reussi (`customer.subscription.deleted` recu de Stripe), passer en mode `frozen`

Configuration Stripe Dashboard requise :

- Aller dans Settings > Billing > Subscriptions and emails > Manage failed payments
- Activer Smart Retries
- Configurer la dunning : 3 tentatives sur 7 jours
- Apres echec final : marquer la subscription comme "canceled"
- Activer les emails automatiques Stripe pour les echecs de paiement

### PRIORITE 5 : Gestion de la carte bancaire

Implementer un endpoint pour creer une Stripe Customer Portal session :

```typescript
// src/app/api/billing-portal/route.ts
const session = await stripe.billingPortal.sessions.create({
  customer: tenant.stripe_customer_id,
  return_url: `${process.env.NEXT_PUBLIC_APP_URL}/sites/${slug}/admin/subscription`,
});
return NextResponse.json({ url: session.url });
```

Le Stripe Customer Portal permet au client de :

- Mettre a jour sa carte bancaire
- Voir ses factures
- Changer de plan (upgrade/downgrade)
- Annuler son abonnement

Configuration Stripe Dashboard requise :

- Aller dans Settings > Billing > Customer Portal
- Activer les fonctionnalites : Update payment method, View invoices, Switch plans, Cancel subscription

### PRIORITE 6 : Webhooks manquants

Ajouter ces events dans `src/app/api/webhooks/stripe/route.ts` :

1. `customer.subscription.trial_will_end` - Stripe l'envoie 3 jours avant la fin de l'essai. Utiliser pour envoyer la notification J-3 et afficher le bandeau d'urgence.
2. `invoice.payment_action_required` - Quand une verification 3D Secure est requise. Afficher un bandeau : "Action requise pour votre paiement."

### PRIORITE 7 : Notifications J-3 et J-1

Quand le webhook `customer.subscription.trial_will_end` arrive :

1. Mettre a jour un champ `trial_warning_sent` sur le tenant
2. Le `TrialBanner` existe deja et gere le decompte - verifier qu'il fonctionne correctement pour J-3 et J-1
3. Pour les emails : utiliser un service d'email (Resend, SendGrid) ou les emails automatiques Stripe (plus simple pour le MVP)

## Regles

- Respecter les conventions du projet (voir CLAUDE.md)
- Pas de caracteres Unicode speciaux (em dash, smart quotes, etc.)
- Logique metier dans /services/, pas dans les composants
- Validation Zod obligatoire sur toutes les entrees
- Utiliser `logger` au lieu de `console.*`
- Tester les webhooks avec `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

## Ordre d'implementation suggere

1. D'abord creer les nouveaux produits/prices dans le Stripe Dashboard
2. Puis mettre a jour le code (plans, features, limites)
3. Puis le toggle de facturation sur la page pricing
4. Puis le mode gele + grace period
5. Puis le billing portal
6. Puis les webhooks supplementaires
7. Tester le cycle complet : inscription -> essai -> expiration -> gel -> paiement -> reactivation
