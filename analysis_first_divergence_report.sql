-- RAAWI AESP Forensic Investigation Report
-- Replace JOB_A and JOB_B below, then run in Supabase SQL Editor.

WITH params AS (
  SELECT
    'JOB_A'::uuid AS job_a,
    'JOB_B'::uuid AS job_b
),

-- RAW GPT stage comparison (earliest checkpoint)
raw_cmp AS (
  SELECT
    1 AS stage_rank,
    'RAW_GPT'::text AS stage_name,
    coalesce(a.chunk_index, b.chunk_index) AS chunk_index,
    coalesce(a.pass_name, b.pass_name) AS pass_name,
    coalesce(a.chunk_id, b.chunk_id) AS chunk_id,
    a.prompt_hash AS job_a_prompt_hash,
    b.prompt_hash AS job_b_prompt_hash,
    CASE
      WHEN coalesce(a.rendered_system_prompt, '') <> coalesce(b.rendered_system_prompt, '') THEN 'rendered_system_prompt differs'
      WHEN coalesce(a.rendered_user_prompt, '') <> coalesce(b.rendered_user_prompt, '') THEN 'rendered_user_prompt differs'
      WHEN coalesce(a.prompt_hash, '') <> coalesce(b.prompt_hash, '') THEN 'prompt_hash differs'
      WHEN coalesce(a.raw_hash, '') <> coalesce(b.raw_hash, '') THEN 'raw_judge_response differs'
      WHEN coalesce(a.finish_reason, '') <> coalesce(b.finish_reason, '') THEN 'finish_reason differs'
      WHEN coalesce(a.usage_hash, '') <> coalesce(b.usage_hash, '') THEN 'usage differs'
      WHEN coalesce(a.response_id, '') <> coalesce(b.response_id, '') THEN 'response_id differs'
      ELSE NULL
    END AS diff_reason,
    CASE
      WHEN coalesce(a.rendered_system_prompt, '') <> coalesce(b.rendered_system_prompt, '')
        OR coalesce(a.rendered_user_prompt, '') <> coalesce(b.rendered_user_prompt, '')
        OR coalesce(a.prompt_hash, '') <> coalesce(b.prompt_hash, '')
      THEN 'PROMPT_CHANGED'
      WHEN coalesce(a.raw_hash, '') <> coalesce(b.raw_hash, '')
        OR coalesce(a.finish_reason, '') <> coalesce(b.finish_reason, '')
        OR coalesce(a.usage_hash, '') <> coalesce(b.usage_hash, '')
        OR coalesce(a.response_id, '') <> coalesce(b.response_id, '')
      THEN 'RAW_GPT_CHANGED'
      ELSE 'UNKNOWN'
    END AS divergence_type,
    CASE
      WHEN (
        coalesce(a.rendered_system_prompt, '') <> coalesce(b.rendered_system_prompt, '')
        OR coalesce(a.rendered_user_prompt, '') <> coalesce(b.rendered_user_prompt, '')
        OR coalesce(a.prompt_hash, '') <> coalesce(b.prompt_hash, '')
        OR coalesce(a.raw_hash, '') <> coalesce(b.raw_hash, '')
        OR coalesce(a.finish_reason, '') <> coalesce(b.finish_reason, '')
        OR coalesce(a.usage_hash, '') <> coalesce(b.usage_hash, '')
        OR coalesce(a.response_id, '') <> coalesce(b.response_id, '')
      ) THEN a.raw_judge_response
      ELSE NULL
    END AS job_a_raw_judge_response,
    CASE
      WHEN (
        coalesce(a.rendered_system_prompt, '') <> coalesce(b.rendered_system_prompt, '')
        OR coalesce(a.rendered_user_prompt, '') <> coalesce(b.rendered_user_prompt, '')
        OR coalesce(a.prompt_hash, '') <> coalesce(b.prompt_hash, '')
        OR coalesce(a.raw_hash, '') <> coalesce(b.raw_hash, '')
        OR coalesce(a.finish_reason, '') <> coalesce(b.finish_reason, '')
        OR coalesce(a.usage_hash, '') <> coalesce(b.usage_hash, '')
        OR coalesce(a.response_id, '') <> coalesce(b.response_id, '')
      ) THEN b.raw_judge_response
      ELSE NULL
    END AS job_b_raw_judge_response,
    a.raw_hash AS job_a_raw_hash,
    b.raw_hash AS job_b_raw_hash,
    NULL::jsonb AS job_a_parsed_judge_response,
    NULL::jsonb AS job_b_parsed_judge_response,
    NULL::text AS job_a_parsed_hash,
    NULL::text AS job_b_parsed_hash,
    NULL::jsonb AS job_a_pass_findings_json,
    NULL::jsonb AS job_b_pass_findings_json,
    NULL::text AS job_a_pass_hash,
    NULL::text AS job_b_pass_hash,
    NULL::jsonb AS job_a_validated_findings_json,
    NULL::jsonb AS job_b_validated_findings_json,
    NULL::text AS job_a_validated_hash,
    NULL::text AS job_b_validated_hash,
    NULL::jsonb AS job_a_final_findings_json,
    NULL::jsonb AS job_b_final_findings_json,
    NULL::text AS job_a_final_hash,
    NULL::text AS job_b_final_hash
  FROM (
    SELECT
      d.chunk_id,
      c.chunk_index,
      d.pass_name,
      d.prompt_hash,
      d.rendered_system_prompt,
      d.rendered_user_prompt,
      d.raw_judge_response,
      d.finish_reason,
      d.openai_response_id AS response_id,
      encode(digest(coalesce(d.raw_judge_response, ''), 'sha256'), 'hex') AS raw_hash,
      encode(digest(coalesce(d.openai_usage::text, ''), 'sha256'), 'hex') AS usage_hash
    FROM public.analysis_judge_diagnostics d
    JOIN public.analysis_chunks c ON c.id = d.chunk_id
    WHERE d.job_id = (SELECT job_a FROM params)
      AND d.diagnostic_kind = 'raw_judge_snapshot'
  ) a
  FULL OUTER JOIN (
    SELECT
      d.chunk_id,
      c.chunk_index,
      d.pass_name,
      d.prompt_hash,
      d.rendered_system_prompt,
      d.rendered_user_prompt,
      d.raw_judge_response,
      d.finish_reason,
      d.openai_response_id AS response_id,
      encode(digest(coalesce(d.raw_judge_response, ''), 'sha256'), 'hex') AS raw_hash,
      encode(digest(coalesce(d.openai_usage::text, ''), 'sha256'), 'hex') AS usage_hash
    FROM public.analysis_judge_diagnostics d
    JOIN public.analysis_chunks c ON c.id = d.chunk_id
    WHERE d.job_id = (SELECT job_b FROM params)
      AND d.diagnostic_kind = 'raw_judge_snapshot'
  ) b
    ON a.chunk_id = b.chunk_id
   AND coalesce(a.pass_name, '') = coalesce(b.pass_name, '')
),

