-- Compare two analysis execution signatures side-by-side.
-- Replace the UUID placeholders below before running.

WITH params AS (
  SELECT
    'JOB_A_UUID'::uuid AS job_a,
    'JOB_B_UUID'::uuid AS job_b
),
sig_a AS (
  SELECT s.*
  FROM params p
  LEFT JOIN public.analysis_execution_signatures s ON s.job_id = p.job_a
),
sig_b AS (
  SELECT s.*
  FROM params p
  LEFT JOIN public.analysis_execution_signatures s ON s.job_id = p.job_b
)
SELECT
  a.job_id AS job_id_job_a,
  b.job_id AS job_id_job_b,
  a.job_id IS NOT DISTINCT FROM b.job_id AS job_id_identical,
  a.script_id AS script_id_job_a,
  b.script_id AS script_id_job_b,
  a.script_id IS NOT DISTINCT FROM b.script_id AS script_id_identical,
  a.version_id AS version_id_job_a,
  b.version_id AS version_id_job_b,
  a.version_id IS NOT DISTINCT FROM b.version_id AS version_id_identical,
  a.created_at AS created_at_job_a,
  b.created_at AS created_at_job_b,
  a.created_at IS NOT DISTINCT FROM b.created_at AS created_at_identical,
  a.provider_name AS provider_name_job_a,
  b.provider_name AS provider_name_job_b,
  a.provider_name IS NOT DISTINCT FROM b.provider_name AS provider_name_identical,
  a.model_name AS model_name_job_a,
  b.model_name AS model_name_job_b,
  a.model_name IS NOT DISTINCT FROM b.model_name AS model_name_identical,
  a.model_version AS model_version_job_a,
  b.model_version AS model_version_job_b,
  a.model_version IS NOT DISTINCT FROM b.model_version AS model_version_identical,
  a.router_model_name AS router_model_name_job_a,
  b.router_model_name AS router_model_name_job_b,
  a.router_model_name IS NOT DISTINCT FROM b.router_model_name AS router_model_name_identical,
  a.auditor_model_name AS auditor_model_name_job_a,
  b.auditor_model_name AS auditor_model_name_job_b,
  a.auditor_model_name IS NOT DISTINCT FROM b.auditor_model_name AS auditor_model_name_identical,
  a.rationale_model_name AS rationale_model_name_job_a,
  b.rationale_model_name AS rationale_model_name_job_b,
  a.rationale_model_name IS NOT DISTINCT FROM b.rationale_model_name AS rationale_model_name_identical,
  a.temperature AS temperature_job_a,
  b.temperature AS temperature_job_b,
  a.temperature IS NOT DISTINCT FROM b.temperature AS temperature_identical,
  a.top_p AS top_p_job_a,
  b.top_p AS top_p_job_b,
  a.top_p IS NOT DISTINCT FROM b.top_p AS top_p_identical,
  a.seed AS seed_job_a,
  b.seed AS seed_job_b,
  a.seed IS NOT DISTINCT FROM b.seed AS seed_identical,
  a.max_tokens AS max_tokens_job_a,
  b.max_tokens AS max_tokens_job_b,
  a.max_tokens IS NOT DISTINCT FROM b.max_tokens AS max_tokens_identical,
  a.reasoning_effort AS reasoning_effort_job_a,
  b.reasoning_effort AS reasoning_effort_job_b,
  a.reasoning_effort IS NOT DISTINCT FROM b.reasoning_effort AS reasoning_effort_identical,
  a.response_format AS response_format_job_a,
  b.response_format AS response_format_job_b,
  a.response_format IS NOT DISTINCT FROM b.response_format AS response_format_identical,
  a.pipeline_version AS pipeline_version_job_a,
  b.pipeline_version AS pipeline_version_job_b,
  a.pipeline_version IS NOT DISTINCT FROM b.pipeline_version AS pipeline_version_identical,
  a.analysis_engine_version AS analysis_engine_version_job_a,
  b.analysis_engine_version AS analysis_engine_version_job_b,
  a.analysis_engine_version IS NOT DISTINCT FROM b.analysis_engine_version AS analysis_engine_version_identical,
  a.memory_version AS memory_version_job_a,
  b.memory_version AS memory_version_job_b,
  a.memory_version IS NOT DISTINCT FROM b.memory_version AS memory_version_identical,
  a.scene_memory_version AS scene_memory_version_job_a,
  b.scene_memory_version AS scene_memory_version_job_b,
  a.scene_memory_version IS NOT DISTINCT FROM b.scene_memory_version AS scene_memory_version_identical,
  a.script_memory_version AS script_memory_version_job_a,
  b.script_memory_version AS script_memory_version_job_b,
  a.script_memory_version IS NOT DISTINCT FROM b.script_memory_version AS script_memory_version_identical,
  a.evidence_pinning_version AS evidence_pinning_version_job_a,
  b.evidence_pinning_version AS evidence_pinning_version_job_b,
  a.evidence_pinning_version IS NOT DISTINCT FROM b.evidence_pinning_version AS evidence_pinning_version_identical,
  a.router_version AS router_version_job_a,
  b.router_version AS router_version_job_b,
  a.router_version IS NOT DISTINCT FROM b.router_version AS router_version_identical,
  a.grounding_version AS grounding_version_job_a,
  b.grounding_version AS grounding_version_job_b,
  a.grounding_version IS NOT DISTINCT FROM b.grounding_version AS grounding_version_identical,
  a.validator_version AS validator_version_job_a,
  b.validator_version AS validator_version_job_b,
  a.validator_version IS NOT DISTINCT FROM b.validator_version AS validator_version_identical,
  a.aggregation_version AS aggregation_version_job_a,
  b.aggregation_version AS aggregation_version_job_b,
  a.aggregation_version IS NOT DISTINCT FROM b.aggregation_version AS aggregation_version_identical,
  a.auditor_version AS auditor_version_job_a,
  b.auditor_version AS auditor_version_job_b,
  a.auditor_version IS NOT DISTINCT FROM b.auditor_version AS auditor_version_identical,
  a.violation_system_version AS violation_system_version_job_a,
  b.violation_system_version AS violation_system_version_job_b,
  a.violation_system_version IS NOT DISTINCT FROM b.violation_system_version AS violation_system_version_identical,
  a.system_prompt_hash AS system_prompt_hash_job_a,
  b.system_prompt_hash AS system_prompt_hash_job_b,
  a.system_prompt_hash IS NOT DISTINCT FROM b.system_prompt_hash AS system_prompt_hash_identical,
  a.user_prompt_hash AS user_prompt_hash_job_a,
  b.user_prompt_hash AS user_prompt_hash_job_b,
  a.user_prompt_hash IS NOT DISTINCT FROM b.user_prompt_hash AS user_prompt_hash_identical,
  a.combined_prompt_hash AS combined_prompt_hash_job_a,
  b.combined_prompt_hash AS combined_prompt_hash_job_b,
  a.combined_prompt_hash IS NOT DISTINCT FROM b.combined_prompt_hash AS combined_prompt_hash_identical,
  a.summary_hash AS summary_hash_job_a,
  b.summary_hash AS summary_hash_job_b,
  a.summary_hash IS NOT DISTINCT FROM b.summary_hash AS summary_hash_identical,
  a.memory_hash AS memory_hash_job_a,
  b.memory_hash AS memory_hash_job_b,
  a.memory_hash IS NOT DISTINCT FROM b.memory_hash AS memory_hash_identical,
  a.summary_source AS summary_source_job_a,
  b.summary_source AS summary_source_job_b,
  a.summary_source IS NOT DISTINCT FROM b.summary_source AS summary_source_identical,
  a.summary_generation_timestamp AS summary_generation_timestamp_job_a,
  b.summary_generation_timestamp AS summary_generation_timestamp_job_b,
  a.summary_generation_timestamp IS NOT DISTINCT FROM b.summary_generation_timestamp AS summary_generation_timestamp_identical,
  a.summary_model AS summary_model_job_a,
  b.summary_model AS summary_model_job_b,
  a.summary_model IS NOT DISTINCT FROM b.summary_model AS summary_model_identical,
  a.summary_version AS summary_version_job_a,
  b.summary_version AS summary_version_job_b,
  a.summary_version IS NOT DISTINCT FROM b.summary_version AS summary_version_identical,
  a.chunk_size AS chunk_size_job_a,
  b.chunk_size AS chunk_size_job_b,
  a.chunk_size IS NOT DISTINCT FROM b.chunk_size AS chunk_size_identical,
  a.overlap_size AS overlap_size_job_a,
  b.overlap_size AS overlap_size_job_b,
  a.overlap_size IS NOT DISTINCT FROM b.overlap_size AS overlap_size_identical,
  a.total_chunks AS total_chunks_job_a,
  b.total_chunks AS total_chunks_job_b,
  a.total_chunks IS NOT DISTINCT FROM b.total_chunks AS total_chunks_identical,
  a.total_detection_passes AS total_detection_passes_job_a,
  b.total_detection_passes AS total_detection_passes_job_b,
  a.total_detection_passes IS NOT DISTINCT FROM b.total_detection_passes AS total_detection_passes_identical,
  a.diagnostics_enabled AS diagnostics_enabled_job_a,
  b.diagnostics_enabled AS diagnostics_enabled_job_b,
  a.diagnostics_enabled IS NOT DISTINCT FROM b.diagnostics_enabled AS diagnostics_enabled_identical,
  a.lineage_enabled AS lineage_enabled_job_a,
  b.lineage_enabled AS lineage_enabled_job_b,
  a.lineage_enabled IS NOT DISTINCT FROM b.lineage_enabled AS lineage_enabled_identical,
  a.analysis_signature_hash AS analysis_signature_hash_job_a,
  b.analysis_signature_hash AS analysis_signature_hash_job_b,
  a.analysis_signature_hash IS NOT DISTINCT FROM b.analysis_signature_hash AS analysis_signature_hash_identical,
  (
    a.job_id IS NOT DISTINCT FROM b.job_id
    AND a.script_id IS NOT DISTINCT FROM b.script_id
    AND a.version_id IS NOT DISTINCT FROM b.version_id
    AND a.created_at IS NOT DISTINCT FROM b.created_at
    AND a.provider_name IS NOT DISTINCT FROM b.provider_name
    AND a.model_name IS NOT DISTINCT FROM b.model_name
    AND a.model_version IS NOT DISTINCT FROM b.model_version
    AND a.router_model_name IS NOT DISTINCT FROM b.router_model_name
    AND a.auditor_model_name IS NOT DISTINCT FROM b.auditor_model_name
    AND a.rationale_model_name IS NOT DISTINCT FROM b.rationale_model_name
    AND a.temperature IS NOT DISTINCT FROM b.temperature
    AND a.top_p IS NOT DISTINCT FROM b.top_p
    AND a.seed IS NOT DISTINCT FROM b.seed
    AND a.max_tokens IS NOT DISTINCT FROM b.max_tokens
    AND a.reasoning_effort IS NOT DISTINCT FROM b.reasoning_effort
    AND a.response_format IS NOT DISTINCT FROM b.response_format
    AND a.pipeline_version IS NOT DISTINCT FROM b.pipeline_version
    AND a.analysis_engine_version IS NOT DISTINCT FROM b.analysis_engine_version
    AND a.memory_version IS NOT DISTINCT FROM b.memory_version
    AND a.scene_memory_version IS NOT DISTINCT FROM b.scene_memory_version
    AND a.script_memory_version IS NOT DISTINCT FROM b.script_memory_version
    AND a.evidence_pinning_version IS NOT DISTINCT FROM b.evidence_pinning_version
    AND a.router_version IS NOT DISTINCT FROM b.router_version
    AND a.grounding_version IS NOT DISTINCT FROM b.grounding_version
    AND a.validator_version IS NOT DISTINCT FROM b.validator_version
    AND a.aggregation_version IS NOT DISTINCT FROM b.aggregation_version
    AND a.auditor_version IS NOT DISTINCT FROM b.auditor_version
    AND a.violation_system_version IS NOT DISTINCT FROM b.violation_system_version
    AND a.system_prompt_hash IS NOT DISTINCT FROM b.system_prompt_hash
    AND a.user_prompt_hash IS NOT DISTINCT FROM b.user_prompt_hash
    AND a.combined_prompt_hash IS NOT DISTINCT FROM b.combined_prompt_hash
    AND a.summary_hash IS NOT DISTINCT FROM b.summary_hash
    AND a.memory_hash IS NOT DISTINCT FROM b.memory_hash
    AND a.summary_source IS NOT DISTINCT FROM b.summary_source
    AND a.summary_generation_timestamp IS NOT DISTINCT FROM b.summary_generation_timestamp
    AND a.summary_model IS NOT DISTINCT FROM b.summary_model
    AND a.summary_version IS NOT DISTINCT FROM b.summary_version
    AND a.chunk_size IS NOT DISTINCT FROM b.chunk_size
    AND a.overlap_size IS NOT DISTINCT FROM b.overlap_size
    AND a.total_chunks IS NOT DISTINCT FROM b.total_chunks
    AND a.total_detection_passes IS NOT DISTINCT FROM b.total_detection_passes
    AND a.diagnostics_enabled IS NOT DISTINCT FROM b.diagnostics_enabled
    AND a.lineage_enabled IS NOT DISTINCT FROM b.lineage_enabled
    AND a.analysis_signature_hash IS NOT DISTINCT FROM b.analysis_signature_hash
  ) AS analysis_signature_matches
FROM sig_a a
CROSS JOIN sig_b b;
