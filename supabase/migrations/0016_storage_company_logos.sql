-- Storage bucket for company logos (public read; authenticated upload/delete).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'];

-- Authenticated users can insert (path: company_id/uuid.ext)
CREATE POLICY company_logos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos');

-- Public read (bucket is public)
CREATE POLICY company_logos_select ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

-- Authenticated users can update/delete their uploads (we use service role in edge function; allow authenticated for same-bucket ops)
CREATE POLICY company_logos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos');

CREATE POLICY company_logos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos');
