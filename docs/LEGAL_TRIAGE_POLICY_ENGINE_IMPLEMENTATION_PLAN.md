# Legal Triage Policy Engine Implementation Plan (Captain Tars Model)

Date: 2026-05-17  
Owner: Worker/Pipeline team  
Status: Phase 0 complete, Phase 1 in progress

---

## 1) Objective

Replace category-first prompt adjudication with:
1. AI scene understanding (fact extraction only)
2. Deterministic legal policy mapping in code
3. Deterministic legal filters/exclusions
4. Final violation reporting after policy decision

This plan follows Captain Tars’ architecture: GPT as scene analyst, code as legal judge.

---

## 2) Problem Statement

Current model (prompt-per-regulation) causes:
- cross-category collapse
- false positives from semantic overlap
- legal-intent mismatch (Saudi regulations are legal-intent based)

Therefore prompt tuning alone is insufficient. We need a policy reasoning system.

---

## 3) Target Architecture

## Stage A: Scene Analyzer (LLM)
Input: text chunk + local context  
Output: structured `SceneEvent[]` only (no legal ruling)

Event dimensions:
- event_type (abuse, insult, threat, sexual, drugs, political, religious, historical claim...)
- actor/target
- target class (child, woman, disabled, public, state...)
- intent/framing (negative/neutral/positive)
- promotion/glorification/advocacy signals
- evidence snippet + offsets
- confidence of extraction

## Stage B: Policy Engine (deterministic code)
Input: `SceneEvent[]`  
Output: `PolicyDecision[]` mapped to Saudi regulations

Rules handle:
- clause conditions
- required legal gates
- exclusions
- category ownership

## Stage C: Legal Filters
Examples:
- historical unreliability valid only with documentary/factual-context gate
- LGBTQ clause valid only on advocacy/promotion/beautification, not mere mention
- child crime clause requires positive framing/promotion conditions
- explicit sexual scenes require explicitness threshold

## Stage D: Report Materialization
Only accepted legal decisions become findings.

---

## 4) Phased Delivery

## Phase 0 — Planning & Baseline (Done)
Deliverables:
- V4 diagnostic report
- identified architectural mismatch
- golden test set created

## Phase 1 — Foundation (Start now)
Deliverables:
1. `SceneEvent` schema + runtime validators.
2. `sceneAnalyzer` module scaffold (OpenAI extraction call contract).
3. `policyEngine` module scaffold (deterministic mapping pipeline contract).
4. Feature flag hooks (non-breaking, off by default).

Acceptance:
- Worker compiles.
- Existing v2/v3/v4 flows unchanged.
- New modules ready for integration.

## Phase 2 — Scene Analyzer v1
Deliverables:
1. Universal extractor prompt (facts only).
2. Strict JSON schema parse + repair path.
3. Chunk-level extraction with evidence offsets.

Acceptance:
- Extractor returns stable event JSON on sample scripts.
- No direct legal labels emitted from AI.

## Phase 3 — Policy Engine v1 (Core Rules)
Initial rules:
1.4 historical documentary reliability gate  
2.3 advocacy/beautification requirement  
2.2 child/disability harm logic  
2.5 profanity vs bullying separation  
1.3 national security strict intent gating

Acceptance:
- Deterministic mapping reproduces expected clause outcomes on golden set.

## Phase 4 — Integration
Deliverables:
- New engine mode `policy_v1` in worker (parallel path).
- Persist analysis metadata indicating policy engine mode.
- Optional shadow-mode compare against current v4.

Acceptance:
- No regression in existing flows.
- Compare report available for v4 vs policy_v1.

## Phase 5 — Calibration & Rollout
Deliverables:
- error taxonomy dashboard
- threshold tuning
- policy rule refinement

Acceptance:
- False-positive rate reduced significantly on golden and real samples.
- Approval from legal/policy review.

---

## 5) Data Contracts

## SceneEvent (proposed)
- id
- event_type
- actor_label (optional)
- target_label (optional)
- target_class (child, woman, disabled, public, state, leadership, religion, unknown)
- action_mode (speech, action, visual, narration)
- intent_signal (harm, insult, advocacy, instruction, ridicule, claim)
- framing (negative, neutral, positive)
- glorified (bool)
- promoted (bool)
- repeated (bool)
- documentary_context (bool)
- factual_claim_present (bool)
- evidence_snippet
- start_offset, end_offset
- extraction_confidence

## PolicyDecision (proposed)
- decision_id
- regulation_clause
- decision (violation, needs_review, rejected)
- reason_code
- reason_text_ar
- source_event_id
- evidence_snippet
- severity_hint

---

## 6) Deterministic Rule Principles

1. Every clause has:
- mandatory conditions
- exclusion conditions
- minimum evidence constraints

2. “Mere mention” is never enough where regulation requires advocacy/promotion/glorification.

3. Category ownership:
- one primary clause per incident
- secondary links optional

4. Confidence:
- extraction confidence (from AI) separated from legal confidence (from deterministic rule strength)

---

## 7) Integration with Existing System

No immediate SQL migration required for Phase 1–2 scaffolding.

Potential later DB additions (Phase 4+):
- optional `analysis_scene_events` table for traceability
- optional `analysis_policy_decisions` table for auditability

Edge functions deploy impact:
- none for Phase 1 scaffolding
- worker deploy required for pipeline changes

---

## 8) Risk Management

Risks:
- over-strict rules causing false negatives
- incomplete event extraction for subtle legal intent

Mitigation:
- shadow mode with side-by-side compare
- golden set + real scripts iterative calibration
- legal-review feedback loop

---

## 9) Success Metrics

Primary:
- reduction in wrong-category findings
- reduction in non-violation false positives

Secondary:
- stable category ownership
- improved reviewer trust and lower manual correction load

---

## 10) Immediate Next Actions

1. Implement Phase 1 scaffolding modules.
2. Add `policy_v1` engine placeholder path (off by default).
3. Start Phase 2 extractor prompt and schema enforcement.
