# CLASSIFICATION_OWNERSHIP_AUDIT

## Bottom Line

Classification ownership is shared, but not equally:

- The **Reviewer / router / scope layer owns candidate article selection**.
- The **ReviewerScopeValidator owns canonical ownership resolution and reassignment**.
- The **Mapper owns the final runtime finding shape that gets persisted**.
- The **Persistence layer owns the final stored row values**.
- The **Report layer owns presentation only**.

So the answer is:

- The reviewer does **not** own the final persisted article by itself.
- The mapper does **not** choose the policy article from scratch.
- The final persisted classification is a **handoff**:
  - reviewer/routing proposes the space,
  - validator resolves canonical ownership,
  - mapper materializes the runtime finding,
  - persistence writes the row,
  - report renders the stored result.

In the current architecture, **article ownership is canonicalized in the validator and then materialized by the mapper**.

## Architecture Diagram

```text
Reviewer output
  -> Router
  -> Judge / ReasonedDecision
  -> ReviewerScopeValidator
  -> FindingMapper
  -> Persistence (analysis_findings)
  -> Aggregation / Report
```

## One Finding Trace

This is the practical lifecycle for one finding.

### 1) Reviewer output

- File: `apps/worker/src/analysisEngineV3/provider/reasonedDecisionValidation.ts`
- Function: `validateReasonedDecisionAgainstEvidence`
- Input: provider output as `V3ProviderReasoningResult`
- Output: `sanitizedDecision` with accepted article evaluations
- What changes:
  - Unsupported evidence or unsupported claims can be rejected.
  - Accepted `articleEvaluations` remain.
- What can be lost:
  - Entire evaluations can be removed if validation is fatal.
- What can be rewritten:
  - `articleEvaluations`
  - `applicableArticles`
  - `rejectedArticles`
- Whether classification can change:
  - Yes. At this stage, the provider’s output is still being validated and may be sanitized.

### 2) Router

- File: `apps/worker/src/analysisEngineV3/reviewerKnowledge/emergencyContextualReviewerRouter.ts`
- Function: `createEmergencyContextualReviewerKnowledgeSelection`
- Input: evidence, semantic context, entities, concepts
- Output: selected reviewers, reviewer scores, routing confidence, selected academy folders
- What changes:
  - Reviewer selection is narrowed deterministically.
- What can be lost:
  - Non-selected reviewers.
- What can be rewritten:
  - Candidate reviewer set.
- Whether classification can change:
  - Yes, but only at reviewer-selection level, not final article/materialized finding level.

### 3) Reviewer scope validator

- File: `apps/worker/src/analysisEngineV3/runtime/reviewerScopeValidator.ts`
- Function: `validateReviewerScope`
- Input: routing report, canonical ownership map, legal decision, reasoned decision
- Output: accepted findings, rejected findings by scope, sanitized legal decision
- What changes:
  - Canonical owner is resolved for each returned article.
  - A finding may be reassigned to the canonical reviewer if ownership is unambiguous.
- What can be lost:
  - Findings with no canonical owner or ambiguous ownership.
- What can be rewritten:
  - Reviewer label/id association for a finding.
  - `sanitizedDecision.finding` / accepted findings list.
- Whether classification can change:
  - Yes. This is the first place where article ownership becomes canonicalized.

### 4) Mapper

- File: `apps/worker/src/analysisEngineV3/runtime/findingMapper.ts`
- Function: `mapLegalDecisionToFindings`
- Input: validated legal decision, reasoned decision, diagnostics, GCAM mapping
- Output: `V3RuntimeFinding[]`
- What changes:
  - The runtime finding is materialized.
  - `article_id`, `atom_id`, `title_ar`, `description_ar`, `canonical_atom`, `policy_links` are assigned.
- What can be lost:
  - If no PASS evaluations survive, the mapper returns `[]`.
- What can be rewritten:
  - Article/atom titles and canonical atom labels are resolved from policy and GCAM mapping.
- Whether classification can change:
  - Yes. This is the main materialization step and can still collapse to zero if nothing survives validation.

### 5) Persistence

- File: `apps/worker/src/pipeline.ts`
- Function: the V3 persistence branch around the `resolvedFindings` mapping and `analysis_findings` upsert
- Input: runtime findings
- Output: rows inserted into `analysis_findings`
- What changes:
  - `article_id` and `atom_id` can be resolved from `canonical_atom` if missing.
  - `title_ar` can be normalized before insert.
  - `source` is assigned for the persisted row.
- What can be lost:
  - Findings can be filtered by persistence guards.
- What can be rewritten:
  - Final persisted `title_ar`
  - `article_id` / `atom_id` if canonical atom recovery is needed
  - `source`
- Whether classification can change:
  - Yes. Persistence can still normalize or filter the final row before storage.

