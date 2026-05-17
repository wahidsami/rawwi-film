# V4 Script Analysis Diagnostic (For Captain Tars Consultation)

Date: 2026-05-17  
Scope: Why V4 currently returns incorrect findings (false positives + wrong category mapping), despite `violation_system_version = v4`.

---

## 1) Executive Summary

Your recent analysis outputs prove three facts:
1. The system is technically running `v4` (verified in `analysis_reports.summary_json.analysis_meta.violation_system_version`).
2. The model is still producing low-precision categorizations.
3. The issue is not deployment/version routing now; it is prompt architecture + post-validation strictness.

Main symptom patterns:
- Non-religious insults mapped under `المساس بالثوابت الدينية`.
- Child-harm findings mapped into unrelated buckets (for example, explicit sexual scenes).
- Documentary/historical category used for generic rumor/misinformation dialogue without documentary context.
- Overconfident scores (95–100%) for ambiguous or off-topic findings.

---

## 2) How the Current OpenAI Analysis Actually Works

### 2.1 Entry point and engine selection
- Worker config: [apps/worker/src/config.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/config.ts)
- Controlled by env:
  - `VIOLATION_SYSTEM_VERSION=v4`
- Prompt/version metadata:
  - [apps/worker/src/aiConstants.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aiConstants.ts)

### 2.2 Runtime pipeline (simplified)
1. Script text is chunked.
2. For each chunk, `runMultiPassDetection(...)` runs multiple subject passes in parallel:
   - [apps/worker/src/multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts)
3. Each pass calls OpenAI using:
   - `callJudgeRaw(...)`
   - `parseJudgeWithRepair(...)`
4. Results are normalized, filtered, deduped, then persisted.

### 2.3 V4 pass set (current)
- Defined in:
  - [apps/worker/src/v4PromptPack.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/v4PromptPack.ts)
- Active subject passes include:
  - `v4_01_religious_fundamentals`
  - `v4_02_state_leadership`
  - `v4_03_national_security`
  - `v4_04_historical_documentary_reliability`
  - `v4_05_society_identity_generalization`
  - `v4_06_children_crime_security`
  - `v4_07_drugs_alcohol_manufacture`
  - `v4_08_child_disability_harm`
  - `v4_09_lgbtq_positive_advocacy`
  - `v4_10_explicit_sexual_scenes`
  - `v4_11_profanity`
  - `v4_12_other`
  - plus glossary pass.

### 2.4 Prompt composition sent to OpenAI
For each pass, final system prompt is assembled from:
1. V4 shared overview (`docs/V4 prompts/shared_overview.md`)
2. Pass-specific subject markdown (`docs/V4 prompts/*.md`)
3. Structured rationale constraints (hardcoded block in `multiPassJudge.ts`)
4. Materialized related article payload (article text + atoms)
5. Runtime optional context attachment (if provided by pipeline)

The user payload includes chunk text + offsets + model settings.

---

## 3) Mapping to New Regulation File

Source policy file: [new regulation.md](/d:/Waheed/MypProjects/Raawifilm%20fix/new%20regulation.md)

Current mapping strategy:
- Regulation clauses are represented by V4 subject files under `docs/V4 prompts/`.
- Subject definitions in `v4PromptPack.ts` bind each subject to article ID groups.

Important limitation:
- Clause semantics are broad and legal-textual.
- Model is asked to map dialogue-level snippets to clause-level legal intent.
- Without strong deterministic rejection logic, cross-topic drift happens.

---

## 4) Why OpenAI Is Returning Bad Findings (Root-Cause Analysis)

## 4.1 Cross-topic semantic overlap
Many regulatory areas share vocabulary:
- insult, threat, social harm, child harm, national context.
The model often finds a harmful signal but assigns it to the wrong policy bucket.

Effect seen in your results:
- insult/profanity lines appearing under religious fundamentals.

## 4.2 Topic gates are still lexical, not legal-intent strict
Current early filters (in `applyEarlyPassFilters`) use topic anchors and some guards, but they are not strict enough to enforce legal-intent boundaries per clause.

