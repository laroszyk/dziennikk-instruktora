create table konie (
  id uuid primary key default gen_random_uuid(),
  imie text not null,
  zdjecie_url text,
  charakterystyka text,
  typ text check (typ in ('drobniejszy','uniwersalny','mocniejszy')),
  nadaje_sie_do text[] default '{}',
  created_at timestamptz default now()
);

create table jezdzcy (
  id uuid primary key default gen_random_uuid(),
  imie text not null,
  zdjecie_url text,
  poziom text check (poziom in ('początkujący','średniozaawansowany','zaawansowany')),
  jezdzi_od text,
  umiejetnosci text[] default '{}',
  do_poprawy text[] default '{}',
  postawa text[] default '{}',
  preferencje text[] default '{}',
  notatki text,
  aktywny boolean default true,
  ulubiony_kon uuid references konie(id),
  created_at timestamptz default now()
);

create table jezdziec_konie (
  jezdziec_id uuid references jezdzcy(id) on delete cascade,
  kon_id uuid references konie(id) on delete cascade,
  domyslny boolean default false,
  primary key (jezdziec_id, kon_id)
);

create table cwiczenia (
  id uuid primary key default gen_random_uuid(),
  nazwa text not null unique,
  created_at timestamptz default now()
);

create table treningi (
  id uuid primary key default gen_random_uuid(),
  jezdziec_id uuid not null references jezdzcy(id) on delete cascade,
  kon_id uuid references konie(id),
  data date not null default current_date,
  typ_jazdy text check (typ_jazdy in ('plac','teren','skoki','ujeżdżenie','lonża','inne')),
  grupowa boolean default false,
  cwiczenia text[] default '{}',
  uwagi text,
  dobrze text,
  do_poprawy text,
  ocena int check (ocena between 1 and 5),
  created_at timestamptz default now()
);

alter table konie enable row level security;
alter table jezdzcy enable row level security;
alter table jezdziec_konie enable row level security;
alter table cwiczenia enable row level security;
alter table treningi enable row level security;

create policy "instruktor_konie" on konie for all to authenticated using (true) with check (true);
create policy "instruktor_jezdzcy" on jezdzcy for all to authenticated using (true) with check (true);
create policy "instruktor_jk" on jezdziec_konie for all to authenticated using (true) with check (true);
create policy "instruktor_cwiczenia" on cwiczenia for all to authenticated using (true) with check (true);
create policy "instruktor_treningi" on treningi for all to authenticated using (true) with check (true);

insert into cwiczenia (nazwa) values
  ('Kłus bez strzemion'),
  ('Anglezowanie w rytmie (zmiany tempa)'),
  ('Cavaletti w kłusie'),
  ('Cavaletti w galopie'),
  ('Przejścia stęp–kłus–galop'),
  ('Ósemki i serpentyny'),
  ('Koła 20 m i 10 m'),
  ('Półsiad w kłusie i galopie'),
  ('Drążki w stępie'),
  ('Skoki przez krzyżak'),
  ('Szereg gimnastyczny'),
  ('Jazda bez wodzy na lonży'),
  ('Zatrzymania i ruszania (precyzja)'),
  ('Ustępowanie od łydki'),
  ('Galop w terenie (podjazdy)');
