-- Compare diagnostics for two jobs and flag the first divergent chunk.
-- Replace the UUIDs below before running.

WITH params AS (
  SELECT
    '66b3f529-f4f0-49de-a2a5-460805e3b5bc'::uuid AS job_a,
    '8722f16b-33ad-4d7b-b354-1bbd1c38c440'::uuid AS job_b
),
chunk_order AS (
  SELECT id AS chunk_id, job_id, chunk_index
  FROM public.analysis_chunks
),
judge_call_rollup AS (
  SELECT
    d.job_id,
    d.chunk_id,
    encode(digest(string_agg(coalesce(d.prompt_hash, ''), '|' ORDER BY coalesce(d.prompt_hash, ''), coalesce(d.judge_response_hash, ''), d.id::text), 'sha256'), 'hex') AS prompt_hash,
    encode(digest(string_agg(coalesce(d.judge_response_hash, ''), '|' ORDER BY coalesce(d.prompt_hash, ''), coalesce(d.judge_response_hash, ''), d.id::text), 'sha256'), 'hex') AS judge_response_hash,
    coalesce(sum(d.raw_finding_count), 0) AS raw_finding_count,
    coalesce(sum(d.parsed_finding_count), 0) AS parsed_finding_count
  FROM public.analysis_judge_diagnostics d
  WHERE d.diagnostic_kind = 'judge_call'
  GROUP BY d.job_id, d.chunk_id
),
chunk_final AS (
  SELECT DISTINCT ON (d.job_id, d.chunk_id)
    d.job_id,
    d.chunk_id,
    d.grounded_finding_count,
    d.validated_finding_count,
    d.final_chunk_finding_count
  FROM public.analysis_judge_diagnostics d
  WHERE d.diagnostic_kind = 'chunk_final'
  ORDER BY d.job_id, d.chunk_id, d.timestamp DESC
),
a_rows AS (
  SELECT
    co.chunk_index,
    r.chunk_id,
    r.prompt_hash,
    r.judge_response_hash,
    r.raw_finding_count,
    r.parsed_finding_count,
    f.grounded_finding_count,
    f.validated_finding_count,
    f.final_chunk_finding_count
  FROM judge_call_rollup r
  LEFT JOIN chunk_final f
    ON f.job_id = r.job_id AND f.chunk_id = r.chunk_id
  LEFT JOIN chunk_order co
    ON co.job_id = r.job_id AND co.chunk_id = r.chunk_id
  WHERE r.job_id = (SELECT job_a FROM params)
),
b_rows AS (
  SELECT
    co.chunk_index,
    r.chunk_id,
    r.prompt_hash,
    r.judge_response_hash,
    r.raw_finding_count,
    r.parsed_finding_count,
    f.grounded_finding_count,
    f.validated_finding_count,
    f.final_chunk_finding_count
  FROM judge_call_rollup r
  LEFT JOIN chunk_final f
    ON f.job_id = r.job_id AND f.chunk_id = r.chunk_id
  LEFT JOIN chunk_order co
    ON co.job_id = r.job_id AND co.chunk_id = r.chunk_id
  WHERE r.job_id = (SELECT job_b FROM params)
),
comparison AS (
  SELECT
    coalesce(a.chunk_index, b.chunk_index) AS chunk_index,
    coalesce(a.chunk_id, b.chunk_id) AS chunk_id,

    a.prompt_hash AS job_a_prompt_hash,
    b.prompt_hash AS job_b_prompt_hash,

    a.judge_response_hash AS job_a_judge_response_hash,
    b.judge_response_hash AS job_b_judge_response_hash,

    a.raw_finding_count AS job_a_raw_finding_count,
    b.raw_finding_count AS job_b_raw_finding_count,

    a.parsed_finding_count AS job_a_parsed_finding_count,
    b.parsed_finding_count AS job_b_parsed_finding_count,

    a.grounded_finding_count AS job_a_grounded_finding_count,
    b.grounded_finding_count AS job_b_grounded_finding_count,

    a.validated_finding_count AS job_a_validated_finding_count,
    b.validated_finding_count AS job_b_validated_finding_count,

    a.final_chunk_finding_count AS job_a_final_chunk_finding_count,
    b.final_chunk_finding_count AS job_b_final_chunk_finding_count,

    (
      coalesce(a.prompt_hash, '') <> coalesce(b.prompt_hash, '') OR
      coalesce(a.judge_response_hash, '') <> coalesce(b.judge_response_hash, '') OR
      coalesce(a.raw_finding_count, -1) <> coalesce(b.raw_finding_count, -1) OR
      coalesce(a.parsed_finding_count, -1) <> coalesce(b.parsed_finding_count, -1) OR
      coalesce(a.grounded_finding_count, -1) <> coalesce(b.grounded_finding_count, -1) OR
      coalesce(a.validated_finding_count, -1) <> coalesce(b.validated_finding_count, -1) OR
      coalesce(a.final_chunk_finding_count, -1) <> coalesce(b.final_chunk_finding_count, -1)
    ) AS differs
  FROM a_rows a
  FULL OUTER JOIN b_rows b
    ON a.chunk_id = b.chunk_id
),
first_diff AS (
  SELECT chunk_id, chunk_index
  FROM comparison
  WHERE differs
  ORDER BY chunk_index NULLS LAST, chunk_id
  LIMIT 1
)
SELECT
  c.chunk_index,
  c.chunk_id,
  c.job_a_prompt_hash,
  c.job_b_prompt_hash,
  c.job_a_judge_response_hash,
  c.job_b_judge_response_hash,
  c.job_a_raw_finding_count,
  c.job_b_raw_finding_count,
  c.job_a_parsed_finding_count,
  c.job_b_parsed_finding_count,
  c.job_a_grounded_finding_count,
  c.job_b_grounded_finding_count,
  c.job_a_validated_finding_count,
  c.job_b_validated_finding_count,
  c.job_a_final_chunk_finding_count,
  c.job_b_final_chunk_finding_count,
  c.differs,
  (c.chunk_id = (SELECT chunk_id FROM first_diff)) AS is_first_divergent_chunk
FROM comparison c
ORDER BY c.chunk_index NULLS LAST, c.chunk_id;