-- PARSER stage comparison
parser_cmp AS (
  SELECT
    2 AS stage_rank,
    'PARSER'::text AS stage_name,
    coalesce(a.chunk_index, b.chunk_index) AS chunk_index,
    coalesce(a.pass_name, b.pass_name) AS pass_name,
    coalesce(a.chunk_id, b.chunk_id) AS chunk_id,
    NULL::text AS job_a_prompt_hash,
    NULL::text AS job_b_prompt_hash,
    CASE
      WHEN coalesce(a.parse_status, '') <> coalesce(b.parse_status, '') THEN 'parse_status differs'
      WHEN coalesce(a.raw_finding_count, -1) <> coalesce(b.raw_finding_count, -1) THEN 'raw_finding_count differs'
      WHEN coalesce(a.parsed_finding_count, -1) <> coalesce(b.parsed_finding_count, -1) THEN 'parsed_finding_count differs'
      WHEN coalesce(a.repaired_finding_count, -1) <> coalesce(b.repaired_finding_count, -1) THEN 'repaired_finding_count differs'
      WHEN coalesce(a.salvaged_finding_count, -1) <> coalesce(b.salvaged_finding_count, -1) THEN 'salvaged_finding_count differs'
      WHEN coalesce(a.repair_reason, '') <> coalesce(b.repair_reason, '') THEN 'repair_reason differs'
      WHEN coalesce(a.salvage_reason, '') <> coalesce(b.salvage_reason, '') THEN 'salvage_reason differs'
      WHEN coalesce(a.parser_err_hash, '') <> coalesce(b.parser_err_hash, '') THEN 'parser_validation_errors differs'
      WHEN coalesce(a.parsed_hash, '') <> coalesce(b.parsed_hash, '') THEN 'parsed_judge_response differs'
      ELSE NULL
    END AS diff_reason,
    CASE
      WHEN coalesce(a.parse_status, '') <> coalesce(b.parse_status, '')
        OR coalesce(a.raw_finding_count, -1) <> coalesce(b.raw_finding_count, -1)
        OR coalesce(a.parsed_finding_count, -1) <> coalesce(b.parsed_finding_count, -1)
        OR coalesce(a.repaired_finding_count, -1) <> coalesce(b.repaired_finding_count, -1)
        OR coalesce(a.salvaged_finding_count, -1) <> coalesce(b.salvaged_finding_count, -1)
        OR coalesce(a.repair_reason, '') <> coalesce(b.repair_reason, '')
        OR coalesce(a.salvage_reason, '') <> coalesce(b.salvage_reason, '')
        OR coalesce(a.parser_err_hash, '') <> coalesce(b.parser_err_hash, '')
        OR coalesce(a.parsed_hash, '') <> coalesce(b.parsed_hash, '')
      THEN 'PARSER_CHANGED'
      ELSE 'UNKNOWN'
    END AS divergence_type,
    NULL::text AS job_a_raw_judge_response,
    NULL::text AS job_b_raw_judge_response,
    NULL::text AS job_a_raw_hash,
    NULL::text AS job_b_raw_hash,
    CASE
      WHEN (
        coalesce(a.parse_status, '') <> coalesce(b.parse_status, '')
        OR coalesce(a.raw_finding_count, -1) <> coalesce(b.raw_finding_count, -1)
        OR coalesce(a.parsed_finding_count, -1) <> coalesce(b.parsed_finding_count, -1)
        OR coalesce(a.repaired_finding_count, -1) <> coalesce(b.repaired_finding_count, -1)
        OR coalesce(a.salvaged_finding_count, -1) <> coalesce(b.salvaged_finding_count, -1)
        OR coalesce(a.repair_reason, '') <> coalesce(b.repair_reason, '')
        OR coalesce(a.salvage_reason, '') <> coalesce(b.salvage_reason, '')
        OR coalesce(a.parser_err_hash, '') <> coalesce(b.parser_err_hash, '')
        OR coalesce(a.parsed_hash, '') <> coalesce(b.parsed_hash, '')
      ) THEN a.parsed_judge_response
      ELSE NULL
    END AS job_a_parsed_judge_response,
    CASE
      WHEN (
        coalesce(a.parse_status, '') <> coalesce(b.parse_status, '')
        OR coalesce(a.raw_finding_count, -1) <> coalesce(b.raw_finding_count, -1)
        OR coalesce(a.parsed_finding_count, -1) <> coalesce(b.parsed_finding_count, -1)
        OR coalesce(a.repaired_finding_count, -1) <> coalesce(b.repaired_finding_count, -1)
        OR coalesce(a.salvaged_finding_count, -1) <> coalesce(b.salvaged_finding_count, -1)
        OR coalesce(a.repair_reason, '') <> coalesce(b.repair_reason, '')
        OR coalesce(a.salvage_reason, '') <> coalesce(b.salvage_reason, '')
        OR coalesce(a.parser_err_hash, '') <> coalesce(b.parser_err_hash, '')
        OR coalesce(a.parsed_hash, '') <> coalesce(b.parsed_hash, '')
      ) THEN b.parsed_judge_response
      ELSE NULL
    END AS job_b_parsed_judge_response,
    a.parsed_hash AS job_a_parsed_hash,
    b.parsed_hash AS job_b_parsed_hash,
    NULL::jsonb AS job_a_pass_findings_json,
    NULL::jsonb AS job_b_pass_findings_json,
    NULL::text AS job_a_pass_hash,
    NULL::text AS job_b_pass_hash,
    NULL::jsonb AS job_a_validated_findings_json,
    NULL::jsonb AS job_b_validated_findings_json,
    NULL::text AS job_a_validated_hash,
    NULL::text AS job_b_validated_hash,
    NULL::jsonb AS job_a_final_findings_json,
    NULL::jsonb AS job_b_final_findings_json,
    NULL::text AS job_a_final_hash,
    NULL::text AS job_b_final_hash
  FROM (
    SELECT
      d.chunk_id,
      c.chunk_index,
      d.pass_name,
      d.parse_status,
      d.raw_finding_count,
      d.parsed_finding_count,
      d.repaired_finding_count,
      d.salvaged_finding_count,
      d.repair_reason,
      d.salvage_reason,
      d.parsed_judge_response,
      encode(digest(coalesce(d.parsed_judge_response::text, ''), 'sha256'), 'hex') AS parsed_hash,
      encode(digest(coalesce(d.parser_validation_errors::text, ''), 'sha256'), 'hex') AS parser_err_hash
    FROM public.analysis_judge_diagnostics d
    JOIN public.analysis_chunks c ON c.id = d.chunk_id
    WHERE d.job_id = (SELECT job_a FROM params)
      AND d.diagnostic_kind = 'judge_call'
  ) a
  FULL OUTER JOIN (
    SELECT
      d.chunk_id,
      c.chunk_index,
      d.pass_name,
      d.parse_status,
      d.raw_finding_count,
      d.parsed_finding_count,
      d.repaired_finding_count,
      d.salvaged_finding_count,
      d.repair_reason,
      d.salvage_reason,
      d.parsed_judge_response,
      encode(digest(coalesce(d.parsed_judge_response::text, ''), 'sha256'), 'hex') AS parsed_hash,
      encode(digest(coalesce(d.parser_validation_errors::text, ''), 'sha256'), 'hex') AS parser_err_hash
    FROM public.analysis_judge_diagnostics d
    JOIN public.analysis_chunks c ON c.id = d.chunk_id
    WHERE d.job_id = (SELECT job_b FROM params)
      AND d.diagnostic_kind = 'judge_call'
  ) b
    ON a.chunk_id = b.chunk_id
   AND coalesce(a.pass_name, '') = coalesce(b.pass_name, '')
),

