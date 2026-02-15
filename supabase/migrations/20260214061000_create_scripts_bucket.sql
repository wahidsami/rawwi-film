-- Create scripts storage bucket for document uploads

-- Create bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('scripts', 'scripts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folders
CREATE POLICY "Users can upload scripts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'scripts');

-- Allow authenticated users to read all scripts
CREATE POLICY "Users can read scripts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'scripts');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own scripts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'scripts' AND (storage.foldername(name))[1] = auth.uid()::text);
