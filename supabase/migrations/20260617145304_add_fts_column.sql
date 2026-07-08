CREATE OR REPLACE FUNCTION immutable_array_to_string(arr text[], sep text)
RETURNS text AS $$
  SELECT array_to_string(arr, sep)
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

ALTER TABLE treningi
  ADD COLUMN IF NOT EXISTS fts_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector(
        'simple'::regconfig,
        coalesce(uwagi, '') || ' ' ||
        coalesce(immutable_array_to_string(cwiczenia, ' '), '') || ' ' ||
        coalesce(dobrze, '') || ' ' ||
        coalesce(do_poprawy, '')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS treningi_fts_gin_idx
  ON treningi USING gin(fts_vector);
