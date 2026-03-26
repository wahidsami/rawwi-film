# Execution Plan: AI Audit System Upgrade

Date: 2026-03-27

## Mission

Build a system that is:

- more consistent than a normal human auditor
- more scalable than a normal human auditor
- more traceable than a normal human auditor
- faster on large scripts
- safer to improve without breaking production

We will not prove quality through claims.
We will prove it through:

- benchmark datasets
- repeated-run consistency
- human-vs-AI comparison
- production-safe rollout

## Guiding Rules

1. Do not rewrite the whole system at once.
2. Do not change production defaults without evaluation data.
3. Every major quality change must have a benchmark before rollout.
4. Every performance change must be measured before and after.
5. Human review remains the safety layer for high-risk edge cases until benchmarks are strong.

## Phase Structure

### Phase 0: Baseline and Measurement

Goal:

- know exactly where the system stands before changing behavior

Deliverables:

- benchmark dataset
- complaint dataset
- large-script timing baseline
- current quality scorecard

TODO:

- collect real complaint examples from users and auditors
- collect scripts where the system performed well
- define benchmark labels for:
  - true violation
  - false positive
  - false negative
  - weak rationale
  - atom mismatch
  - story-context miss
- create an adversarial Arabic bad-word set with obfuscated spellings
- record current metrics for:
  - repeated-run consistency
  - precision
  - recall
  - rationale usefulness
  - runtime on small, medium, and large scripts
- log the current runtime breakdown:
  - total job duration
  - chunk count
  - router duration
  - pass durations
  - aggregation duration

Exit criteria:

- team can compare "before" and "after" for every future change

Suggested owner split:

- Product/Policy: label benchmark cases
- Backend/AI: instrumentation and evaluation runner

### Phase 1: Trust and Stability

Goal:

- make the system stable and stop obvious misses

Why first:

- users will not trust better explanations or faster runtime if results still change randomly

TODO:

- turn deterministic production analysis on by default
- fix production temperature and seed behavior
- lock model versions for the main analysis path
- version prompts explicitly and log versions with each job
- create a repeated-run regression test:
  - same script
  - same config
  - same model
  - same output
- implement Arabic normalization for detection-only matching:
  - tatweel
  - diacritics
  - zero-width chars
  - spaced letters
  - decorative separators
- add tests for Arabic obfuscated profanity and abusive words
- add a benchmark gate so no release can worsen stability or obvious-word detection

Exit criteria:

- repeated runs produce materially identical results
- obfuscated Arabic abusive forms are caught reliably
- no major increase in false positives

Risk notes:

- keep original text for display and evidence
- use normalized text only for detection logic

### Phase 2: Explanation and Auditability

Goal:

- every finding card should read like a disciplined audit note, not a vague AI guess

TODO:

- redesign rationale generation into a structured template:
  - detected text
  - policy mapping
  - contextual reading
  - ruling reason
- provide richer context to rationale generation:
  - nearby lines
  - dialogue vs description
  - scene/page context if available
- add explanation quality checks:
  - reject generic explanations
  - reject circular explanations
  - reject policy-title-only explanations
- create a "rationale usefulness" review form for auditors
- benchmark explanation quality on complaint cases
- improve finding cards to show:
  - exact snippet
  - mapped atom/article
  - structured reason
  - confidence or review status

Exit criteria:

- auditors say finding reasons are understandable and actionable
- fewer complaints like "AI flagged it but doesn’t know why"

Suggested owner split:

- AI/Prompt: rationale format and prompt logic
- Frontend: finding card display improvements
- Policy: explanation review criteria

### Phase 3: Atom Precision

Goal:

- tighten the weakest policy atoms until the system behaves like a specialist reviewer

TODO:

- identify the top 10 weakest atoms using complaint data and benchmark errors
- create an atom playbook for each weak atom:
  - definition
  - what counts
  - what does not count
  - common confusion cases
  - examples
  - non-examples
- add atom-level benchmark scoring
- build confusion reports:
  - atom A mistaken for atom B
  - article-level correct but atom-level wrong
- improve prompts or add confirmers for weak atoms only
- re-run benchmark after every atom-focused change

Exit criteria:

- atom-level confusion drops materially
- senior auditors agree more often with the system on difficult atoms

Risk notes:

- do not overfit to one or two examples
- use mixed-domain benchmark sets

### Phase 4: Story and Narrative Understanding

Goal:

- improve judgment on borderline cases where raw keyword detection is not enough

TODO:

