ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert horse-photos" ON storage.objects;

DROP POLICY IF EXISTS "Auth upload konie" ON storage.objects;
CREATE POLICY "Auth upload konie"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'konie');

DROP POLICY IF EXISTS "Auth read konie" ON storage.objects;
CREATE POLICY "Auth read konie"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'konie');
