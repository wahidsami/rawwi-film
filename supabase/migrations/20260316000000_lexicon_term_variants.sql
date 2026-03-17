-- Add term_variants for Arabic conjugations/forms (e.g. ضرب -> يضرب، تضرب، ضربا، مضروب).
-- Analysis matches script text against term OR any variant.
ALTER TABLE slang_lexicon
  ADD COLUMN IF NOT EXISTS term_variants text[] DEFAULT '{}';

COMMENT ON COLUMN slang_lexicon.term_variants IS 'Optional conjugations/forms of the term (e.g. يضرب، تضرب for ضرب). All are matched during analysis.';