- add a story-level narrative pass for borderline findings
- classify context dimensions such as:
  - endorsement
  - condemnation
  - punishment
  - reward
  - quoting
  - sarcasm
  - flashback
  - dream/fantasy
- strengthen scene/page-level context windows
- use narrative reasoning only for cases that need it
- benchmark narrative-sensitive scenarios separately
- create a review set of:
  - condemned violence
  - quoted abuse
  - ironic lines
  - character flaw vs endorsed behavior
  - moral resolution cases

Exit criteria:

- fewer false positives on condemned or quoted harmful content
- fewer false negatives on normalized harmful content

Risk notes:

- do not route simple profanity through expensive story logic
- use narrative logic as a second-stage judge, not the only detector

### Phase 5: Performance and Scale

Goal:

- bring large-script runtime down without hurting quality

TODO:

- fix router behavior so it actually reduces downstream work, or remove it
- add safe chunk concurrency
- improve chunk claiming so multiple workers do not collide on the same next chunk
- cache job-level data:
  - pages
  - lexicon rows
  - prompt-ready structures
- stop rebuilding full script text from overlapped chunks
- use canonical stored text for report-level summary logic
- gate expensive enrichments for very large jobs:
  - deep auditor
  - rationale-only enhancer
  - words to revisit
  - script summary
- add pass gating:
  - only run relevant passes when signals justify them
- measure before/after runtime at each step

Exit criteria:

- large-script runtime drops materially
- quality benchmark does not regress
- system remains stable under concurrency

Suggested owner split:

- Backend/Worker: concurrency, claiming, caching
- AI: pass gating and model routing

### Phase 6: Proof and Rollout

Goal:

- prove the system is stronger than normal manual review in the tasks that matter

TODO:

- run AI vs human comparison on the same benchmark scripts
- compare:
  - recall
  - precision
  - consistency
  - time-to-report
  - explanation usefulness
- publish an internal scorecard
- define rollout gates:
  - new system beats baseline on quality
  - new system does not exceed time/cost budget
  - new system remains deterministic
- ship new logic in shadow mode first
- review disagreement cases with senior auditors
- only promote changes that win on measured outcomes

Exit criteria:

- the team can show evidence, not opinion
- quality improvements are visible to both product and audit stakeholders

## First Sprint Recommendation

If we want maximum impact with minimum risk, Sprint 1 should focus on:

1. benchmark creation
2. deterministic analysis
3. Arabic normalization for obfuscated abusive words
4. structured rationale format
5. runtime instrumentation

Why this sprint first:

- it directly improves trust
- it creates the measurement foundation for every next phase
- it does not require a dangerous rewrite

## Sprint-by-Sprint TODO Board

### Sprint 1

- build benchmark datasets
- add runtime instrumentation
- freeze deterministic production behavior
- implement Arabic detection normalization
- add obfuscated-Arabic tests
- define structured rationale schema

### Sprint 2

- improve rationale generation
- add rationale quality filters
- update finding card UI
- identify top weak atoms
- create first atom playbooks

### Sprint 3

- atom-level tuning
- atom confusion reporting
- router fix or removal
- canonical full-text reconstruction fix

### Sprint 4

- safe chunk concurrency
- atomic next-chunk claiming improvement
- cache repeated job-level data
- benchmark large-script speed again

### Sprint 5

- borderline-case narrative pass
- scene/page-level context improvements
- benchmark story-sensitive edge cases

### Sprint 6

- AI vs human comparison round
- shadow rollout of upgraded pipeline
- disagreement review session
- decide promotion to production default

## Scorecard We Should Track Every Week

### Quality

- repeated-run consistency
- precision
- recall
- atom-level accuracy
- false positive count
- false negative count
- explanation usefulness rating

### Performance

- average job runtime
- p95 job runtime
- average chunk runtime
- p95 chunk runtime
- average large-script runtime
- AI call count per job

### Trust

- number of user complaints
- percentage of complaints reproduced in benchmark
- percentage of complaint cases fixed
- auditor agreement rate

## What We Must Not Do

- do not change many prompts, models, and worker logic at the same time
- do not ship narrative logic without benchmarks
- do not optimize speed by hiding or dropping real findings blindly
- do not claim "AI is better" without a scorecard
- do not remove human review on high-risk cases too early

## Definition of Success

We win when the team can say, with evidence:

- the system is stable
- the system catches obfuscated abusive language
- the system explains findings clearly
- the system understands hard atoms better
- the system handles long scripts faster
- the system matches or beats normal manual review on benchmark tasks

That is how we prove this is a serious AI-era audit system: by building a measured, trustworthy, repeatable product.
