alter table treningi add column if not exists gid text;
alter table jezdzcy add column if not exists konie text[] default '{}';
alter table jezdzcy alter column notatki type jsonb using '[]'::jsonb;
alter table jezdzcy alter column notatki set default '[]'::jsonb;
