-- La CAUSE du gel d'un tenant (contre-audit LOT 5, constat CTR-1 / section 8)
-- ============================================================================
-- `subscription_status = 'frozen'` est l'etat de gel GENERIQUE du projet. Il
-- a CINQ CAUSES possibles - et non cinq chemins: les chemins de code qui
-- peuvent ecrire 'frozen' sont SEPT, parce que la cause stripe_unpaid est
-- posee par trois gestionnaires differents (checkout.session.completed,
-- customer.subscription.updated, charge.dispute.closed) et que le cron en a
-- deux (essais expires, impayes depasses). Confondre les deux decomptes fait
-- croire qu'il manque deux chemins et envoie les chercher pour rien.
-- Les cinq causes:
--
--   dispute              charge.dispute.created (chargeback ouvert)
--   subscription_deleted customer.subscription.deleted
--   stripe_unpaid        Stripe dit 'unpaid', ou rend un statut inconnu
--                        (checkout.session.completed, customer.subscription.updated,
--                         charge.dispute.closed)
--   trial_expired        cron freeze-expired-trials (essai termine sans souscription)
--   past_due_overdue     cron freeze-expired-trials (impaye au-dela de 15 jours)
--
-- Aucune colonne ne les distinguait. `charge.dispute.closed` levait donc
-- N'IMPORTE LEQUEL de ces gels des qu'un litige etait gagne, et rendait un plan
-- payant a un tenant que Stripe ne couvre plus. Cette colonne porte la cause;
-- le gestionnaire de litige ne leve plus que le gel dont la cause est un litige,
-- la relecture de l'etat de l'abonnement chez Stripe restant la SECONDE
-- condition du degel.
--
-- INVARIANT tenu par le code (src/lib/billing/freeze-reason.ts): la colonne est
-- non nulle SI ET SEULEMENT SI le statut vaut 'frozen'. Elle est donc effacee a
-- chaque sortie de gel. C'est ce qui rend le dispositif robuste a un chemin de
-- gel futur qui oublierait de l'ecrire: il trouvera NULL, jamais une cause
-- heritee, et NULL ne leve aucun gel.
--
-- Deploiement: le code part en production AVANT cette migration (regle du
-- depot). Tant que la colonne est absente, les ecritures sont rejouees sans elle
-- et la lecture de la cause rend "inconnue", donc aucun gel n'est leve. Aucun
-- 500 n'est renvoye au webhook - un endpoint durablement en erreur finit
-- DESACTIVE par Stripe.
--
-- Pas de retro-remplissage: on ne peut pas DEVINER la cause des gels existants,
-- et une valeur inventee serait pire que NULL. Les tenants deja geles gardent
-- donc NULL et ne se degelent pas sur un litige gagne - la direction sure. La
-- plupart se reparent par un paiement (checkout.session.completed ou
-- invoice.paid), qui reecrit statut et cause.
--
-- CONSEQUENCE ASSUMEE, a surveiller par l'exploitant: un tenant GELE POUR
-- LITIGE au moment du deploiement, lui, n'a rien a payer - son abonnement est
-- en ordre chez Stripe, c'est le chargeback qui l'a gele. Avec freeze_reason a
-- NULL, charge.dispute.closed ne levera pas son gel quand il gagnera son
-- litige: il restera coupe jusqu'au prochain customer.subscription.updated
-- portant un statut sain (roulement de periode: jusqu'a un an sur une formule
-- annuelle), ou jusqu'a une intervention manuelle. Ce n'est pas une fuite
-- d'argent, c'est un client paye prive d'acces. Cout nul a eviter: AVANT
-- d'appliquer cette migration, relever les tenants subscription_status='frozen'
-- ayant un litige ouvert chez Stripe et leur poser freeze_reason='dispute' a la
-- main - population qui se compte sur les doigts.
--
-- Pas de contrainte CHECK sur les valeurs: ajouter une cause cote code ne doit
-- pas exiger une migration, et une valeur inconnue est traitee comme "pas un
-- litige", donc sans risque.
--
-- Droits: la migration 20260420000002_restrict_tenant_billing_updates a revoque
-- UPDATE sur public.tenants pour authenticated et anon, puis l'a re-accorde
-- colonne par colonne. Une colonne ajoutee apres ne recoit aucun GRANT: elle est
-- donc reservee a service_role, exactement comme subscription_status,
-- is_active et past_due_since. Les REVOKE ci-dessous sont donc des NO-OP:
-- aucun privilege n'a jamais ete accorde sur cette colonne, et Postgres emet au
-- pire un WARNING sans faire echouer la migration. Ils sont conserves pour
-- DOCUMENTER et VERSIONNER l'intention - rien de plus. Ils ne protegent de
-- rien: un REVOKE execute aujourd'hui ne contraint pas un GRANT execute demain,
-- et un privilege accorde au niveau TABLE couvre toutes les colonnes, y compris
-- celles pour lesquelles un REVOKE colonne a ete tente auparavant. Si quelqu'un
-- re-accorde un jour UPDATE au niveau table sur public.tenants, cette colonne
-- sera exposee comme les autres: la seule parade est de ne pas le faire.
--
-- Rollback:
--   alter table public.tenants drop column if exists freeze_reason;
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS freeze_reason text;

COMMENT ON COLUMN public.tenants.freeze_reason IS
  'Cause du gel: dispute, subscription_deleted, stripe_unpaid, trial_expired, past_due_overdue. Non nulle SI ET SEULEMENT SI subscription_status = ''frozen''. Lue par charge.dispute.closed, qui ne leve que le gel dont la cause est un litige. service_role uniquement.';

REVOKE UPDATE (freeze_reason) ON public.tenants FROM authenticated;
REVOKE UPDATE (freeze_reason) ON public.tenants FROM anon;
