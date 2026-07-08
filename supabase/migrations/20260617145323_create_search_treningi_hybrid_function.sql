CREATE OR REPLACE FUNCTION search_treningi_hybrid(
  query_embedding vector(1536),
  query_text      text,
  match_count     int DEFAULT 30
)
RETURNS TABLE (
  id            uuid,
  data          date,
  jezdziec      text,
  kon           text,
  typ_jazdy     text,
  grupowa       boolean,
  cwiczenia     text[],
  uwagi         text,
  dobrze        text,
  do_poprawy    text,
  ocena         int,
  rrf_score     float
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$

WITH vector_hits AS (
  SELECT
    t.id,
    ROW_NUMBER() OVER (ORDER BY t.embedding <=> query_embedding) AS rank
  FROM treningi t
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count
),
fts_hits AS (
  SELECT
    t.id,
    ROW_NUMBER() OVER (ORDER BY ts_rank(t.fts_vector, query, 32) DESC) AS rank
  FROM treningi t,
       websearch_to_tsquery('simple'::regconfig, query_text) query
  WHERE t.fts_vector @@ query
  ORDER BY ts_rank(t.fts_vector, query, 32) DESC
  LIMIT match_count
),
rrf AS (
  SELECT
    coalesce(v.id, f.id) AS id,
    coalesce(1.0 / (60 + v.rank), 0) +
    coalesce(1.0 / (60 + f.rank), 0) AS rrf_score
  FROM vector_hits v
  FULL OUTER JOIN fts_hits f ON f.id = v.id
)
SELECT
  t.id,
  t.data,
  j.imie                    AS jezdziec,
  k.imie                    AS kon,
  t.typ_jazdy,
  t.grupowa,
  t.cwiczenia,
  t.uwagi,
  t.dobrze,
  t.do_poprawy,
  t.ocena,
  r.rrf_score
FROM rrf r
JOIN treningi t  ON t.id = r.id
JOIN jezdzcy  j  ON j.id = t.jezdziec_id
LEFT JOIN konie k ON k.id = t.kon_id
ORDER BY r.rrf_score DESC;

$$;