Result:
- plausible harmful content passes filtering even if wrong clause.

## 4.3 Subject prompts are concise but not adversarial enough
The current V4 prompt files are compact. They do not yet include robust:
- positive/negative contrast examples,
- anti-confusion examples,
- explicit “if this then reject” rules for neighboring categories.

Result:
- model hallucinates nearest category match instead of rejecting.

## 4.4 Missing “documentary mode” hard switch for clause 1.4
`v4_04_historical_documentary_reliability` should be primarily documentary-only.
Today, dialogue misinformation can still leak in.

Result:
- historical unreliability findings on non-documentary conversational scenes.

## 4.5 Confidence inflation
Judge outputs high confidence on lexical certainty without sufficient policy-certainty checks.

Result:
- many off-topic findings with 95–100% confidence.

## 4.6 Glossary coupling contamination
Glossary findings can remain too permissive if lexicon entries are noisy or weakly constrained.

Result:
- technically matched but policy-irrelevant terms appearing as violations.

## 4.7 Parallel-pass fanout amplifies false positives
Each chunk is evaluated by many subject passes in parallel.
If each pass is not highly conservative, total false-positive volume grows quickly.

---

## 5) Evidence From Current Output (What it tells us)

Observed in your sample:
- Severe category misplacement:
  - Child abuse/threat style content under explicit sexual scenes.
  - Profanity behavior under religious fundamentals.
- Rationale overreach:
  - Some explanations infer broader intent not anchored by snippet text.
- Category collision:
  - Similar snippet appears in multiple conceptually different categories.

Conclusion:
- Detection “harm signal” exists.
- Classification precision and legal mapping are failing.

---

## 6) What Is Sent to OpenAI Today (At a practical level)

For each pass call:
1. System prompt:
   - shared V4 rules + subject file + rationale rules + article payload
2. User prompt:
   - chunk text (actual script segment)
   - offset context for extraction
3. Model:
   - usually `gpt-4.1` for nuanced subjects
   - `gpt-4.1-mini` for lighter lexical subjects
4. Response schema:
   - JSON findings with article/atom, rationale, evidence snippet, location

OpenAI is not “ignoring” prompts entirely; it is overgeneralizing under ambiguous policy boundaries.

---

## 7) Immediate Technical Gaps to Fix (Before Prompt-Only Tweaks)

1. Add deterministic pass-level legality validators:
- Each pass must satisfy intent predicates, not just keyword presence.

2. Add hard mutual exclusions:
- Example: `v4_10_explicit_sexual_scenes` cannot pass unless explicit sexual pattern exists.

3. Add documentary-mode gate for `v4_04`:
- Require documentary/historical-source context markers.

4. Add confidence penalty layer:
- Downgrade confidence when policy-intent certainty is low.

5. Strengthen rationale-snippet alignment check:
- Reject finding if rationale claims facts not inferable from snippet/local context.

6. Tighten glossary policy:
- Remove noisy lexicon terms.
- Add policy-linked lexicon quality checks.

---

## 8) Prompt-Level Improvements Needed (For Consultation)

For each V4 subject file, add:
1. “Must include” criteria.
2. “Must reject” criteria.
3. 5–10 positive examples.
4. 5–10 neighbor-category negative examples.
5. Ambiguous examples marked `needs_review`.

Specifically critical:
- `01_religious_fundamentals.md`
- `04_historical_documentary_reliability.md`
- `06_children_crime_security.md`
- `10_explicit_sexual_scenes.md`
- `11_profanity.md`

---

## 9) Recommendation to Captain Tars

The right path is a hybrid of:
1. Prompt redesign (legal precision by clause).
2. Deterministic post-filter validators per clause.
3. Golden test harness execution before production acceptance.

Prompt-only tuning is not sufficient by itself given current cross-topic overlap.

---

## 10) Final Status

- Environment/version routing: OK (`v4` confirmed).
- Core issue: classification precision and clause-level intent enforcement.
- Action required: strict validators + stronger subject prompts + golden set regression loop.

