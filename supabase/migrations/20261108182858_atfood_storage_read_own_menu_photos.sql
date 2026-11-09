-- Applied to production on 2026-11-08 (Atfood iOS app). Needed for storage copy (draft -> dish) and old-photo cleanup.
-- Guard: the pgTAP database has a `storage` schema but no `storage.objects` table.
DO $guard$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects absent: policy skipped';
    RETURN;
  END IF;
  EXECUTE $sql$
CREATE POLICY "Tenants can read own menu photos" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'menu-items'
  AND (storage.foldername(name))[1] IN (SELECT (t.t)::text FROM unnest(get_my_tenant_ids_array()) t(t))
)
  $sql$;
END $guard$;
