# Legal Triage Policy Engine Master Plan (Captain Tars Architecture)

Date: 2026-05-17  
Owner: Worker/Pipeline Team  
Scope: Replace category-first prompt classification with scene-understanding + deterministic legal adjudication.

---

## 1) Why We Are Changing

The new Saudi regulation model is legal-intent based, not lexical-category based.

Current failure pattern:
1. AI detects harmful language correctly in many cases.
2. AI assigns wrong legal bucket (cross-category collapse).
3. Confidence stays high even when clause ownership is wrong.

Core shift:
- GPT job: extract structured scene facts/events.
- Code job: decide legal violation clauses deterministically.

---

## 2) Target Runtime Architecture

## Stage A — Scene Event Extraction (AI only)
Input:
- chunk text
- chunk offsets
- optional local context

Output (`SceneEvent[]`):
- what happened
- who did what to whom
- intent/framing/promotional signals
- evidence snippet + offsets

No legal clause labels at this stage.

## Stage B — Deterministic Policy Mapping (Code only)
Input:
- `SceneEvent[]`

Output (`PolicyDecision[]`):
- clause id (example `2.2`, `1.4`)
- status (`violation` | `needs_review` | `rejected`)
- reason code / legal gate explanation

## Stage C — Legal Filters / Exclusions
Hard policy gates, examples:
1.4 valid only in documentary+factual context.
2.3 requires advocacy/promotion/beautification signals.
1.6 requires child-oriented + positive glamorization conditions.
2.4 requires explicit sexual practice threshold.

## Stage D — Finding Materialization
Only accepted policy decisions become reportable findings.

---

## 3) Current Status Snapshot

Completed:
1. `policy_v1` engine mode added in worker config and pipeline routing.
2. Policy-v1 shadow path integrated in chunk processing.
3. Scene analyzer scaffold implemented (`policyV1/sceneAnalyzer.ts`).
4. Initial deterministic policy engine scaffold implemented (`policyV1/policyEngine.ts`).

Current behavior:
- `policy_v1` runs in shadow instrumentation mode.
- baseline persisted findings remain unchanged (safe rollout).

---

## 4) Phase Plan (Detailed)

## Phase 1 — Foundation and Flags (Completed)
Deliverables:
1. Feature mode `ANALYSIS_ENGINE=policy_v1`.
2. Policy-v1 runtime hook in pipeline.
3. Initial schema + modules for scene events and policy decisions.

Acceptance:
1. Worker compiles.
2. Existing `v2/hybrid` behavior unaffected.
3. Policy-v1 metrics can be emitted in shadow.

## Phase 2 — Scene Event Contract Hardening (In Progress)
Goal:
- make extractor output stable, machine-safe, and legally useful.

Deliverables:
1. strict enum normalization for event fields.
2. deterministic fallback handling for unknown values.
3. extraction prompt tightened for:
   - no legal conclusions
   - no category names
   - no hallucinated context
4. extraction QA fixtures (positive + ambiguous + empty).

Acceptance:
1. malformed JSON does not break pipeline.
2. non-enum values are normalized to safe defaults.
3. event extraction remains stable across reruns.

## Phase 3 — Clause Rule Matrix v1 (Next)
Goal:
- encode first deterministic legal adjudication matrix.

Initial clauses:
1. 2.2 child/disability harm.
2. 2.3 advocacy/beautification gate.
3. 1.4 documentary historical reliability gate.
4. 2.5 profanity (strict separation from other clauses).
5. 1.3 national security intent gate.

Deliverables:
1. `ruleMatrix.ts` with per-clause predicates.
2. mandatory conditions + exclusion conditions.
3. standardized reason codes (audit friendly).

Acceptance:
1. golden-set clause outputs match expected decisions.
2. wrong-category collisions reduced significantly in shadow reports.

## Phase 4 — Policy Decisions to Findings Adapter
Goal:
- convert deterministic decisions into existing finding schema safely.

Deliverables:
1. adapter from `PolicyDecision` -> `JudgeFinding`.
2. deterministic severity hints per clause.
3. policy evidence anchoring compatibility with current viewer/report pipeline.

Acceptance:
1. generated findings open normally in existing UI/report exports.
2. no schema break for legacy components.

## Phase 5 — Dual-Run Evaluation and Parity
Goal:
- compare legacy V4 and policy_v1 at script/chunk/report level.

Deliverables:
1. side-by-side counters: legacy vs policy_v1.
2. confusion matrix by clause ownership.
3. false-positive / false-negative review queue.

Acceptance:
1. policy_v1 precision materially better on target scripts.
2. legal review signs off for limited rollout.

## Phase 6 — Controlled Production Rollout
Goal:
- progressive switch from legacy to policy-v1.

Rollout:
1. shadow only.
2. partial enforce by feature flag.
3. full enforce with rollback switch.

Acceptance:
1. no critical regressions.
2. lower manual correction load.
3. clause ownership stability maintained.

---

## 5) Data Contracts

## SceneEvent (normalized)
Required:
1. `event_id`
2. `event_type`
3. `target_class`
4. `action_mode`
5. `intent_signal`
6. `framing`
7. `promoted`
8. `glorified`
9. `repeated`
10. `documentary_context`
11. `factual_claim_present`
12. `evidence_snippet`

Optional:
1. actor/target labels
2. offsets
3. extraction confidence

## PolicyDecision
1. `decision_id`
2. `source_event_id`
3. `regulation_clause`
4. `status`
5. `reason_code`
6. `reason_text_ar`
7. `evidence_snippet`

---

## 6) Deterministic Rule Style Guide

Each clause must define:
1. trigger conditions (must all pass).
2. exclusion conditions (any match rejects).
3. review conditions (`needs_review` fallback).
4. evidence sufficiency rules.

Rule output policy:
1. use `violation` only when conditions are explicit.
2. use `needs_review` for uncertain legal conditions.
3. use `rejected` when mandatory legal gate is missing.

---

## 7) Golden Test Strategy

For each clause:
1. 3 positive samples.
2. 3 negative near-miss samples.
3. 2 ambiguous samples expected as `needs_review`.

Measure:
1. clause precision.
2. wrong-clause assignment rate.
3. unsupported high-confidence decisions.

---

## 8) Deployment/Operations

Worker:
1. deploy required for policy-v1 code changes.

SQL:
1. optional in later phases if we add trace tables.
2. not mandatory for current shadow phases.

Edge functions:
1. only affected if response schema/metadata exposure is changed.
2. current shadow instrumentation does not require immediate function contract changes.

---

## 9) Immediate Execution Queue

1. Finish Phase 2 contract hardening in `sceneEventSchema.ts` and `sceneAnalyzer.ts`.
2. Implement Phase 3 rule matrix module and plug it into `policyEngine.ts`.
3. Add deterministic adapter stub for Phase 4 (shadow-only, no persistence switch yet).
4. Run worker compile checks and commit/push per phase.