-- PASS SNAPSHOT stage comparison
pass_cmp AS (
  SELECT
    3 AS stage_rank,
    'PASS_SNAPSHOT'::text AS stage_name,
    coalesce(a.chunk_index, b.chunk_index) AS chunk_index,
    coalesce(a.pass_name, b.pass_name) AS pass_name,
    coalesce(a.chunk_id, b.chunk_id) AS chunk_id,
    NULL::text AS job_a_prompt_hash,
    NULL::text AS job_b_prompt_hash,
    CASE
      WHEN coalesce(a.finding_count, -1) <> coalesce(b.finding_count, -1) THEN 'finding_count differs'
      WHEN coalesce(a.findings_hash, '') <> coalesce(b.findings_hash, '') THEN 'findings_json differs'
      ELSE NULL
    END AS diff_reason,
    CASE
      WHEN coalesce(a.finding_count, -1) <> coalesce(b.finding_count, -1)
        OR coalesce(a.findings_hash, '') <> coalesce(b.findings_hash, '')
      THEN 'PASS_OUTPUT_CHANGED'
      ELSE 'UNKNOWN'
    END AS divergence_type,
    NULL::text AS job_a_raw_judge_response,
    NULL::text AS job_b_raw_judge_response,
    NULL::text AS job_a_raw_hash,
    NULL::text AS job_b_raw_hash,
    NULL::jsonb AS job_a_parsed_judge_response,
    NULL::jsonb AS job_b_parsed_judge_response,
    NULL::text AS job_a_parsed_hash,
    NULL::text AS job_b_parsed_hash,
    CASE WHEN coalesce(a.finding_count, -1) <> coalesce(b.finding_count, -1) OR coalesce(a.findings_hash, '') <> coalesce(b.findings_hash, '') THEN a.findings_json ELSE NULL END AS job_a_pass_findings_json,
    CASE WHEN coalesce(a.finding_count, -1) <> coalesce(b.finding_count, -1) OR coalesce(a.findings_hash, '') <> coalesce(b.findings_hash, '') THEN b.findings_json ELSE NULL END AS job_b_pass_findings_json,
    a.findings_hash AS job_a_pass_hash,
    b.findings_hash AS job_b_pass_hash,
    NULL::jsonb AS job_a_validated_findings_json,
    NULL::jsonb AS job_b_validated_findings_json,
    NULL::text AS job_a_validated_hash,
    NULL::text AS job_b_validated_hash,
    NULL::jsonb AS job_a_final_findings_json,
    NULL::jsonb AS job_b_final_findings_json,
    NULL::text AS job_a_final_hash,
    NULL::text AS job_b_final_hash
  FROM (
    SELECT
      d.chunk_id,
      c.chunk_index,
      d.pass_name,
      d.finding_count,
      d.findings_json,
      encode(digest(coalesce(d.findings_json::text, ''), 'sha256'), 'hex') AS findings_hash
    FROM public.analysis_judge_diagnostics d
    JOIN public.analysis_chunks c ON c.id = d.chunk_id
    WHERE d.job_id = (SELECT job_a FROM params)
      AND d.diagnostic_kind = 'pass_output_snapshot'
  ) a
  FULL OUTER JOIN (
    SELECT
      d.chunk_id,
      c.chunk_index,
      d.pass_name,
      d.finding_count,
      d.findings_json,
      encode(digest(coalesce(d.findings_json::text, ''), 'sha256'), 'hex') AS findings_hash
    FROM public.analysis_judge_diagnostics d
    JOIN public.analysis_chunks c ON c.id = d.chunk_id
    WHERE d.job_id = (SELECT job_b FROM params)
      AND d.diagnostic_kind = 'pass_output_snapshot'
  ) b
    ON a.chunk_id = b.chunk_id
   AND coalesce(a.pass_name, '') = coalesce(b.pass_name, '')
),

