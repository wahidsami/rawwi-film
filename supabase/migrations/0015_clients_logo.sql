-- Optional client/company logo: store public URL and last update time.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS logo_updated_at timestamptz;

COMMENT ON COLUMN clients.logo_url IS 'Public URL of company logo in storage (company-logos bucket).';
COMMENT ON COLUMN clients.logo_updated_at IS 'When the logo was last uploaded or removed.';
