ALTER TABLE scripts
  ADD COLUMN IF NOT EXISTS work_classification text,
  ADD COLUMN IF NOT EXISTS episode_count integer,
  ADD COLUMN IF NOT EXISTS received_at date;

ALTER TABLE scripts
  DROP CONSTRAINT IF EXISTS scripts_episode_count_nonnegative;

ALTER TABLE scripts
  ADD CONSTRAINT scripts_episode_count_nonnegative
  CHECK (episode_count IS NULL OR episode_count >= 0);
