-- Create storage bucket for custom notification sounds
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-sounds', 'tenant-sounds', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their tenant's sounds
CREATE POLICY "Tenants can upload sounds"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-sounds'
  AND (storage.foldername(name))[1] IN (
    SELECT t.id::text FROM tenants t
    INNER JOIN admin_users au ON au.tenant_id = t.id
    WHERE au.user_id = auth.uid()
  )
);

-- Allow authenticated users to update (upsert) their tenant's sounds
CREATE POLICY "Tenants can update sounds"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tenant-sounds'
  AND (storage.foldername(name))[1] IN (
    SELECT t.id::text FROM tenants t
    INNER JOIN admin_users au ON au.tenant_id = t.id
    WHERE au.user_id = auth.uid()
  )
);

-- Allow authenticated users to delete their tenant's sounds
CREATE POLICY "Tenants can delete sounds"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'tenant-sounds'
  AND (storage.foldername(name))[1] IN (
    SELECT t.id::text FROM tenants t
    INNER JOIN admin_users au ON au.tenant_id = t.id
    WHERE au.user_id = auth.uid()
  )
);

-- Allow public read access (sounds need to be played by the browser)
CREATE POLICY "Public can read sounds"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tenant-sounds');
