-- Zastąp polityki anon politykami authenticated na tabelach głównych
-- (polityki anon były tymczasowe — patrz 20260619071936_tighten_rls_policies.sql)

-- treningi
DROP POLICY IF EXISTS "treningi_read_anon" ON treningi;
DROP POLICY IF EXISTS "treningi_write_anon" ON treningi;
DROP POLICY IF EXISTS "treningi_update_anon" ON treningi;
DROP POLICY IF EXISTS "treningi_delete_anon" ON treningi;
CREATE POLICY "treningi_all_auth" ON treningi FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- jezdzcy
DROP POLICY IF EXISTS "jezdzcy_read_anon" ON jezdzcy;
DROP POLICY IF EXISTS "jezdzcy_write_anon" ON jezdzcy;
DROP POLICY IF EXISTS "jezdzcy_update_anon" ON jezdzcy;
DROP POLICY IF EXISTS "jezdzcy_delete_anon" ON jezdzcy;
CREATE POLICY "jezdzcy_all_auth" ON jezdzcy FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- konie
DROP POLICY IF EXISTS "konie_read_anon" ON konie;
DROP POLICY IF EXISTS "konie_write_anon" ON konie;
DROP POLICY IF EXISTS "konie_update_anon" ON konie;
DROP POLICY IF EXISTS "konie_delete_anon" ON konie;
CREATE POLICY "konie_all_auth" ON konie FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- cwiczenia
DROP POLICY IF EXISTS "cwiczenia_all_anon" ON cwiczenia;
CREATE POLICY "cwiczenia_all_auth" ON cwiczenia FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- jezdziec_konie
DROP POLICY IF EXISTS "jk_all_anon" ON jezdziec_konie;
CREATE POLICY "jk_all_auth" ON jezdziec_konie FOR ALL TO authenticated USING (true) WITH CHECK (true);
