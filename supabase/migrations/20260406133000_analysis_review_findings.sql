-- Reviewer-facing finding cards: one persisted row per visible review item.

CREATE TABLE IF NOT EXISTS public.analysis_review_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.analysis_reports(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  version_id uuid NOT NULL,

  canonical_finding_id text NULL,
  source_kind text NOT NULL,

  primary_article_id integer NOT NULL,
  primary_atom_id text NULL,
  severity text NOT NULL,
  review_status text NOT NULL DEFAULT 'violation',

  title_ar text NOT NULL,
  description_ar text NULL,
  rationale_ar text NULL,
  evidence_snippet text NOT NULL,
  manual_comment text NULL,

  page_number integer NULL,
  start_offset_global integer NULL,
  end_offset_global integer NULL,
  start_offset_page integer NULL,
  end_offset_page integer NULL,
  anchor_status text NOT NULL DEFAULT 'unresolved',
  anchor_method text NULL,
  anchor_text text NULL,
  anchor_confidence numeric NULL,

  is_manual boolean NOT NULL DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,
  approved_reason text NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  edited_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at timestamptz NULL,

  created_from_job_id uuid NULL REFERENCES public.analysis_jobs(id) ON DELETE SET NULL,
  supersedes_review_finding_id uuid NULL REFERENCES public.analysis_review_findings(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT analysis_review_findings_source_kind_check
    CHECK (source_kind IN ('ai', 'glossary', 'manual', 'special')),
  CONSTRAINT analysis_review_findings_review_status_check
    CHECK (review_status IN ('violation', 'approved', 'needs_review')),
  CONSTRAINT analysis_review_findings_anchor_status_check
    CHECK (anchor_status IN ('exact', 'unresolved'))
);

COMMENT ON TABLE public.analysis_review_findings IS 'Reviewer-facing finding cards. Report page, workspace, exports, and reanalysis should converge on this table as the interactive source of truth.';
COMMENT ON COLUMN public.analysis_review_findings.canonical_finding_id IS 'Canonical summary finding identifier produced by aggregation; nullable for manual-only reviewer rows.';
COMMENT ON COLUMN public.analysis_review_findings.source_kind IS 'Reviewer-visible source bucket: ai, glossary, manual, special.';
COMMENT ON COLUMN public.analysis_review_findings.review_status IS 'Reviewer state of this card: violation, approved, or needs_review.';
COMMENT ON COLUMN public.analysis_review_findings.anchor_status IS 'Viewer anchor confidence: exact or unresolved.';
COMMENT ON COLUMN public.analysis_review_findings.supersedes_review_finding_id IS 'Prior reviewer row replaced by this one during reanalysis merge/carry-forward.';

CREATE INDEX IF NOT EXISTS idx_arf_report_id ON public.analysis_review_findings(report_id);
CREATE INDEX IF NOT EXISTS idx_arf_job_id ON public.analysis_review_findings(job_id);
CREATE INDEX IF NOT EXISTS idx_arf_script_id ON public.analysis_review_findings(script_id);
CREATE INDEX IF NOT EXISTS idx_arf_review_status ON public.analysis_review_findings(review_status);
CREATE INDEX IF NOT EXISTS idx_arf_source_kind ON public.analysis_review_findings(source_kind);
CREATE INDEX IF NOT EXISTS idx_arf_canonical_finding_id ON public.analysis_review_findings(canonical_finding_id) WHERE canonical_finding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arf_script_report_status ON public.analysis_review_findings(script_id, report_id, review_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_arf_report_canonical_unique
  ON public.analysis_review_findings(report_id, canonical_finding_id)
  WHERE canonical_finding_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.analysis_review_finding_sources (
  review_finding_id uuid NOT NULL REFERENCES public.analysis_review_findings(id) ON DELETE CASCADE,
  analysis_finding_id uuid NOT NULL REFERENCES public.analysis_findings(id) ON DELETE CASCADE,
  link_role text NOT NULL DEFAULT 'primary',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_finding_id, analysis_finding_id)
);

COMMENT ON TABLE public.analysis_review_finding_sources IS 'Traceability map from reviewer-facing cards to raw analysis_findings evidence rows.';

ALTER TABLE public.analysis_review_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_review_finding_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all analysis_review_findings"
ON public.analysis_review_findings FOR SELECT
USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Users can view own analysis_review_findings"
ON public.analysis_review_findings FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.analysis_jobs j
    WHERE j.id = analysis_review_findings.job_id
      AND j.created_by = auth.uid()
  )
);

CREATE POLICY "Admins can manage all analysis_review_findings"
ON public.analysis_review_findings FOR ALL
USING (public.is_admin_user(auth.uid()))
WITH CHECK (public.is_admin_user(auth.uid()));

CREATE POLICY "Users can insert own analysis_review_findings"
ON public.analysis_review_findings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.analysis_jobs j
    WHERE j.id = analysis_review_findings.job_id
      AND j.created_by = auth.uid()
  )
);

CREATE POLICY "Users can update own analysis_review_findings"
ON public.analysis_review_findings FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.analysis_jobs j
    WHERE j.id = analysis_review_findings.job_id
      AND j.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.analysis_jobs j
    WHERE j.id = analysis_review_findings.job_id
      AND j.created_by = auth.uid()
  )
);

CREATE POLICY "Users can delete own analysis_review_findings"
ON public.analysis_review_findings FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.analysis_jobs j
    WHERE j.id = analysis_review_findings.job_id
      AND j.created_by = auth.uid()
  )
);

CREATE POLICY "Admins can view all analysis_review_finding_sources"
ON public.analysis_review_finding_sources FOR SELECT
USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Users can view own analysis_review_finding_sources"
ON public.analysis_review_finding_sources FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.analysis_review_findings rf
    JOIN public.analysis_jobs j ON j.id = rf.job_id
    WHERE rf.id = analysis_review_finding_sources.review_finding_id
      AND j.created_by = auth.uid()
  )
);

