-- Certificate template designer foundation
-- Stores admin-built certificate templates without changing existing issuance tables.

CREATE TABLE IF NOT EXISTS public.certificate_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  page_size text NOT NULL DEFAULT 'A4',
  orientation text NOT NULL DEFAULT 'landscape'
    CHECK (orientation IN ('portrait', 'landscape')),
  background_color text NOT NULL DEFAULT '#ffffff',
  background_image_url text,
  background_image_fit text NOT NULL DEFAULT 'cover'
    CHECK (background_image_fit IN ('cover', 'contain', 'tile')),
  background_image_opacity numeric(4,3) NOT NULL DEFAULT 1
    CHECK (background_image_opacity >= 0 AND background_image_opacity <= 1),
  template_data jsonb NOT NULL DEFAULT '{"elements":[]}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_certificate_templates_single_default
  ON public.certificate_templates(is_default)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_certificate_templates_updated_at
  ON public.certificate_templates(updated_at DESC);

DROP TRIGGER IF EXISTS certificate_templates_updated_at ON public.certificate_templates;
CREATE TRIGGER certificate_templates_updated_at
  BEFORE UPDATE ON public.certificate_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view certificate templates" ON public.certificate_templates;
CREATE POLICY "Admins can view certificate templates"
ON public.certificate_templates
FOR SELECT
TO authenticated
USING (public.is_admin_user());

DROP POLICY IF EXISTS "Service role can manage certificate templates" ON public.certificate_templates;
CREATE POLICY "Service role can manage certificate templates"
ON public.certificate_templates
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.certificate_templates IS
'Admin-designed reusable certificate templates. Elements and page styling are stored in template_data JSON.';
