-- Migration: Fix localhost URLs in company logos
-- Date: 2026-02-15
-- Issue: Production logos show http://localhost:54321 URLs causing mixed content errors

-- Preview affected rows (run this first to verify)
SELECT id, name_ar, name_en, logo_url 
FROM clients 
WHERE logo_url LIKE '%localhost%' 
   OR logo_url LIKE '%127.0.0.1%';

-- Fix: Replace localhost with production URL
UPDATE clients
SET logo_url = REPLACE(
  REPLACE(logo_url, 'http://localhost:54321', 'https://swbobhxyluupjzsxpzrd.supabase.co'),
  'http://127.0.0.1:54321', 
  'https://swbobhxyluupjzsxpzrd.supabase.co'
)
WHERE logo_url LIKE '%localhost%' 
   OR logo_url LIKE '%127.0.0.1%';

-- Verify fix
SELECT id, name_ar, name_en, logo_url 
FROM clients 
WHERE logo_url IS NOT NULL;
