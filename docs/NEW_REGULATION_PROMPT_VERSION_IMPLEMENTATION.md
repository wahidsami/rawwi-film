# New Regulation Prompt Version (Parallel to Current Prompts)

## Goal
- Keep current production prompts unchanged.
- Add a new regulation-aware prompt version that can be enabled safely per environment.
- Improve finding accuracy by converting each regulation clause into explicit detection rules + acceptance tests.

## Current System Reality
- Prompt versioning already exists in worker and tasks flow:
  - `apps/worker/src/aiConstants.ts`
  - `apps/worker/src/config.ts`
  - `apps/worker/src/multiPassJudge.ts`
  - `apps/worker/src/v3PromptPack.ts`
- Existing violation system switch is env-based (`VIOLATION_SYSTEM_VERSION` currently `v2|v3`).
- v3 already uses subject-based prompt files under:
  - `docs/V3 prompts/*.md`

## Proposed Safe Approach
1. Introduce a new system version key, e.g. `v4`.
2. Keep v3 default for now.
3. Add new prompt pack files (`docs/V4 prompts/*.md`) aligned exactly with `new regulation.md`.
4. Route worker to use V4 prompt overlays/subjects only when `VIOLATION_SYSTEM_VERSION=v4`.
5. Validate with a regulation test set before switching production.

## Regulation-to-Detection Mapping (from `new regulation.md`)
### Section 1: General Prohibitions
- 1.1 Religious fundamentals:
  - Detect explicit insult/mockery/denial against Quran mutawatir principles and mutawatir hadith.
  - Avoid false positives from neutral religious mention.
- 1.2 Saudi state/King/Crown Prince:
  - Detect direct/indirect abuse/undermining/incitement.
  - Require explicit target evidence in snippet.
- 1.3 National security:
  - Sub-rules:
    - Civil disobedience/riot/incitement against royal orders.
    - Weapon/explosive making instruction + risk minimization.
    - Undermining KSA service to Islam/holy sites.
    - Generalized abuse of all security personnel.
- 1.4 Historical documentary reliability:
  - Trigger for documentary context asserting historical claims without reliable sourcing framing.
- 1.5 Insulting KSA/society by broad generalization:
  - Detect harmful sweeping generalizations against Saudi society/large groups/tribes/families.
  - Include social cohesion/family breakup direct calls.
- 1.6 Child-targeted crime/security content:
  - Detect glamorization/positive framing of crime, gangs, extremist/political groups for children.
  - Include repeated positive audiovisual framing indicators.

### Section 2: Society & Ethics
- 2.1 Drugs/alcohol manufacturing instruction:
  - Detect instructional “how-to” content, direct or indirect.
- 2.2 Child/disability harm:
  - Detect encouragement/normalization of abuse, harassment, neglect, mobility restriction.
  - Detect mocking disability.
- 2.3 LGBTQ positive advocacy to general/minors audience:
  - Detect explicit/implicit positive encouragement, beautification, recruitment framing.
  - Include same-sex parenting normalization framing where applicable by policy.
- 2.4 Explicit sexual scenes:
  - Detect direct or strongly implied explicit sexual practice content.
- 2.5 Profanity:
  - Detect profanity across languages with age-rating sensitivity.

## Prompt Design Principles for Accuracy
- Use clause-level hard gates:
  - “Return finding only when snippet directly satisfies clause condition.”
- Use evidence discipline:
  - exact snippet + bounded offsets + no invented context.
- Split high-confusion topics:
  - Keep separate passes for religious, political leadership, national security, society generalization.
- Add negative examples in prompts:
  - “Do not classify neutral mention as violation.”
- Preserve reviewer layer:
  - Keep auditor/review stage to reduce false positives.

## Implementation Steps
1. Add `v4` to config enums:
  - `apps/worker/src/config.ts`
  - `apps/worker/src/aiConstants.ts`
  - any shared type unions in web/api models.
2. Add V4 prompt pack loader:
  - `apps/worker/src/v4PromptPack.ts` (copy structure from `v3PromptPack.ts`).
3. Add V4 prompt docs:
  - `docs/V4 prompts/shared_overview.md`
  - subject files mapped to clauses above.
4. Update `multiPassJudge.ts`:
  - apply V4 overlay/subject prompts when version is `v4`.
5. Keep pass IDs stable where possible to avoid downstream breakage.
6. Add tests:
  - per clause positive sample + near-miss negative sample.
7. Deploy in shadow mode:
  - run v3 in production and v4 on sampled jobs for comparison.

## Acceptance Test Matrix (Minimum)
- For each clause/sub-clause in `new regulation.md`:
  - 2 positive snippets that must produce findings.
  - 2 negative snippets that must not produce findings.
  - 1 ambiguous snippet expected as `needs_review`.
- Track:
  - precision, recall proxy, false-positive categories, missed categories.

## Rollout Plan
1. Phase A: Implement V4 prompts + tests locally.
2. Phase B: Deploy worker with `VIOLATION_SYSTEM_VERSION=v3` (no behavior change).
3. Phase C: Run comparison batch with `v4` in staging.
4. Phase D: Approve thresholds and switch production env to `v4`.
5. Phase E: Monitor first week and adjust prompt files only (no schema changes required).

## Deployment Impact
- SQL: not required for prompt-version switch itself.
- Edge functions: no mandatory function contract changes if version is env-routed in worker.
- Worker deploy: required after code changes.

## Why this fits your requirement
- Current prompts remain available.
- New regulations become a distinct linked version.
- Accuracy is controlled via clause mapping + test matrix, not by one big generic prompt rewrite.
