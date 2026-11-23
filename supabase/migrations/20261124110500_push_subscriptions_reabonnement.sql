-- ============================================================================
-- Audit B139 (Moyenne): un membre desactive dans un restaurant peut se
-- reabonner aux alertes d'un autre restaurant depuis le meme appareil.
--
-- CE QUI NE TENAIT PAS. La politique "Un membre gere ses abonnements push de
-- son restaurant" (`20261108120000`, identique en production le 2026-11-23)
-- exige l'appartenance au restaurant dans son `USING`, donc aussi pour la ligne
-- EXISTANTE. La route /api/push-subscriptions fait un upsert sur
-- (`user_id`, `endpoint`): un employe desactive dans le restaurant A puis
-- invite dans le restaurant B trouve sa vieille ligne (tenant A), que le
-- `USING` lui cache. L'upsert echoue (500 a chaque essai, aucune alerte de B),
-- et la route DELETE ne supprime rien (zero ligne visible).
--
-- LA CORRECTION. Une seule politique, toujours `FOR ALL`:
--   - `USING (user_id = auth.uid())`: lire, modifier, supprimer SES lignes,
--     quel que soit le restaurant (on ne voit jamais l'appareil d'un autre);
--   - `WITH CHECK` inchange (utilisateur ET appartenance au restaurant):
--     inserer, ou re-pointer une ligne, n'est permis que vers un restaurant
--     dont on est membre actif. La fuite fermee le 2026-11-08 (s'abonner aux
--     commandes d'un concurrent) reste fermee: la ligne finale est toujours
--     jugee par le `WITH CHECK`.
-- L'upsert passe: la ligne existante satisfait le `USING` (meme compte), la
-- ligne finale (restaurant B) satisfait le `WITH CHECK`.
-- Les droits de table (TRUNCATE, TRIGGER, REFERENCES retires, rien pour anon)
-- ne bougent pas.
--
-- ORDRE DE DEPLOIEMENT: peut passer AVANT le code en ligne.
--
-- ROLLBACK: rejouer la politique de `20261108120000`.
-- ============================================================================

DROP POLICY IF EXISTS "Un membre gere ses abonnements push de son restaurant" ON public.push_subscriptions;

CREATE POLICY "Un membre gere ses abonnements push de son restaurant"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  );
