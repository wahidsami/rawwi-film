# AI Quality and Trust Roadmap

Date: 2026-03-27

## Purpose

This roadmap translates the current product pain points into a phased plan that improves:

- trust
- explanation quality
- atom accuracy
- story-level understanding
- speed
- robustness to obfuscated Arabic wording

The goal is not just to make the system "better than today". The goal is to make it measurably stronger than a normal human auditor in the areas where AI should win:

- consistency
- recall
- speed at scale
- resistance to fatigue
- repeatability
- traceability

Important note:

- we should not claim "AI is better than humans" as a slogan
- we should prove where it is better, with measurements
- we should keep human-review checkpoints for high-risk cases until the evidence is strong

## The Six Pain Points

### 1. Same scan gives slightly different results

What users feel:

- the system looks unstable
- confidence drops immediately

Likely root causes:

- non-deterministic model behavior
- repeated multi-call orchestration
- prompt/model drift
- borderline findings flipping between passes

### 2. Weak or unclear reason on finding cards

What users feel:

- "the system flagged this, but does not really understand why"

Likely root causes:

- rationale generation is too generic
- not enough structured context is provided
- output format does not force a useful explanation

### 3. Weak understanding of some atoms

What users feel:

- some categories are over-triggered, under-triggered, or confused with nearby atoms

Likely root causes:

- atoms are subtle and overlapping
- prompts are article-aware but not always atom-sharp
- insufficient edge-case examples

### 4. Weak understanding of story flow

What users feel:

- the AI can see words, but not always the meaning of the scene

Likely root causes:

- chunk-local detection dominates
- narrative stance is not strong enough in final ruling
- the system does not fully model endorsement, condemnation, punishment, irony, dream sequences, quoting, and resolution

### 5. Analysis time is too long

What users feel:

- the system is expensive, slow, and frustrating on large scripts

Likely root causes:

- serial chunk processing
- too many passes per chunk
- repeated DB work
- expensive enrichments running for all jobs

### 6. Bad words written in obfuscated Arabic are missed

What users feel:

- obvious bad words escape detection if they are written in a weird form

Likely root causes:

- lack of Arabic detection normalization layer
- glossary matching is too literal
- no robust handling for tatweel, spacing, diacritics, zero-width characters, or decorative forms

## Core Strategy

We should improve the system in four tracks at the same time, but roll them out safely:

1. Trust Track
2. Explanation Track
3. Policy Precision Track
4. Narrative + Speed Track

The rule is:

- do not replace the whole system at once
- add changes behind feature flags, evaluation mode, or shadow mode
- compare new output against current production and human-reviewed ground truth before switching defaults

## Phase 1: Trust First

Timeline:

- first sprint

Goal:

- make the system stable and stop missing obvious cases

### 1A. Make production scans deterministic

Actions:

- set production analysis to deterministic mode
- use fixed seed
- use `temperature = 0` for production judging flows
- lock model versions for core analysis paths
- version prompts explicitly and treat prompt changes like code changes

Success criteria:

- same script + same config + same model => same result on repeated runs
- no unexplained variation in total findings count

Why this matters:

- without stability, users will never trust the rest of the improvements

### 1B. Add Arabic detection normalization

This should be a detection-only layer. We keep original text for display and offsets, but also create a normalized search form for matching.

Normalize at least:

- tatweel / kashida
- extra spacing between letters
- zero-width characters
- diacritics
- repeated decorative separators
- common Arabic letter variants when safe

Examples to catch:

- `قـ ذر`
- `ق ذ ر`
- `قُذر`
- words split by unusual marks or invisible characters

Success criteria:

- create an adversarial Arabic lexicon test set
- detect obfuscated forms at high recall
- do not materially increase false positives on normal text

### 1C. Build a regression suite from known complaints

Create a dataset of:

- scripts/scenes where users said the system was wrong
- scripts/scenes where human auditors agreed with the system
- scripts/scenes with obfuscated profanity and borderline narrative context

This becomes the product truth set for future changes.

Success criteria:

- every major change must improve or preserve benchmark scores

## Phase 2: Better Explanations

Timeline:

- second sprint

Goal:

- every finding card should explain itself clearly enough that an auditor can follow the reasoning

### 2A. Replace free-form reasons with a structured rationale format

Each finding explanation should answer:

1. what exact text was detected
2. what atom/article it maps to
3. what the context means
4. why this is a violation instead of harmless context

Recommended output template:

- `Detected text: ...`
- `Policy mapping: Article X / Atom Y`
- `Context reading: ...`
- `Ruling reason: ...`

For Arabic UI, keep the same structure in Arabic.

### 2B. Generate reasons from richer local context

Instead of using only the short evidence snippet, include:

- sentence before
- sentence after
- speaker if known
- scene context if known
- whether the line is description or dialogue

### 2C. Add rationale quality checks

Reject or downgrade explanations that are:

- generic
- circular
- copied from the policy title only
- unsupported by the evidence

Success criteria:

- auditors rate the explanation as understandable and useful
- fewer comments like "AI flagged it but doesn’t know why"

## Phase 3: Atom Precision

Timeline:

- second to third sprint

Goal:

- tighten weak atoms until the model handles them like a trained specialist

### 3A. Build an atom playbook

For each problematic atom, document:

- plain-language definition
- what counts
- what does not count
- edge cases
- near-neighbor atoms it is often confused with
- positive examples
- negative examples

