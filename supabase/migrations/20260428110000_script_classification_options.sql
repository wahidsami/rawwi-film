CREATE TABLE IF NOT EXISTS public.script_classification_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_ar text NOT NULL,
  label_en text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_script_classification_options_label_ar
  ON public.script_classification_options (label_ar);

CREATE UNIQUE INDEX IF NOT EXISTS idx_script_classification_options_label_en
  ON public.script_classification_options (label_en);

CREATE INDEX IF NOT EXISTS idx_script_classification_options_sort_order
  ON public.script_classification_options (sort_order, label_ar);

DROP TRIGGER IF EXISTS script_classification_options_updated_at ON public.script_classification_options;
CREATE TRIGGER script_classification_options_updated_at
  BEFORE UPDATE ON public.script_classification_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.script_classification_options (label_ar, label_en, sort_order, is_active)
VALUES
  ('أمني', 'Security', 10, true),
  ('وثائقي', 'Documentary', 20, true),
  ('درامي', 'Drama', 30, true),
  ('كوميدي', 'Comedy', 40, true),
  ('تاريخي', 'Historical', 50, true),
  ('اجتماعي', 'Social', 60, true),
  ('أطفال', 'Children', 70, true),
  ('إعلامي', 'Media', 80, true),
  ('آخر', 'Other', 90, true)
ON CONFLICT (label_ar) DO UPDATE
SET
  label_en = EXCLUDED.label_en,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

ALTER TABLE public.script_classification_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read active script classification options" ON public.script_classification_options;
CREATE POLICY "Authenticated users can read active script classification options"
ON public.script_classification_options
FOR SELECT
TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Admins can read all script classification options" ON public.script_classification_options;
CREATE POLICY "Admins can read all script classification options"
ON public.script_classification_options
FOR SELECT
TO authenticated
USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can insert script classification options" ON public.script_classification_options;
CREATE POLICY "Admins can insert script classification options"
ON public.script_classification_options
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can update script classification options" ON public.script_classification_options;
CREATE POLICY "Admins can update script classification options"
ON public.script_classification_options
FOR UPDATE
TO authenticated
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "Service role can manage script classification options" ON public.script_classification_options;
CREATE POLICY "Service role can manage script classification options"
ON public.script_classification_options
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.script_classification_options IS
'Admin-managed list of allowed work classifications shown in script creation forms for admin and client users.';

COMMENT ON COLUMN public.script_classification_options.label_ar IS
'Arabic label stored on scripts.work_classification for user-facing consistency.';
