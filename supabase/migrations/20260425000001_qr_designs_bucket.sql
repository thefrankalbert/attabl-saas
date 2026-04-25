-- Create storage bucket for custom QR designs uploaded during onboarding
-- Used by /api/onboarding/upload-qr-design

INSERT INTO storage.buckets (id, name, public)
VALUES ('qr-designs', 'qr-designs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their tenant directory
CREATE POLICY "Tenants can upload QR designs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'qr-designs'
  AND (storage.foldername(name))[1] IN (
    SELECT t.id::text FROM tenants t
    INNER JOIN admin_users au ON au.tenant_id = t.id
    WHERE au.user_id = auth.uid()
  )
);

-- Allow authenticated users to update their tenant's designs
CREATE POLICY "Tenants can update QR designs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'qr-designs'
  AND (storage.foldername(name))[1] IN (
    SELECT t.id::text FROM tenants t
    INNER JOIN admin_users au ON au.tenant_id = t.id
    WHERE au.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'qr-designs'
  AND (storage.foldername(name))[1] IN (
    SELECT t.id::text FROM tenants t
    INNER JOIN admin_users au ON au.tenant_id = t.id
    WHERE au.user_id = auth.uid()
  )
);

-- Allow authenticated users to delete their tenant's designs
CREATE POLICY "Tenants can delete QR designs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'qr-designs'
  AND (storage.foldername(name))[1] IN (
    SELECT t.id::text FROM tenants t
    INNER JOIN admin_users au ON au.tenant_id = t.id
    WHERE au.user_id = auth.uid()
  )
);

-- Public read so the design can be embedded in the preview (Image element)
CREATE POLICY "Public can read QR designs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'qr-designs');
