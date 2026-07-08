ALTER TABLE treningi ADD COLUMN IF NOT EXISTS foto_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('treningi-photos', 'treningi-photos', true, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'treningi photos public read') THEN
    CREATE POLICY "treningi photos public read" ON storage.objects FOR SELECT USING (bucket_id = 'treningi-photos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'treningi photos anon upload') THEN
    CREATE POLICY "treningi photos anon upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'treningi-photos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'treningi photos anon delete') THEN
    CREATE POLICY "treningi photos anon delete" ON storage.objects FOR DELETE USING (bucket_id = 'treningi-photos');
  END IF;
END $$;
