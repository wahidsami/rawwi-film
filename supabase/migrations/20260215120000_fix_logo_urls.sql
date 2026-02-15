-- Migration: Standardize storage URLs to relative paths (Task B3)
-- Date: 2026-02-15
-- Goal: Strip origins and store only {bucket}/{path} so URLs are env-agnostic.

-- 1. Convert Clients (logos) to relative paths
UPDATE clients
SET logo_url = substring(logo_url from '/storage/v1/object/public/(.*)')
WHERE logo_url LIKE '%/storage/v1/object/public/%';

-- 2. Convert Scripts (file_url) to relative paths
UPDATE scripts
SET file_url = substring(file_url from '/storage/v1/object/public/(.*)')
WHERE file_url LIKE '%/storage/v1/object/public/%';

-- 3. Convert Script Versions (source_file_url) to relative paths
UPDATE script_versions
SET source_file_url = substring(source_file_url from '/storage/v1/object/public/(.*)')
WHERE source_file_url LIKE '%/storage/v1/object/public/%';

-- 4. Initial Cleanup (Catch anything else that was missed or already rewritten)
-- (No-op if already processed by the substring above, but handles the case where we had http://localhost prefixes without the full storage path pattern)
UPDATE clients SET logo_url = REPLACE(logo_url, 'http://localhost:54321', 'REPLACED_ORIGIN') WHERE logo_url LIKE 'http://localhost%';
-- Actually, the substring approach is much more robust for Task B3.
