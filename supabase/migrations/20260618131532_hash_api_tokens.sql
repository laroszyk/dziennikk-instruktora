ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS token_prefix text;

UPDATE api_tokens
SET
  token_hash   = encode(sha256(token::bytea), 'hex'),
  token_prefix = left(token, 16);

ALTER TABLE api_tokens
  ALTER COLUMN token_hash SET NOT NULL;

ALTER TABLE api_tokens
  ADD CONSTRAINT api_tokens_token_hash_unique UNIQUE (token_hash);

ALTER TABLE api_tokens DROP COLUMN token;
