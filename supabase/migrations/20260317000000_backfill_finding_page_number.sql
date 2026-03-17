-- Backfill page_number on analysis_findings using script_pages + same offset rules as docs/OFFSETS_AND_PAGES.md

UPDATE analysis_findings f
SET page_number = pb.page_number
FROM (
  SELECT
    sp.version_id,
    sp.page_number,
    SUM(length(sp.content) + 2) OVER (PARTITION BY sp.version_id ORDER BY sp.page_number)
      - length(sp.content) - 2 AS page_start,
    SUM(length(sp.content) + 2) OVER (PARTITION BY sp.version_id ORDER BY sp.page_number) AS page_end_exclusive
  FROM script_pages sp
) pb
WHERE f.version_id = pb.version_id
  AND f.page_number IS NULL
  AND f.start_offset_global IS NOT NULL
  AND f.start_offset_global >= pb.page_start
  AND f.start_offset_global < pb.page_end_exclusive;