### 6) Report

- File: `apps/worker/src/aggregation.ts`
- Functions:
  - `buildReviewFindingRows`
  - `applyReportGate`
  - `buildFindingDetailRow`
- Input: persisted rows
- Output: summary JSON and report HTML
- What changes:
  - Presentation fields are assembled.
  - Contextual findings may be moved to hints in `applyReportGate`.
- What can be lost:
  - Report hints can be separated from violations.
- What can be rewritten:
  - Display title, grouping, and report classification labels.
- Whether classification can change:
  - Yes for presentation, but not the persisted database row.

## Direct Answer: Who Owns the Article?

### Reviewer ownership

The reviewer owns:

- candidate reviewer selection
- candidate article narrowing
- the initial reasoning space

Evidence:

- `apps/worker/src/analysisEngineV3/reviewerKnowledge/emergencyContextualReviewerRouter.ts`
- `apps/worker/src/analysisEngineV3/reviewerKnowledge/reviewerScopeMatrix.ts`

### Mapper ownership

The mapper owns:

- final runtime finding construction
- final `article_id`
- final `atom_id`
- final `title_ar`
- final `description_ar`
- final `canonical_atom`

Evidence:

- `apps/worker/src/analysisEngineV3/runtime/findingMapper.ts`

### Canonical ownership resolution

The validator owns canonical ownership resolution:

- It reads the canonical article ownership map.
- It checks whether a returned article has a unique canonical owner.
- It can reassign the finding to the canonical reviewer.

Evidence:

- `apps/worker/src/analysisEngineV3/runtime/reviewerScopeValidator.ts`
- `apps/worker/src/analysisEngineV3/reviewerKnowledge/reviewerKnowledgeRegistry.ts`

## Where Ownership Changes

### Ownership change 1: Router -> Canonical validator

The router only narrows reviewers.

Ownership becomes canonical when `validateReviewerScope()` resolves the article’s canonical owner from the canonical article ownership map.

Relevant code:

- `apps/worker/src/analysisEngineV3/runtime/reviewerScopeValidator.ts:54-78`
- `apps/worker/src/analysisEngineV3/runtime/reviewerScopeValidator.ts:95-145`

### Ownership change 2: Validator -> Mapper

Once the validator accepts a finding, `mapLegalDecisionToFindings()` materializes the final runtime finding object with the selected article, atom, and policy titles.

Relevant code:

- `apps/worker/src/analysisEngineV3/runtime/findingMapper.ts:437-468`

### Ownership change 3: Mapper -> Persistence

The runtime finding is then resolved again in `pipeline.ts` before insert:

- missing `canonical_atom` may be derived from `getPrimaryGcamForCanonicalAtom`
- `article_id` / `atom_id` may be filled from canonical atom resolution
- `title_ar` may be normalized before insert

Relevant code:

- `apps/worker/src/pipeline.ts:3136-3173`
- `apps/worker/src/pipeline.ts:3257-3289`

### Ownership change 4: Persistence -> Report

The report layer reads stored rows and can regroup or relabel them for presentation.

Relevant code:

- `apps/worker/src/aggregation.ts:457-541`
- `apps/worker/src/aggregation.ts:2188-2204`
- `apps/worker/src/aggregation.ts:2497-2541`

## Specific Questions

### 1) Where is the article selected?

There are three levels:

1. **Router selects candidate reviewers and candidate article space**
   - `emergencyContextualReviewerRouter.ts`
2. **Validator resolves canonical ownership of the article**
   - `reviewerScopeValidator.ts`
3. **Mapper materializes the final article_id on the runtime finding**
   - `findingMapper.ts`

### Does GPT choose it?

No. GPT returns `articleEvaluations` / reasoned output, but it does not own the canonical article registry.

### Does PolicyMap choose it?

No. `PolicyMap` provides article and atom metadata, titles, and valid atom relationships, but it does not decide whether a finding is valid on its own.

### Does Router choose it?

Router chooses the reviewer set and candidate search space, not the final persisted article.

### Does Mapper choose it?

Mapper materializes the final runtime finding article/atom/title fields, but it depends on validated decision data and GCAM/policy lookups.

### 2) Where is the atom selected?

Atom selection is effectively split:

- `reviewerScopeValidator.ts` keeps or rebuilds accepted findings from article evaluations.
- `findingMapper.ts` resolves `atom_id` using:
  - `gcamMapping`
  - `getPolicyAtomIdsForArticle(articleId)[0]`
  - `normalizeAtomId(...)`
  - `getPrimaryCanonicalAtomForGcam(articleId, atomId)`

Relevant code:

- `apps/worker/src/analysisEngineV3/runtime/findingMapper.ts:456-468`

### 3) Where does the final Arabic title come from?