-- VALIDATION stage comparison
validation_cmp AS (
  SELECT
    4 AS stage_rank,
    'VALIDATION'::text AS stage_name,
    coalesce(a.chunk_index, b.chunk_index) AS chunk_index,
    NULL::text AS pass_name,
    coalesce(a.chunk_id, b.chunk_id) AS chunk_id,
    NULL::text AS job_a_prompt_hash,
    NULL::text AS job_b_prompt_hash,
    CASE
      WHEN coalesce(a.validated_finding_count, -1) <> coalesce(b.validated_finding_count, -1) THEN 'validated_finding_count differs'
      WHEN coalesce(a.validated_hash, '') <> coalesce(b.validated_hash, '') THEN 'validated_findings_json differs'
      ELSE NULL
    END AS diff_reason,
    CASE
      WHEN coalesce(a.validated_finding_count, -1) <> coalesce(b.validated_finding_count, -1)
        OR coalesce(a.validated_hash, '') <> coalesce(b.validated_hash, '')
      THEN 'VALIDATION_CHANGED'
      ELSE 'UNKNOWN'
    END AS divergence_type,
    NULL::text AS job_a_raw_judge_response,
    NULL::text AS job_b_raw_judge_response,
    NULL::text AS job_a_raw_hash,
    NULL::text AS job_b_raw_hash,
    NULL::jsonb AS job_a_parsed_judge_response,
    NULL::jsonb AS job_b_parsed_judge_response,
    NULL::text AS job_a_parsed_hash,
    NULL::text AS job_b_parsed_hash,
    NULL::jsonb AS job_a_pass_findings_json,
    NULL::jsonb AS job_b_pass_findings_json,
    NULL::text AS job_a_pass_hash,
    NULL::text AS job_b_pass_hash,
    CASE WHEN coalesce(a.validated_finding_count, -1) <> coalesce(b.validated_finding_count, -1) OR coalesce(a.validated_hash, '') <> coalesce(b.validated_hash, '') THEN a.validated_findings_json ELSE NULL END AS job_a_validated_findings_json,
    CASE WHEN coalesce(a.validated_finding_count, -1) <> coalesce(b.validated_finding_count, -1) OR coalesce(a.validated_hash, '') <> coalesce(b.validated_hash, '') THEN b.validated_findings_json ELSE NULL END AS job_b_validated_findings_json,
    a.validated_hash AS job_a_validated_hash,
    b.validated_hash AS job_b_validated_hash,
    NULL::jsonb AS job_a_final_findings_json,
    NULL::jsonb AS job_b_final_findings_json,
    NULL::text AS job_a_final_hash,
    NULL::text AS job_b_final_hash
  FROM (
    SELECT
      d.chunk_id,
      c.chunk_index,
      d.validated_finding_count,
      d.validated_findings_json,
      encode(digest(coalesce(d.validated_findings_json::text, ''), 'sha256'), 'hex') AS validated_hash
    FROM public.analysis_judge_diagnostics d
    JOIN public.analysis_chunks c ON c.id = d.chunk_id
    WHERE d.job_id = (SELECT job_a FROM params)
      AND d.diagnostic_kind = 'validated_snapshot'
  ) a
  FULL OUTER JOIN (
    SELECT
      d.chunk_id,
      c.chunk_index,
      d.validated_finding_count,
      d.validated_findings_json,
      encode(digest(coalesce(d.validated_findings_json::text, ''), 'sha256'), 'hex') AS validated_hash
    FROM public.analysis_judge_diagnostics d
    JOIN public.analysis_chunks c ON c.id = d.chunk_id
    WHERE d.job_id = (SELECT job_b FROM params)
      AND d.diagnostic_kind = 'validated_snapshot'
  ) b
    ON a.chunk_id = b.chunk_id
),

