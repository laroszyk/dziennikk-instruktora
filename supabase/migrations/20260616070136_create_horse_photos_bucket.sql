INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('konie', 'konie', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']);

CREATE POLICY "Public read konie" ON storage.objects FOR SELECT USING (bucket_id = 'konie');
CREATE POLICY "Auth upload konie" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'konie');
CREATE POLICY "Auth delete konie" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'konie');
