ALTER TABLE konie DROP CONSTRAINT konie_typ_check;
ALTER TABLE konie ADD CONSTRAINT konie_typ_check CHECK (typ = ANY (ARRAY['drobniejszy','uniwersalny','mocniejszy','gorącokrwisty','zimnokrwisty']));
