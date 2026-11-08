-- Applied to production on 2026-11-08 (Atfood iOS app). Needed for storage copy (draft -> dish) and old-photo cleanup.
CREATE POLICY "Tenants can read own menu photos" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'menu-items'
  AND (storage.foldername(name))[1] IN (SELECT (t.t)::text FROM unnest(get_my_tenant_ids_array()) t(t))
);
