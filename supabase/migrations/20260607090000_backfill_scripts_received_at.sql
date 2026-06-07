-- Backfill missing script received_at values from created_at so reporting
-- and list views have a stable source timestamp for older rows.
update public.scripts
set received_at = created_at::date
where received_at is null
  and created_at is not null;
