CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

CREATE OR REPLACE FUNCTION trigger_generate_embedding()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://asxvphinpnhjfrqibfka.supabase.co/functions/v1/generate-embeddings',
    body    := json_build_object('id', NEW.id)::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_trening_inserted ON treningi;
CREATE TRIGGER on_trening_inserted
  AFTER INSERT ON treningi
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_embedding();