final_payloads AS (
  SELECT
    (SELECT jsonb_agg(jsonb_build_object(
      'id', f.id,
      'evidence_hash', f.evidence_hash,
      'article_id', f.article_id,
      'atom_id', f.atom_id,
      'start_offset_global', f.start_offset_global,
      'end_offset_global', f.end_offset_global,
      'title_ar', f.title_ar,
      'evidence_snippet', f.evidence_snippet
    ) ORDER BY f.evidence_hash, f.article_id, f.atom_id, f.start_offset_global)
     FROM public.analysis_findings f
     WHERE f.job_id = (SELECT job_a FROM params)) AS run_a_final_json,
    (SELECT jsonb_agg(jsonb_build_object(
      'id', f.id,
      'evidence_hash', f.evidence_hash,
      'article_id', f.article_id,
      'atom_id', f.atom_id,
      'start_offset_global', f.start_offset_global,
      'end_offset_global', f.end_offset_global,
      'title_ar', f.title_ar,
      'evidence_snippet', f.evidence_snippet
    ) ORDER BY f.evidence_hash, f.article_id, f.atom_id, f.start_offset_global)
     FROM public.analysis_findings f
     WHERE f.job_id = (SELECT job_b FROM params)) AS run_b_final_json
),

final_cmp AS (
  SELECT
    5 AS stage_rank,
    'FINAL'::text AS stage_name,
    NULL::integer AS chunk_index,
    NULL::text AS pass_name,
    NULL::uuid AS chunk_id,
    NULL::text AS job_a_prompt_hash,
    NULL::text AS job_b_prompt_hash,
    CASE
      WHEN coalesce(a.final_count, -1) <> coalesce(b.final_count, -1) THEN 'analysis_findings count differs'
      WHEN coalesce(a.final_hash, '') <> coalesce(b.final_hash, '') THEN 'analysis_findings content differs'
      ELSE NULL
    END AS diff_reason,
    CASE
      WHEN coalesce(a.final_count, -1) <> coalesce(b.final_count, -1)
        OR coalesce(a.final_hash, '') <> coalesce(b.final_hash, '')
      THEN 'FINAL_OUTPUT_CHANGED'
      ELSE 'UNKNOWN'
    END AS divergence_type,
    NULL::text AS job_a_raw_judge_response,
    NULL::text AS job_b_raw_judge_response,
    NULL::text AS job_a_raw_hash,
    NULL::text AS job_b_raw_hash,
    NULL::jsonb AS job_a_parsed_judge_response,
    NULL::jsonb AS job_b_parsed_judge_response,
    NULL::text AS job_a_parsed_hash,
    NULL::text AS job_b_parsed_hash,
    NULL::jsonb AS job_a_pass_findings_json,
    NULL::jsonb AS job_b_pass_findings_json,
    NULL::text AS job_a_pass_hash,
    NULL::text AS job_b_pass_hash,
    NULL::jsonb AS job_a_validated_findings_json,
    NULL::jsonb AS job_b_validated_findings_json,
    NULL::text AS job_a_validated_hash,
    NULL::text AS job_b_validated_hash,
    CASE WHEN coalesce(a.final_count, -1) <> coalesce(b.final_count, -1) OR coalesce(a.final_hash, '') <> coalesce(b.final_hash, '') THEN p.run_a_final_json ELSE NULL END AS job_a_final_findings_json,
    CASE WHEN coalesce(a.final_count, -1) <> coalesce(b.final_count, -1) OR coalesce(a.final_hash, '') <> coalesce(b.final_hash, '') THEN p.run_b_final_json ELSE NULL END AS job_b_final_findings_json,
    a.final_hash AS job_a_final_hash,
    b.final_hash AS job_b_final_hash
  FROM (
    SELECT
      count(*) AS final_count,
      encode(digest(coalesce(string_agg(
        coalesce(evidence_hash, '') || '|' ||
        coalesce(article_id::text, '') || '|' ||
        coalesce(atom_id, '') || '|' ||
        coalesce(start_offset_global::text, '') || '|' ||
        coalesce(end_offset_global::text, ''),
        '||'
        ORDER BY coalesce(evidence_hash, ''), coalesce(article_id::text, ''), coalesce(atom_id, '')
      ), ''), 'sha256'), 'hex') AS final_hash
    FROM public.analysis_findings
    WHERE job_id = (SELECT job_a FROM params)
  ) a
  CROSS JOIN (
    SELECT
      count(*) AS final_count,
      encode(digest(coalesce(string_agg(
        coalesce(evidence_hash, '') || '|' ||
        coalesce(article_id::text, '') || '|' ||
        coalesce(atom_id, '') || '|' ||
        coalesce(start_offset_global::text, '') || '|' ||
        coalesce(end_offset_global::text, ''),
        '||'
        ORDER BY coalesce(evidence_hash, ''), coalesce(article_id::text, ''), coalesce(atom_id, '')
      ), ''), 'sha256'), 'hex') AS final_hash
    FROM public.analysis_findings
    WHERE job_id = (SELECT job_b FROM params)
  ) b
  CROSS JOIN final_payloads p
),

