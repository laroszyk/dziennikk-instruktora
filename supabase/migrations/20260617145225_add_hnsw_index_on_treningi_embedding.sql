CREATE INDEX IF NOT EXISTS treningi_embedding_hnsw_idx
ON treningi USING hnsw (embedding vector_cosine_ops);
