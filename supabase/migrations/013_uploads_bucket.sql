-- 013: Bucket para uploads de PDFs
-- Necessario para processar books reais via pipeline

-- Criar bucket se nao existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  false,
  104857600,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Policy temporaria: permite upload anonimo (remover quando auth entrar)
DROP POLICY IF EXISTS "temp_anon_upload_uploads" ON storage.objects;
CREATE POLICY "temp_anon_upload_uploads"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'uploads');

-- Policy: permite read via signed URL
DROP POLICY IF EXISTS "signed_url_read_uploads" ON storage.objects;
CREATE POLICY "signed_url_read_uploads"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'uploads');
