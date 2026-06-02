-- Unify user lifecycle rules so deleting a user retains history and does not
-- fail on legacy hard references.

-- 1) Tasks: keep rows, null out the deleted user references.
ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_assigned_by_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_assigned_by_fkey
  FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Script provenance: keep script history, null the deleted author.
ALTER TABLE public.scripts
  DROP CONSTRAINT IF EXISTS scripts_created_by_fkey;
ALTER TABLE public.scripts
  ADD CONSTRAINT scripts_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3) Findings and manual overrides: preserve the record, detach the user.
ALTER TABLE public.findings
  DROP CONSTRAINT IF EXISTS findings_created_by_fkey;
ALTER TABLE public.findings
  ADD CONSTRAINT findings_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.finding_override_events
  DROP CONSTRAINT IF EXISTS finding_override_events_created_by_fkey;
ALTER TABLE public.finding_override_events
  ADD CONSTRAINT finding_override_events_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4) Lexicon provenance: preserve edit history.
ALTER TABLE public.slang_lexicon
  DROP CONSTRAINT IF EXISTS slang_lexicon_created_by_fkey;
ALTER TABLE public.slang_lexicon
  ADD CONSTRAINT slang_lexicon_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.slang_lexicon_history
  DROP CONSTRAINT IF EXISTS slang_lexicon_history_changed_by_fkey;
ALTER TABLE public.slang_lexicon_history
  ADD CONSTRAINT slang_lexicon_history_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5) Revision-cycle history and regulator recommendations.
ALTER TABLE public.script_revision_cycles
  ALTER COLUMN sent_by DROP NOT NULL;

ALTER TABLE public.script_revision_cycles
  DROP CONSTRAINT IF EXISTS script_revision_cycles_sent_by_fkey;
ALTER TABLE public.script_revision_cycles
  ADD CONSTRAINT script_revision_cycles_sent_by_fkey
  FOREIGN KEY (sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.script_recommendation_events
  ALTER COLUMN recommended_by DROP NOT NULL;

ALTER TABLE public.script_recommendation_events
  DROP CONSTRAINT IF EXISTS script_recommendation_events_recommended_by_fkey;
ALTER TABLE public.script_recommendation_events
  ADD CONSTRAINT script_recommendation_events_recommended_by_fkey
  FOREIGN KEY (recommended_by) REFERENCES auth.users(id) ON DELETE SET NULL;
