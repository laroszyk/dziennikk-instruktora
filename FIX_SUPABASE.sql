-- ============================================================
-- Poprawki bezpieczeństwa Supabase — Dziennik Instruktora
-- Uruchom w: Supabase → SQL Editor → New query → wklej → Run
-- Bezpieczne: apka czyta z Supabase tylko tabelę "subscriptions"
-- oraz storage "konie". Poniższe zmiany ich nie dotykają.
-- ============================================================

-- 1) BUCKET treningi-photos: zablokuj anonimowe wgrywanie i usuwanie
--    (teraz KAŻDY niezalogowany może wrzucać i kasować zdjęcia)
drop policy if exists "treningi photos anon upload" on storage.objects;
drop policy if exists "treningi photos anon delete" on storage.objects;

create policy "treningi photos auth upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'treningi-photos');

create policy "treningi photos auth delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'treningi-photos');

-- 2) STARE TABELE po migracji do Strapi: usuń zbyt luźne polityki
--    (dziś każdy zalogowany widzi/edytuje dane wszystkich).
--    Apka już z nich nie czyta — po tej zmianie będą dostępne
--    tylko przez service_role (serwer). RLS jest już włączone.
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'konie','jezdzcy','treningi','cwiczenia','jezdziec_konie',
        'konie_backup','jezdzcy_backup','treningi_backup'
      )
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- (Opcjonalnie, gdy potwierdzisz, że te tabele nie są już potrzebne —
--  możesz je całkiem usunąć. NAJPIERW zrób kopię/eksport.)
-- drop table if exists public.konie_backup, public.jezdzcy_backup, public.treningi_backup;

-- 3) (Opcjonalnie) Ogranicz publiczne listowanie plików w bucketach.
--    Wyświetlanie zdjęć przez publiczny URL nadal działa (bucket public=true).
--    Odkomentuj, jeśli chcesz to zawęzić:
-- drop policy if exists "Public read konie" on storage.objects;
-- drop policy if exists "Public read horse-photos" on storage.objects;
-- drop policy if exists "treningi photos public read" on storage.objects;

-- ============================================================
-- Do zrobienia RĘCZNIE (nie SQL):
--  • Auth → Providers/Policies → włącz „Leaked password protection"
--    (sprawdzanie haseł w bazie HaveIBeenPwned).
-- ============================================================
