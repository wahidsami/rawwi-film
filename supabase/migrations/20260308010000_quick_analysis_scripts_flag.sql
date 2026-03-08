-- Quick Analysis: mark hidden internal scripts without changing existing FK model.
ALTER TABLE scripts
ADD COLUMN IF NOT EXISTS is_quick_analysis boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_scripts_quick_created
ON scripts (is_quick_analysis, created_by, created_at DESC);

COMMENT ON COLUMN scripts.is_quick_analysis IS
'True for standalone quick-analysis scripts not linked to business workflow pages.';
