# Retrait du mobile money - cash uniquement (2026-06-29)

## Decision

On ne propose plus de paiement mobile (Wave, Orange Money, MTN MoMo, Free Money) pour
l'instant. Le produit encaisse en **especes uniquement**. L'architecture reste prete a
re-accueillir le mobile money et les pays cibles sans rearchitecture.

## Ce qui a ete supprime (code reel des providers)

| Fichier                                               | Role                             |
| ----------------------------------------------------- | -------------------------------- |
| `src/lib/wave/client.ts`                              | Client API Wave                  |
| `src/lib/orange-money/client.ts`                      | Client API Orange Money          |
| `src/app/api/orders/[id]/pay-wave/route.ts`           | Initiation paiement Wave         |
| `src/app/api/orders/[id]/pay-orange-money/route.ts`   | Initiation paiement Orange Money |
| `src/app/api/wave/webhook/route.ts`                   | Webhook Wave                     |
| `src/app/api/orange-money/callback/route.ts`          | Callback Orange Money            |
| `src/app/api/__tests__/orange-money-callback.test.ts` | Tests du callback supprime       |

Le code de reference reste dans l'historique git (commit precedant ce retrait) si on doit
le restaurer.

## Source de verite : le registre central

Nouveau fichier `src/lib/payments/methods.ts`. C'est l'unique endroit qui declare les
moyens de paiement et lesquels sont actifs :

```ts
export const PAYMENT_METHODS = {
  cash: { active: true },
  card: { active: false },
  wave: { active: false, countries: ['SN', 'CI'] },
  orange_money: { active: false, countries: ['SN', 'CI', 'ML', 'BF', 'CM'] },
  mtn_momo: { active: false, countries: ['CI', 'CM', 'BF', 'CG'] },
  free_money: { active: false, countries: ['SN'] },
};
```

`ACTIVE_PAYMENT_METHOD_IDS` (= `['cash']` aujourd'hui) et `DEFAULT_PAYMENT_METHODS` en
derivent. Les surfaces UI et la validation serveur lisent ce registre :

- `src/components/admin/settings/PaymentMethodsSettings.tsx` - n'affiche que les moyens actifs.
- `src/app/actions/payment-methods.ts` - la Server Action refuse tout moyen non actif (un client ne peut pas reactiver Wave en bidouillant la requete).
- `src/app/sites/[site]/admin/settings/page.tsx` - defaut d'un nouveau tenant = `DEFAULT_PAYMENT_METHODS`.
- `src/components/admin/PaymentModal.tsx` (POS) - especes uniquement, plus de selecteur carte/mobile.

## Marketing nettoye

- `src/app/(marketing)/pricing/page.tsx` - ligne de comparaison "mobileMoney" retiree (on n'annonce plus un moyen desactive).
- `src/app/(marketing)/page.tsx` - meta description : "encaissement mobile money" -> "caisse integree".

## Pour reactiver un moyen plus tard

1. Dans `src/lib/payments/methods.ts`, passer le moyen voulu a `active: true`.
2. Pour un moyen mobile money : re-ajouter son client provider (`src/lib/<provider>/`) plus ses routes API d'initiation et de webhook (cf. historique git).
3. Le selecteur des reglages tenant et la validation serveur le prennent en compte automatiquement.
4. Pour le POS : re-ajouter un selecteur de moyen dans `PaymentModal.tsx` (aujourd'hui force a `cash`).
5. Verifier les cles i18n `paymentMethod.<id>.label` / `.desc` (conservees dans `src/messages/*.json`).

## Volontairement conserve

- Les cles i18n des moyens (`paymentMethod.wave`, etc.) et le libelle POS - reutilisables a la reactivation, aucun impact runtime.
- La colonne DB `tenants.enabled_payment_methods` - inchangee (les valeurs historiques restent lisibles ; seuls les moyens actifs sont proposes).
- Les limiteurs `paymentInitiationLimiter` / `webhookLimiter` dans `src/lib/rate-limit.ts` (fichier protege) - scaffolding reutilisable, non references tant qu'aucun provider n'est actif.
- L'article de blog `src/app/(marketing)/blog/pos-mobile-money-afrique/` - contenu editorial sur le marche, pas une promesse de fonctionnalite active.

## Verification

5 portes vertes apres retrait : typecheck OK, lint 0 warning, format OK, 900 tests, build OK.
