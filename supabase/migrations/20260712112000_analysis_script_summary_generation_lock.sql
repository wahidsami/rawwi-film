-- Distributed lock for deterministic Memory2 summary generation.
-- Ensures only one worker generates a summary for a given script version.

CREATE TABLE IF NOT EXISTS public.analysis_script_summary_locks (
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.script_versions(id) ON DELETE CASCADE,
  lock_owner text NOT NULL,
  locked_until timestamptz NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (script_id, version_id)
);

CREATE OR REPLACE FUNCTION public.try_acquire_analysis_script_summary_lock(
  p_script_id uuid,
  p_version_id uuid,
  p_lock_owner text,
  p_lock_ttl_ms integer DEFAULT 600000
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked_until timestamptz := now() + (((GREATEST(p_lock_ttl_ms, 1))::text || ' milliseconds')::interval);
  v_acquired boolean := false;
BEGIN
  INSERT INTO public.analysis_script_summary_locks (
    script_id,
    version_id,
    lock_owner,
    locked_until
  )
  VALUES (
    p_script_id,
    p_version_id,
    p_lock_owner,
    v_locked_until
  )
  ON CONFLICT (script_id, version_id) DO UPDATE
    SET lock_owner = EXCLUDED.lock_owner,
        locked_until = EXCLUDED.locked_until,
        updated_at = now()
    WHERE public.analysis_script_summary_locks.locked_until < now()
  RETURNING true INTO v_acquired;

  IF FOUND THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_analysis_script_summary_lock(
  p_script_id uuid,
  p_version_id uuid,
  p_lock_owner text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_released boolean := false;
BEGIN
  DELETE FROM public.analysis_script_summary_locks
  WHERE script_id = p_script_id
    AND version_id = p_version_id
    AND lock_owner = p_lock_owner
  RETURNING true INTO v_released;

  IF FOUND THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
