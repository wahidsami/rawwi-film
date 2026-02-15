-- Lexicon audit: store who changed and why in history.
-- Edge Function sets last_changed_by (user id) and last_change_reason on UPDATE;
-- trigger copies them into slang_lexicon_history.

ALTER TABLE slang_lexicon
  ADD COLUMN IF NOT EXISTS last_changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_change_reason text;

COMMENT ON COLUMN slang_lexicon.last_changed_by IS 'Set by API on update; copied to history by trigger';
COMMENT ON COLUMN slang_lexicon.last_change_reason IS 'Set by API on update; copied to history by trigger';

-- Replace trigger to pass last_changed_by and last_change_reason into history on UPDATE
CREATE OR REPLACE FUNCTION slang_lexicon_history_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO slang_lexicon_history (lexicon_id, operation, new_data, changed_by, change_reason)
    VALUES (NEW.id, 'INSERT', to_jsonb(NEW), NEW.created_by, NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO slang_lexicon_history (lexicon_id, operation, old_data, new_data, changed_by, change_reason)
    VALUES (NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NEW.last_changed_by, NEW.last_change_reason);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO slang_lexicon_history (lexicon_id, operation, old_data)
    VALUES (OLD.id, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
