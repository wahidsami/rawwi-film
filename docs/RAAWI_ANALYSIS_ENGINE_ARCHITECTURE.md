# Raawi Film Analysis Engine Architecture

## Purpose

This document describes the design of the Raawi film analysis engine used to analyze uploaded scripts and generate compliance findings and reports. It focuses on the actual implementation structure in this repository rather than a hypothetical idealized pipeline.

## 1. System Overview

The analysis engine is a staged pipeline with these layers:

1. Ingestion and text normalization
2. Job and chunk orchestration
3. Lexicon-based mandatory detection
4. Router and judge LLM passes
5. Finding normalization and persistence
6. Aggregation into a final report

The main implementation lives in:

- [apps/worker/src/pipeline.ts](../apps/worker/src/pipeline.ts)
- [apps/worker/src/openai.ts](../apps/worker/src/openai.ts)
- [apps/worker/src/multiPassJudge.ts](../apps/worker/src/multiPassJudge.ts)
- [apps/worker/src/aggregation.ts](../apps/worker/src/aggregation.ts)
- [apps/worker/src/aiConstants.ts](../apps/worker/src/aiConstants.ts)
- [supabase/functions/tasks/index.ts](../supabase/functions/tasks/index.ts)

## 2. Core Runtime Flow

### 2.1 Input and job creation

The analysis starts when a script is uploaded and a task is created. The edge task handler creates:

- one analysis job row in the job table
- one or more chunk rows
- a normalized script text payload used for downstream analysis

The job also carries a config snapshot containing:

- analysis engine mode
- prompt versions
- model names
- temperature and seed
- analysis options such as merge strategy

### 2.2 Chunk processing

Each chunk is processed independently. The worker:

1. loads the chunk text
2. evaluates lexicon matches
3. optionally runs router selection
4. runs the judge pass or multi-pass detection
5. normalizes and persists findings
6. marks the chunk as completed

### 2.3 Aggregation

Once all chunks finish, aggregation loads the persisted findings and computes:

- canonical findings
- report hints
- severity summaries
- report metadata
- final HTML/JSON output

## 3. Major Components

### 3.1 Ingestion and extraction

The extraction path normalizes the uploaded script into a canonical representation. The worker relies on a consistent script text so that offsets remain stable across stages.

Responsibilities:

- normalize whitespace and formatting
- produce a canonical text body
- compute a script-content hash
- preserve global offsets for evidence anchoring

### 3.2 Lexicon layer

The lexicon layer runs before any LLM step. It checks active glossary/lexicon terms against the chunk text and produces mandatory findings when a configured term is detected.

Key behavior:

- terms come from the database table for active glossary entries
- matches may be exact or derived depending on the matcher rules
- mandatory findings are inserted directly into the findings table with an evidence hash

### 3.3 Router layer

The router layer is a lightweight LLM gate that narrows the article list for the judge. It selects the articles most relevant to the current chunk.

Inputs:

- the chunk text
- the article list
- the active lexicon terms

Output:

- candidate article IDs and confidence scores

### 3.4 Judge layer

The judge layer is the main analysis pass. It receives:

- the chunk text
- the relevant article definitions and atoms
- the lexicon terms
- formatting instructions and strict output requirements

The implementation uses JSON-based structured responses with repairs for malformed output.

### 3.5 Normalization and persistence

Before a finding is persisted, the pipeline normalizes it by:

- grounding evidence to the chunk text
- resolving offset and page information
- aligning article and atom identifiers
- ensuring the evidence snippet is compact and canonical

Persisted findings are stored with a uniqueness key based on the job and evidence hash so that repeated or duplicate findings are suppressed.

### 3.6 Aggregation and reporting

Aggregation merges findings from all chunks, builds canonical findings, and writes the final report snapshot into the report table.

The output includes:

- canonical findings
- report hints
- totals and severity counts
- summary metadata for the UI and exports

## 4. Deterministic Design Considerations

The system includes several mechanisms intended to make repeated runs comparable:

- deterministic prompt versions and default models
- fixed temperature and seed values
- deterministic sorting of router candidates
- evidence hashing for deduplication
- canonical text and offset handling

These mechanisms are important for the trace document that follows, because they allow two runs of the same script to be compared for divergence.

## 5. Data Model Summary

### Analysis job

Represents one analysis execution for a script version.

### Analysis chunk

Represents one slice of the script that is analyzed independently.

### Analysis findings

Represents raw, normalized, or deduplicated findings created during the analysis.

### Analysis report

Represents the aggregated report snapshot for the job.

## 6. Execution Stages

The practical execution path is:

1. create job and chunks
2. process each chunk
3. persist findings
4. aggregate findings into a report
5. expose the report to the web app

## 7. Notes on Non-Determinism

The system is largely deterministic in its structure, but a real execution can still diverge in practice because of:

- model output variability
- different prompt content depending on lexicon state
- timing-related chunk processing order
- partial retries or fallback logic

The trace document below captures one concrete execution to make those differences observable. For a source-grounded explanation of why repeated runs can end with different counts, see [docs/RAAWI_DETERMINISM_INVESTIGATION.md](RAAWI_DETERMINISM_INVESTIGATION.md). The worker now also emits stage-by-stage debug logs for router, judge, grounding, dedupe, validation, persistence, and aggregation so two runs can be compared directly.