Priority should go to the atoms your team complains about most.

### 3B. Create atom-level benchmark tests

Measure each atom separately:

- precision
- recall
- top confusion pairs

This matters because total report accuracy can hide weak atom behavior.

### 3C. Add atom-specific prompts or confirmers

Do not rely on one generic pattern for all atoms.

For weak atoms:

- add dedicated instruction blocks
- or add lightweight confirmers only for those atoms

Success criteria:

- reduced atom confusion
- better agreement with senior auditors on difficult categories

## Phase 4: Story Understanding

Timeline:

- third sprint and beyond

Goal:

- move from "word spotting" to "narrative judgment"

### 4A. Add a script-level narrative pass

For borderline findings, the system should ask:

- is the act endorsed, condemned, or neutral?
- is the character rewarded or punished?
- is this a threat, a quote, sarcasm, fantasy, dream, or remembered event?
- is the scene warning against the behavior or promoting it?

### 4B. Add scene/page-level context modeling

The system should understand:

- dialogue vs description
- speaker role
- victim/perpetrator relationship
- whether harm is normalized or criticized

### 4C. Use narrative reasoning only where needed

Do not make every simple profanity case depend on whole-story reasoning.

Use narrative reasoning mainly for:

- borderline violence
- irony/satire
- quoted offensive material
- moral resolution cases
- culturally sensitive context-dependent atoms

Success criteria:

- fewer false positives on condemned behavior
- fewer misses on normalized harmful behavior

## Phase 5: Speed and Scale

Timeline:

- in parallel with phases 1-4

Goal:

- reduce wall-clock analysis time without lowering quality

### 5A. Fix the router or remove it

Current priority:

- if the router is not pruning real downstream work, it is pure overhead

### 5B. Add chunk concurrency

Safest rollout:

- start with low concurrency such as 2 chunks in parallel
- measure rate-limit behavior and total runtime
- scale gradually

### 5C. Cache job-level data

Cache:

- pages
- lexicon rows
- prompt-ready lexicon structures

### 5D. Gate expensive enrichments for large scripts

Optional for large jobs:

- deep auditor
- rationale-only enhancement
- words-to-revisit
- script summary

Possible UX strategy:

- fast primary result first
- enriched result second

### 5E. Add pass gating

Do not run all expensive passes on every chunk if cheap signals strongly suggest irrelevance.

Success criteria:

- large-script time drops materially
- quality benchmark does not regress

## Safe Rollout Plan

To improve the system without breaking it:

### Step 1. Build evaluation before changing defaults

Every change should be tested against:

- golden dataset
- complaint dataset
- large-script benchmark
- adversarial Arabic word variants set

### Step 2. Ship behind flags or shadow mode

For new components:

- run them in shadow
- compare old vs new results
- review disagreements with senior auditors

### Step 3. Promote only when metrics improve

Do not switch because a change "looks better".

Switch only when:

- consistency improves
- benchmark accuracy improves
- false positives do not spike
- runtime stays acceptable

## How To Prove AI Is Better Than a Human Auditor

This is the most important business point.

We should not try to prove:

- "AI is smarter than any human"

We should prove:

- "AI is better than standard manual review on measurable production tasks"

### The right benchmark

Compare AI and human auditors on:

- same scripts
- same policy standard
- same time budget

Measure:

- recall of true violations
- precision of flagged violations
- consistency across repeated reviews
- time to first report
- fatigue-sensitive error rate on long scripts

### Where AI should outperform

AI should be able to outperform a normal auditor in:

- consistency across runs
- no fatigue on long scripts
- recall on repeated/slightly varied bad patterns
- systematic checking of every page
- traceable justifications when structured correctly

### Where humans should still be used during rollout

Humans should remain the final control for:

- policy disputes
- edge-case cultural interpretation
- novel content types
- high-stakes regulator-facing escalation

### The message to stakeholders

The strongest message is:

- AI is not replacing judgment blindly
- AI is becoming a high-consistency, high-recall audit engine
- humans remain the supervisory layer until benchmarks prove otherwise

## Practical Priorities

If we want the highest impact with the lowest risk, the recommended order is:

### Priority 1

- deterministic scans
- Arabic obfuscation normalization
- golden benchmark set

### Priority 2

- structured finding rationales
- rationale quality checks
- atom playbook for weak atoms

### Priority 3

- router cleanup
- chunk concurrency
- cache repeated per-job data

### Priority 4

- narrative pass for borderline cases
- pass gating and two-stage detection

## Suggested First 30 Days

### Week 1

- freeze production determinism
- collect complaint cases
- define benchmark labels

### Week 2

- build Arabic normalization for detection
- add adversarial bad-word tests
- implement structured rationale format

### Week 3

- evaluate atom weaknesses
- create top-problem atom playbook
- add quality filters for generic explanations

### Week 4

- fix router overhead
- test 2x chunk concurrency
- measure large-script runtime before and after

## Final Position

If the team wants to regain confidence quickly, the fastest path is:

1. make results stable
2. catch obvious obfuscated abuse
3. explain every finding clearly
4. prove improvement on a benchmark

If the team wants to beat human auditors over time, the winning path is:

1. consistency
2. recall
3. narrative understanding on borderline cases
4. evidence-based rollout

That is how the system becomes stronger than a normal human auditor in practice, not by marketing claims, but by measurable audit performance.