all_stages AS (
  SELECT * FROM raw_cmp
  UNION ALL
  SELECT * FROM parser_cmp
  UNION ALL
  SELECT * FROM pass_cmp
  UNION ALL
  SELECT * FROM validation_cmp
  UNION ALL
  SELECT * FROM final_cmp
),

divergences AS (
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY stage_rank, chunk_index NULLS LAST, pass_name NULLS LAST
    ) AS divergence_order,
    stage_rank,
    stage_name,
    pass_name,
    chunk_index,
    chunk_id,
    divergence_type,
    diff_reason,
    job_a_prompt_hash,
    job_b_prompt_hash,
    job_a_raw_judge_response,
    job_b_raw_judge_response,
    job_a_raw_hash,
    job_b_raw_hash,
    job_a_parsed_judge_response,
    job_b_parsed_judge_response,
    job_a_parsed_hash,
    job_b_parsed_hash,
    job_a_pass_findings_json,
    job_b_pass_findings_json,
    job_a_pass_hash,
    job_b_pass_hash,
    job_a_validated_findings_json,
    job_b_validated_findings_json,
    job_a_validated_hash,
    job_b_validated_hash,
    job_a_final_findings_json,
    job_b_final_findings_json,
    job_a_final_hash,
    job_b_final_hash
  FROM all_stages
  WHERE diff_reason IS NOT NULL
),

