# Audit du parcours de conversion ATTABL - landing -> abonnement Business

Date : 2026-06-23. Methode : parcours LIVE de bout en bout dans un vrai navigateur (Playwright headed)
sur un build de production local (port 3100), Stripe en mode TEST (carte 4242, zero charge reelle),
webhook reel forwarde via `stripe listen`. Preuves : screenshots desktop (1440) + mobile (375) par ecran
dans `/tmp/audit/evidence/`. Audit 3 dimensions (securite, UX, coherence design) orchestre via /workflows.

## 1. Resume executif

Le parcours complet fonctionne de bout en bout : landing -> pricing -> signup -> confirmation email ->
login -> onboarding (welcome + 3 phases) -> lancement -> dashboard -> page abonnement -> checkout Business
-> Stripe -> succes. L'abonnement Business passe correctement par Stripe.

L'audit a revele 3 bugs fonctionnels reels (corriges) + 1 ecart d'environnement de dev. Aucune faille de
securite bloquante sur le parcours (CSP a nonce presente partout, donnees carte confinees a l'iframe Stripe,
auth gating correct, 0 erreur 4xx/console sur les pages du funnel). Responsive : 0 debordement horizontal sur
les 8 pages cles en 375px.

Scores (parcours de conversion) : Securite 9/10 - UX 7.5/10 - Design 8/10.

## 2. Verification Stripe Business (preuve)

- Checkout embarque Stripe rendu correctement, badge "TEST MODE", essai "7 jours gratuits puis 149 000 FCFA/mois".
- Carte test `4242 4242 4242 4242` acceptee -> redirection `/checkout/success?session_id=cs_test_...`.
- Webhook `checkout.session.completed` recu (stripe listen) -> serveur : "Tenant activated via checkout: plan=business, billingInterval=monthly".
- DB : `tenants.subscription_plan = business`, `billing_interval = monthly`, `stripe_customer_id` et
  `stripe_subscription_id` renseignes, `subscription_status = trial` (periode d'essai Stripe de 7 jours).
- Mode TEST confirme (cles `sk_test`/`pk_test`), abonnement test en periode d'essai : **aucune charge reelle**.

Conclusion : le paiement Business via Stripe passe de bout en bout (paiement + webhook + activation tenant).

## 3. Findings classes par severite

| ID    | Severite | Dimension   | Ecran             | Probleme                                                                                                                                              | Statut    |
| ----- | -------- | ----------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| F-A   | High     | Fonctionnel | onboarding (menu) | Creation du menu par defaut echoue : `menus.slug` NOT NULL viole (PG 23502). Le menu n'est pas cree.                                                  | CORRIGE   |
| F-B   | High     | Fonctionnel | onboarding (menu) | Creation des categories echoue : colonne `categories.sort_order` inexistante (PGRST204). Aucune categorie/article cree a l'onboarding.                | CORRIGE   |
| F-C   | Low      | UX/Copy     | /checkout/success | La page de succes affichait "14 jours d'essai gratuit" alors que Stripe annonce les jours d'essai reels restants (7). Copie trompeuse.                | CORRIGE   |
| F-D   | Info     | Dev-env     | .env.local        | `NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_*` sont des placeholders en local -> paiement impossible en dev sans vrai price id de test. (prod a les vrais ids) | DOCUMENTE |
| OBS-1 | Medium   | UX          | dashboard         | Les cartes affichaient "En hausse aujourd'hui" meme avec 0 donnee sur un tenant neuf (revendication de tendance fausse).                              | CORRIGE   |

Detail des correctifs (F-A, F-B, F-C) en section 5.

## 4. Coherence inter-pages

- Identite visuelle coherente sur tout le funnel (logo ATTABL vert, fond clair, typo Geist, accent olive).
- Checkout : panneau gauche (recap plan + "Paiement securise par Stripe") coherent avec le branding ; panneau
  droit = iframe Stripe (TEST MODE) - normal et attendu.
- Page de succes minimale et centree, coherente.
- Pas d'incoherence majeure de tokens couleur/typo detectee sur les pages auditees.

## 5. Correctifs appliques (verifies)

1. **F-A** `src/services/onboarding.service.ts` (insert `menus`) : ajout de `slug: 'carte-principale'`
   (la colonne `menus.slug` est NOT NULL).
2. **F-B** meme fichier (insert `categories`) : suppression du champ `sort_order` inexistant ; on conserve
   `display_order` (la vraie colonne).
3. **F-C** `src/messages/fr-FR.json` + `en-US.json` (`checkout.successDescription`) : suppression du nombre de
   jours code en dur ("14 jours") - copie generique sans chiffre faux.

Verification : payloads d'insert corriges valides contre le schema reel (insert menu+categorie OK, 0 erreur
23502/PGRST204) ; 5 portes vertes (typecheck, lint 0 warning, format, 855 tests, build) ; parcours Stripe
Business re-prouve en live.

## 6. Limite de l'audit automatise (transparence)

Le /workflows d'audit (14 ecrans x 3 dimensions, ~124 agents) a genere 81 findings bruts puis s'est
interrompu sur une LIMITE DE SESSION (tokens) avant la phase de verification adversariale : ces 81 findings
n'ont PAS pu etre verifies/dedupliques, donc non integres ici (eviter les faux positifs). A re-lancer apres
reset du quota (resume du run possible via le scriptPath du workflow) pour completer l'audit UX/design fin.

Les findings de cette section (F-A..F-D, OBS-1) sont issus de l'observation directe du parcours live et sont
confirmes.

## 7. Plan de correction priorise

1. [FAIT] F-A, F-B - bugs fonctionnels onboarding (menu/categories) - corriges + verifies.
2. [FAIT] F-C - copie essai page succes.
3. [FAIT] OBS-1 - dashboard affiche "Pas encore de tendance" quand aucune donnee de la veille n'existe
   (cles i18n kpiFlat/kpiAvgFlat ; logique line1 conditionnee a trend !== undefined).
4. [A FAIRE post-reset] Re-lancer le workflow d'audit pour verifier les 81 findings UX/design bruts.