It comes from the mapper and later persistence normalization:

- `findingMapper.ts` uses `getPolicyArticle(articleId)?.title_ar`
- if missing, it falls back to GCAM mapping or module title
- `pipeline.ts` later runs `normalizeFindingTitleAgainstRationale(...)`

Relevant code:

- `apps/worker/src/analysisEngineV3/runtime/findingMapper.ts:456-468`
- `apps/worker/src/pipeline.ts:3257-3289`

### 4) Where does `canonical_atom` come from?

It is resolved in the mapper:

- `getPrimaryCanonicalAtomForGcam(articleId, atomId)`
- fallback `derivePolicyConceptCode(articleId, atomId)`

Relevant code:

- `apps/worker/src/analysisEngineV3/runtime/findingMapper.ts:456-468`

### 5) How is `PolicyMap` used?

`PolicyMap` is the shared canonical metadata source for:

- article metadata / Arabic titles
- atom metadata / Arabic atom labels
- valid atom normalization

It is read by:

- `findingMapper.ts`
- `pipeline.ts`
- report-building helpers in `aggregation.ts`

It does not own reviewer routing, but it supplies canonical article/atom metadata that the mapper and persistence layer use to materialize a finding.

### 6) Explain `findingMapper.ts` completely

`findingMapper.ts`:

1. Takes the validated legal decision and the validated reasoned decision.
2. Determines the source evaluations:
   - prefer `reasonedDecision.articleEvaluations`
   - otherwise fall back to `decision.finding`
3. Keeps only `PASS` evaluations.
4. If no PASS evaluations remain, returns `[]`.
5. For each PASS evaluation:
   - resolves article title from `PolicyMap`
   - resolves atom id from GCAM mapping or policy fallback
   - resolves canonical atom
   - selects evidence text
   - builds a runtime finding object
   - attaches reviewer/policy links/location/confidence/exception metadata

This file is the main **materialization layer** from validated decision to runtime finding.

### 7) Explain `reviewerScopeValidator.ts`

`reviewerScopeValidator.ts`:

- reads routing output
- reads canonical article ownership map
- resolves the canonical owner for each returned article
- creates accepted findings from `articleEvaluations`
- can reject findings when no canonical owner exists or ownership is ambiguous
- can reassign the finding to the canonical owner if the router selected a different reviewer

It does **not** move a finding to another article arbitrarily.
It can only canonicalize/reassign based on the ownership map.

### 8) Explain `reasonedDecisionValidation.ts`

`reasonedDecisionValidation.ts`:

- validates provider output against evidence and candidate sets
- preserves accepted article evaluations
- can reject unsupported evidence / unsupported factual claims / out-of-candidate articles or atoms
- can sanitize the decision by removing invalid evaluations

It does **not** own final article titles or persisted atom metadata.

### 9) Explain every persistence filter after the reviewer

In `pipeline.ts`, persistence can still affect the final stored row:

- `getPersistenceFindingSource(...)`
- `resolve article_id / atom_id from canonical_atom when missing`
- `normalizeFindingTitleAgainstRationale(...)`
- `normalizeMisusedGlossaryPassTitle(...)`
- legacy / memory2 guards and other filtering branches earlier in the pipeline

These are persistence-time transformations, not reviewer decisions.

### 10) Trace one real finding

For a single passed evaluation, the path is:

1. Provider returns `articleEvaluations`
2. `reasonedDecisionValidation.ts` preserves supported PASS evaluations
3. `reviewerScopeValidator.ts` resolves the canonical owner for the article
4. `findingMapper.ts` converts the evaluation into a `V3RuntimeFinding`
5. `pipeline.ts` resolves missing canonical fields and normalizes the title
6. `analysis_findings` receives the upsert row
7. `aggregation.ts` reads the persisted row and renders it into the report

## Risk Analysis

### Low risk

- Universal docs
- PolicyMap title lookups
- Report rendering from already-persisted rows

### Medium risk

- Mapper fallback behavior when `decision.finding` is used
- Persistence normalization of titles and canonical atom fallback
- Report gate relabeling of context-only findings

### High risk

- Any ambiguity in canonical ownership resolution
- Any stage that replaces a finding array with `[]`
- Any stage that rewrites `article_id` or `atom_id` without a canonical source
- Any filter that depends on legacy V2 assumptions after V3 produces article-by-article output

## Final Conclusion

In the current architecture, classification ownership belongs to **the canonical reviewer/ownership registry during validation, and the mapper during final materialization**.

More concretely:

- **Reviewer/router owns candidate selection**
- **Validator owns canonical ownership resolution**
- **Mapper owns the final persisted article/atom/title shape**

So the system is **hybrid**, with canonical ownership resolved before persistence and final article/atom values materialized by the mapper.