first_div AS (
  SELECT *
  FROM divergences
  ORDER BY divergence_order
  LIMIT 1
),

job_counts AS (
  SELECT
    (SELECT count(*) FROM public.analysis_findings WHERE job_id = (SELECT job_a FROM params)) AS run_a_findings,
    (SELECT count(*) FROM public.analysis_findings WHERE job_id = (SELECT job_b FROM params)) AS run_b_findings
),

root_cause AS (
  SELECT
    CASE
      WHEN f.divergence_type = 'PROMPT_CHANGED' THEN 'PROMPT'
      WHEN f.divergence_type = 'RAW_GPT_CHANGED' THEN 'MODEL'
      WHEN f.divergence_type = 'PARSER_CHANGED' THEN 'PARSER'
      WHEN f.divergence_type = 'PASS_OUTPUT_CHANGED' THEN 'PASS'
      WHEN f.divergence_type = 'VALIDATION_CHANGED' THEN 'VALIDATION'
      WHEN f.divergence_type = 'FINAL_OUTPUT_CHANGED' THEN 'FINAL'
      ELSE 'UNKNOWN'
    END AS root_cause_category,
    CASE
      WHEN f.divergence_type = 'PROMPT_CHANGED' THEN 'The first observable divergence occurs in rendered prompts.'
      WHEN f.divergence_type = 'RAW_GPT_CHANGED' THEN 'The first observable divergence occurs during GPT generation.'
      WHEN f.divergence_type = 'PARSER_CHANGED' THEN 'The parser/repair layer introduced the first divergence.'
      WHEN f.divergence_type = 'PASS_OUTPUT_CHANGED' THEN 'Post-parser pass transformation introduced the first divergence.'
      WHEN f.divergence_type = 'VALIDATION_CHANGED' THEN 'Validation introduced the first divergence.'
      WHEN f.divergence_type = 'FINAL_OUTPUT_CHANGED' THEN 'Final persistence/aggregation introduced the first divergence.'
      ELSE 'The first divergence category is unknown.'
    END AS conclusion,
    format(
      'Job A findings: %s | Job B findings: %s | First divergence stage: %s | pass: %s | chunk: %s | reason: %s',
      c.run_a_findings,
      c.run_b_findings,
      coalesce(f.stage_name, 'NONE'),
      coalesce(f.pass_name, 'n/a'),
      coalesce(f.chunk_index::text, 'n/a'),
      coalesce(f.diff_reason, 'none')
    ) AS summary
  FROM first_div f
  CROSS JOIN job_counts c
),

