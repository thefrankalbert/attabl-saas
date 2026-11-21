-- Gel pour remboursement: savoir QUAND il a ete pose.
--
-- CE QUI NE MARCHAIT PAS: `invoice.paid` leve le gel pour remboursement des
-- qu'une facture payee avec de l'argent arrive. Mais Stripe peut livrer un
-- ANCIEN `invoice.paid` apres coup (rejeu apres un echec de traitement). Arrive
-- apres un `charge.refunded`, ce vieux paiement levait le gel sans un franc
-- neuf: le client rembourse retrouvait l'acces gratuitement.
--
-- `refund_frozen_at` est pose avec le gel. La levee n'a lieu que si la facture
-- a ete payee APRES le gel. Une ligne sans date (gel pose par l'ancien code)
-- garde le comportement d'avant.
--
-- Colonne PRIVEE: ecrite et lue uniquement par le webhook (service_role).
-- Aucun GRANT a anon ni a authenticated; elle est classee "privee" dans
-- supabase/tests/rls/tenants_column_grants.test.sql.
--
-- Additive: le code en ligne, qui ne la connait pas, n'est pas affecte. A
-- appliquer AVANT de deployer le code qui l'ecrit.
--
-- Rollback: ALTER TABLE public.tenants DROP COLUMN refund_frozen_at;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS refund_frozen_at timestamptz;

COMMENT ON COLUMN public.tenants.refund_frozen_at IS
  'Date du gel pour remboursement. Une facture payee avant cette date ne leve pas le gel.';
