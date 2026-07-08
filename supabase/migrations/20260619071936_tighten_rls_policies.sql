-- NOTE: This migration originally opened tables to anon role.
-- It is superseded by 20260629170804_rls_require_authenticated.sql
-- Kept here for historical accuracy only.

DROP POLICY IF EXISTS "instruktor_treningi" ON treningi;
CREATE POLICY "treningi_read_anon" ON treningi FOR SELECT USING (true);
CREATE POLICY "treningi_write_anon" ON treningi FOR INSERT WITH CHECK (true);
CREATE POLICY "treningi_update_anon" ON treningi FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "treningi_delete_anon" ON treningi FOR DELETE USING (true);

DROP POLICY IF EXISTS "instruktor_jezdzcy" ON jezdzcy;
CREATE POLICY "jezdzcy_read_anon" ON jezdzcy FOR SELECT USING (true);
CREATE POLICY "jezdzcy_write_anon" ON jezdzcy FOR INSERT WITH CHECK (true);
CREATE POLICY "jezdzcy_update_anon" ON jezdzcy FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "jezdzcy_delete_anon" ON jezdzcy FOR DELETE USING (true);

DROP POLICY IF EXISTS "instruktor_konie" ON konie;
CREATE POLICY "konie_read_anon" ON konie FOR SELECT USING (true);
CREATE POLICY "konie_write_anon" ON konie FOR INSERT WITH CHECK (true);
CREATE POLICY "konie_update_anon" ON konie FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "konie_delete_anon" ON konie FOR DELETE USING (true);

DROP POLICY IF EXISTS "instruktor_cwiczenia" ON cwiczenia;
CREATE POLICY "cwiczenia_all_anon" ON cwiczenia FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "instruktor_jk" ON jezdziec_konie;
CREATE POLICY "jk_all_anon" ON jezdziec_konie FOR ALL USING (true) WITH CHECK (true);