upsert_investigation AS (
  INSERT INTO public.analysis_investigations (
    job_a,
    job_b,
    first_divergence_stage,
    first_divergence_pass,
    first_divergence_chunk,
    root_cause_category,
    summary
  )
  SELECT
    (SELECT job_a FROM params),
    (SELECT job_b FROM params),
    f.stage_name,
    f.pass_name,
    f.chunk_index,
    r.root_cause_category,
    r.summary || ' | ' || r.conclusion
  FROM first_div f
  CROSS JOIN root_cause r
  ON CONFLICT (job_a, job_b)
  DO UPDATE SET
    first_divergence_stage = EXCLUDED.first_divergence_stage,
    first_divergence_pass = EXCLUDED.first_divergence_pass,
    first_divergence_chunk = EXCLUDED.first_divergence_chunk,
    root_cause_category = EXCLUDED.root_cause_category,
    summary = EXCLUDED.summary,
    created_at = now()
  RETURNING id, investigation_number, created_at
)

SELECT
  i.investigation_number,
  i.created_at,
  d.divergence_order,
  d.stage_name,
  d.pass_name,
  d.chunk_index,
  d.chunk_id,
  d.divergence_type,
  d.diff_reason,
  d.job_a_prompt_hash,
  d.job_b_prompt_hash,
  d.job_a_raw_hash,
  d.job_b_raw_hash,
  d.job_a_parsed_hash,
  d.job_b_parsed_hash,
  d.job_a_pass_hash,
  d.job_b_pass_hash,
  d.job_a_validated_hash,
  d.job_b_validated_hash,
  d.job_a_final_hash,
  d.job_b_final_hash,
  d.job_a_raw_judge_response,
  d.job_b_raw_judge_response,
  d.job_a_parsed_judge_response,
  d.job_b_parsed_judge_response,
  d.job_a_pass_findings_json,
  d.job_b_pass_findings_json,
  d.job_a_validated_findings_json,
  d.job_b_validated_findings_json,
  d.job_a_final_findings_json,
  d.job_b_final_findings_json,
  r.root_cause_category,
  r.conclusion AS root_cause_conclusion,
  r.summary AS root_cause_summary
FROM divergences d
CROSS JOIN upsert_investigation i
CROSS JOIN root_cause r
ORDER BY d.divergence_order;
