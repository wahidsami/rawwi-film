# Analysis Engine V3 Reasoning Contract Engine Specification

This document defines how Analysis Engine V3 reasons.

It is intentionally implementation-independent.
It describes the internal reasoning model, not prompt text, not runtime behavior, and not the mechanics of any specific AI provider.

The purpose is to give future V3 prompts, subject modules, and providers one shared constitutional standard.

## Part 1. Design Philosophy

### 1.1 Why V3 exists

Analysis Engine V3 exists to separate reasoning structure from prompt wording.

Pipeline V2 already carries the production workload and remains the runtime baseline.
However, V2 reasoning is still too coupled to prompt composition, subject phrasing, and provider-specific behavior.

V3 introduces a reasoning layer that defines:

- how the system thinks
- what each reasoning stage is responsible for
- what kinds of inputs each stage may use
- what kinds of outputs each stage may produce
- what must never be inferred or invented

This is not a pipeline rewrite.
It is a reasoning architecture upgrade.

### 1.2 What problem V3 solves

V2 can analyze content, but its reasoning responsibilities are distributed across prompt files and runtime assembly.
That makes it harder to:

- compare subjects consistently
- add new legal domains without prompt drift
- keep evidence rules stable across providers
- separate narrative interpretation from legal classification
- formalize exception handling
- benchmark reasoning quality independently of prompt wording

V3 solves this by introducing a shared reasoning contract that every subject must inherit.

### 1.3 Prompt Engineering vs Reasoning Engineering

Prompt Engineering is about how instructions are phrased for a model.

Reasoning Engineering is about the underlying intellectual process that the system must follow regardless of phrasing.

Prompt Engineering answers:

- what should we ask the model to do?
- how should we word the instruction?
- what order should the text appear in?

Reasoning Engineering answers:

- what must the system understand before it can judge?
- what counts as evidence?
- when is context admissible?
- when does a legal rule apply?
- when should the system abstain?
- how should a finding be formed?

### 1.4 Pipeline remains V2

The production pipeline remains V2.

That means:

- existing execution flow remains intact
- existing diagnostics remain intact
- existing Memory2 behavior remains intact
- existing lineage behavior remains intact
- existing prompt files remain intact

### 1.5 Reasoning becomes V3

V3 is the reasoning layer that future prompts will use.

The reasoning contract is a new layer above the runtime, not a replacement for the runtime.

The model may change.
The prompt wording may change.
The provider may change.

The reasoning contract must remain stable.

## Part 2. Core Principles

The following principles are normative.

### 2.1 Narrative before legality

The system must first understand what is happening in the narrative before it applies any legal rule.

### 2.2 Evidence before interpretation

The system must first identify literal evidence before it interprets that evidence.

### 2.3 Story Memory explains evidence

Story Memory may explain how a chunk should be understood in the larger narrative.

### 2.4 Story Memory never becomes evidence

Story Memory is contextual support only.
It may not serve as the sole basis for a finding.

### 2.5 Glossary provides knowledge

The glossary is a knowledge layer.
It helps interpret terms, variants, and lexical anchors.

### 2.6 Glossary never classifies

The glossary may not independently classify content as a violation.

### 2.7 Legal reasoning happens after narrative understanding

Legal evaluation must happen after the narrative has been understood and candidate evidence has been identified.

### 2.8 Reporting never changes findings

Reporting is a transformation stage, not a reasoning stage.
It may format, summarize, or serialize a finding.
It may not alter the legal decision.

### 2.9 Never invent facts

The reasoning engine must not invent speakers, actions, targets, scenes, or causal relations that are not supported by the admissible inputs.

### 2.10 Never infer missing evidence

If a claim lacks literal support in the admissible chunk, the system must not infer it into existence.

### 2.11 Local chunk is the only admissible evidence source

The local chunk is the only admissible source of evidence.

Story Memory, Scene Memory, and Glossary may support interpretation, but they may not substitute for chunk-level evidence.

### 2.12 Context may explain evidence but may not replace evidence

Context may clarify meaning, speaker role, scene tone, or narrative intent.
It may not create evidentiary support where none exists.

### 2.13 Legal modules define legal rules

Legal subject modules define the applicable legal rules for a subject.

### 2.14 The reasoning engine defines thinking

The reasoning engine defines the internal thought process shared by all subjects.

## Part 3. Complete Stage Specification

The reasoning engine is organized into ordered stages.

Every stage must declare:

- Purpose
- Responsibilities
- Allowed inputs
- Forbidden inputs
- Outputs
- Success criteria
- Failure conditions

### 3.1 Narrative Understanding

Purpose:

- Establish the story frame before judging anything.

Responsibilities:

- Determine what is happening in the chunk.
- Identify the local narrative mode.
- Identify whether the content is dialogue, narration, scene description, news, documentary, dream, flashback, satire, or another narrative form.
- Establish the likely tone and local stance.

Allowed inputs:

- Chunk text
- Story Memory
- Scene Memory
- Neighboring sentences

Forbidden inputs:

- Legal rule conclusions
- Final finding decisions
- Provider-specific formatting rules
- Output serialization requirements

Outputs:

- Narrative understanding object
- Scene interpretation notes
- Speaker hypotheses
- Tone hypotheses

Success criteria:

- The stage can explain the local narrative situation without legal language.

Failure conditions:

- The stage confuses narrative description with violation determination.
- The stage invents unsupported scene facts.

### 3.2 Evidence Identification

Purpose:

- Locate candidate evidence inside the chunk.

Responsibilities:

- Detect literal spans that may matter later.
- Mark candidate spans without legal judgment.
- Preserve exact boundaries as much as possible.

Allowed inputs:

- Chunk text
- Narrative understanding
- Subject scope

Forbidden inputs:

- Final legal conclusions
- Exception logic
- Reporting logic
- JSON formatting logic

Outputs:

- Candidate evidence set
- Evidence boundaries
- Initial evidence quality assessment

Success criteria:

- The stage identifies spans that are textually present in the chunk.

Failure conditions:

- The stage outputs evidence not present in the chunk.
- The stage emits a legal verdict.

### 3.3 Context Evaluation

Purpose:

- Use Story Memory and local context to understand candidate evidence.

Responsibilities:

- Read the candidate evidence in the surrounding narrative.
- Determine whether the candidate is literal, quoted, narrated, mocked, condemned, neutral, or contextual.
- Use narrative signals to refine meaning.

Allowed inputs:

- Story Memory
- Scene Memory
- Chunk text
- Candidate evidence
- Narrative understanding

Forbidden inputs:

- Final legal classification
- Reporting serialization
- Subject-specific legal rules as final conclusions

Outputs:

- Context evaluation result
- Narrative polarity
- Contextual explanation

Success criteria:

- The stage explains the candidate evidence in context without making a legal conclusion.

Failure conditions:

- The stage treats memory as evidence.
- The stage collapses context into a legal result too early.

### 3.4 Legal Evaluation

Purpose:

- Apply the active subject rules to the candidate evidence.

Responsibilities:

- Determine whether the evidence satisfies the subject’s legal rule set.
- Separate direct violations from ambiguous cases.
- Hold back judgment when required.

Allowed inputs:

- Candidate evidence
- Context evaluation
- Subject module
- Glossary

Forbidden inputs:

- Reporting serialization
- Output formatting details
- Narrative assumptions not supported by context

Outputs:

- Legal decision
- Preliminary classification
- Decision rationale

Success criteria:

- The stage produces a legal decision grounded in the evidence and subject module.

Failure conditions:

- The stage makes a decision without evidence.
- The stage invents a subject rule that is not part of the subject module.

### 3.5 Exception Evaluation

Purpose:

- Apply exclusions before a finding is finalized.

Responsibilities:

- Determine whether the case falls into a recognized exception.
- Protect against false positives when the text is quotation, educational, historical, satirical, documentary, or otherwise non-literal in the relevant way.

Allowed inputs:

- Legal decision
- Context evaluation
- Candidate evidence
- Subject module

Forbidden inputs:

- Output serialization
- Post hoc reporting reshaping

Outputs:

- Exception set
- Exception rationale
- Final eligibility status

Success criteria:

- The stage correctly identifies when a candidate should not become a finding.

Failure conditions:

- The stage ignores a valid exception.
- The stage invents an exception not supported by the context.

### 3.6 Finding Construction

Purpose:

- Construct the internal finding object if the case survives legal and exception review.

Responsibilities:

- Assemble the finding fields.
- Attach evidence boundaries.
- Attach context-derived rationale inputs.
- Preserve legal decision identity.

Allowed inputs:

- Candidate evidence
- Legal decision
- Exception results
- Context evaluation

Forbidden inputs:

- Final report formatting rules
- JSON schema concerns
- Reinterpretation of the legal outcome

Outputs:

- Internal finding object

Success criteria:

- The internal finding is complete enough to be reported without changing its legal meaning.

Failure conditions:

- The stage changes the legal outcome while assembling the finding.

### 3.7 Reporting

Purpose:

- Generate rationale and report-ready output.

Responsibilities:

- Produce rationale text.
- Produce confidence.
- Produce offsets.
- Produce evidence snippet.
- Serialize the final JSON structure.

Allowed inputs:

- Internal finding
- Candidate evidence
- Context evaluation
- Legal decision
- Exception results

Forbidden inputs:

- New legal reasoning
- New evidence discovery
- New exception discovery

Outputs:

- Report-ready JSON
- Rationale text
- Confidence score
- Offset payload

Success criteria:

- The output faithfully represents earlier stages without changing them.

Failure conditions:

- Reporting changes the finding meaning.
- Reporting retroactively invents a rationale or evidence span.

## Part 4. Narrative Model

The narrative model is the system’s internal representation of what the text is doing before legal classification.

It may include the following fields.

### 4.1 Speaker

The apparent speaking source of the text segment.

Possible values:

- explicit character
- implied character
- narrator
- quoted speaker
- unknown

### 4.2 Target

The person, group, institution, or concept being addressed or described.

Possible values:

- explicit target
- implied target
- self-directed
- group-directed
- unknown

### 4.3 Narrative Voice

The mode in which the text is delivered.

Examples:

- first-person narration
- third-person narration
- dialogue
- quoted speech
- journalistic voice
- documentary voice
- satirical voice

### 4.4 Scene Type

The structural kind of the scene.

Examples:

- dialogue scene
- action scene
- description scene
- documentary segment
- flashback
- dream
- news report
- instruction

### 4.5 Narrative Intent

The apparent function of the text within the story.

Possible values:

- endorsement
- condemnation
- neutral description
- instruction
- exposition
- satire
- parody
- uncertainty

### 4.6 Story Position

Where the text sits in the narrative.

Examples:

- setup
- escalation
- payoff
- aftermath
- aside
- digression
- opening
- closing

### 4.7 Relationship

The inferred relationship between speaker and target when supported by the text.

Possible values:

- family
- authority
- peer
- enemy
- colleague
- stranger
- institution-to-individual
- individual-to-group
- unknown

### 4.8 Emotional Tone

The emotional coloring of the text.

Examples:

- hostile
- affectionate
- fearful
- comedic
- sarcastic
- neutral
- ironic
- mournful

### 4.9 Condemnation

Whether the text is condemning the content it mentions.

Possible values:

- yes
- no
- ambiguous

### 4.10 Approval

Whether the text is endorsing the content it mentions.

Possible values:

- yes
- no
- ambiguous

### 4.11 Neutrality

Whether the text is merely mentioning content without endorsing or condemning it.

Possible values:

- yes
- no
- ambiguous

### 4.12 Historical Context

Whether the content is framed as historical reference rather than present-tense assertion.

### 4.13 Dream

Whether the scene is a dream or dreamlike construct.

### 4.14 Flashback

Whether the scene is a recollected past event.

### 4.15 Comedy

Whether the scene uses comedy as its primary mode.

### 4.16 Satire

Whether the scene uses satire or parody.

### 4.17 Threat

Whether the narrative contains a threat or threat-like utterance.

### 4.18 Instruction

Whether the text is instructive or directive.

### 4.19 News

Whether the text is written or spoken in a news-like register.

### 4.20 Documentary

Whether the text is documentary or documentary-like.

### 4.21 Dialogue

Whether the evidence is delivered as dialogue.

### 4.22 Narration

Whether the evidence is narrated rather than spoken.

### 4.23 Scene Description

Whether the evidence describes the scene instead of advancing dialogue.

## Part 5. Evidence Model

Evidence is the textual basis for judgment.

### 5.1 Candidate Evidence

Candidate evidence is a literal span of chunk text that may support a finding.

### 5.2 Evidence Quality

Evidence quality is the measure of whether a candidate span is:

- literal
- specific
- complete enough
- contextually meaningful
- legally relevant

### 5.3 Evidence Boundaries

Evidence boundaries are the exact start and end positions of the admissible span.

Boundaries must be:

- inside the local chunk
- textually present
- as narrow as possible while remaining intelligible

### 5.4 Minimum Evidence

The minimum evidence is the smallest literal span that still proves the relevant point.

### 5.5 Maximum Evidence

The maximum evidence is the largest span permitted before the evidence becomes diluted or over-broad.

The default bias is toward smaller spans.

### 5.6 Evidence Granularity

Evidence granularity determines whether the system prefers:

- a single word
- a phrase
- a sentence
- a short exchange

The preferred granularity is the smallest span that remains evidentially complete.

### 5.7 Evidence Source

Evidence source must be the chunk itself.

Non-evidence sources:

- Story Memory
- Scene Memory
- Glossary
- subject rules
- provider commentary

### 5.8 Evidence Confidence

Evidence confidence is how strongly the span supports the later legal decision.

### 5.9 Admissibility

An evidence span is admissible if:

- it exists in the chunk
- it is relevant to the subject
- it is not purely invented through context
- it is not only inferred from memory

## Part 6. Context Model

Context helps interpret evidence without replacing it.

### 6.1 Story Memory

Story Memory is long-range narrative memory.

It may include:

- script synopsis
- recurring speakers
- recurring relationships
- long-range story trends

### 6.2 Scene Memory

Scene Memory is local scene-level continuity.

It may include:

- scene heading
- neighboring scene
- scene preview
- same-scene text before and after the chunk

### 6.3 Local Context

Local Context is the immediate text around the candidate evidence inside the chunk.

### 6.4 Chunk Context

Chunk Context is the full chunk itself and its immediate structural metadata.

### 6.5 Neighboring Sentences

Neighboring sentences are the sentence before and after the candidate evidence when available.

### 6.6 Narrative Context

Narrative Context is the combined interpretive frame assembled from Story Memory, Scene Memory, Local Context, and Chunk Context.

### 6.7 Priority Ordering

The priority between context sources is:

1. Chunk text
2. Local context
3. Scene memory
4. Story memory
5. Glossary

This ordering means the chunk is always primary.

## Part 7. Legal Decision Model

The legal decision model defines how a candidate becomes a legal outcome.

No subject-specific rules are defined here.

### 7.1 Decision Tree

1. Is there admissible evidence?
2. Does the context support a relevant interpretation?
3. Does the subject module define a rule that applies?
4. Does any exception apply?
5. Should the case become a finding, a needs-review item, or a rejection?

### 7.2 Decision Gates

The legal decision must pass through gates:

- evidence gate
- context gate
- subject gate
- exception gate
- confidence gate

### 7.3 Acceptance Conditions

Accept when:

- evidence is admissible
- subject rule applies
- no exception invalidates the finding
- the decision is supported by the context

### 7.4 Rejection Conditions

Reject when:

- there is no admissible evidence
- the evidence is outside the chunk
- the rule does not apply
- an exception nullifies the case
- the inference relies on invention

### 7.5 Needs Review Conditions

Use needs review when:

- the evidence is real but borderline
- the context is ambiguous
- the rule applies partially
- the exception analysis is uncertain

### 7.6 False Positive Rules

The system must avoid turning:

- quotation into endorsement
- documentary mention into present-tense assertion
- condemnation into approval
- narration into allegation
- ambiguous language into a definitive violation

### 7.7 False Negative Protection

The system must not overcorrect by suppressing clear evidence simply because the surrounding context is stylistically complex.

## Part 8. Exception Framework

The exception framework is generic and subject-agnostic.

It exists to prevent overclassification.

### 8.1 Educational

Content is educational when it is presented for instruction, explanation, or teaching rather than endorsement.

### 8.2 Historical

Content is historical when it refers to past events as historical record rather than present assertion.

### 8.3 Satire

Content is satirical when it uses irony, exaggeration, or parody to produce meaning.

### 8.4 Condemnation

Content is condemnatory when it mentions harmful content to reject it.

### 8.5 Neutral Reporting

Content is neutral reporting when it states facts without endorsement.

### 8.6 Documentary

Content is documentary when it is framed as documentary narration or documentary exposition.

### 8.7 Quotation

Content is quotation when the relevant span is quoted speech or quoted text rather than original assertion.

### 8.8 Fiction Inside Fiction

Content is fiction inside fiction when the material is nested within an explicitly fictional structure.

### 8.9 Dream

Content is dream when the scene is dreamlike or explicitly a dream.

### 8.10 Flashback

Content is flashback when the scene refers to a remembered or previously lived event.

## Part 9. Reporting Model

Reporting turns the internal finding into the final output.

### 9.1 Finding Construction

The report must reflect the legal decision already made by the reasoning engine.

### 9.2 Rationale Production

Rationale should explain:

- where the evidence appears
- what the evidence means
- why the legal outcome follows

Rationale must not invent facts.

### 9.3 Offset Selection

Offsets must be chosen from the literal chunk span that supports the finding.

### 9.4 Confidence Assignment

Confidence must reflect:

- strength of evidence
- strength of context
- strength of legal fit
- exception uncertainty

### 9.5 JSON Generation

JSON is a reporting format, not a reasoning stage.

The shape of JSON may evolve, but the underlying legal decision must remain stable.

### 9.6 Reporting Boundary

Reporting never changes legal decisions.

It can only express them.

## Part 10. Glossary V2 Philosophy

The glossary is a knowledge layer.

It is not a classifier.
It is not a judge.
It is not a legal module.

### 10.1 Glossary responsibilities

The glossary may:

- explain term variants
- enrich candidate selection
- provide lexical anchors
- inform narrative interpretation

### 10.2 Glossary prohibitions

The glossary may not:

- override context
- create findings
- force legal classification
- replace subject rules
- replace chunk evidence

### 10.3 Glossary in reasoning

The glossary is an input to reasoning.
It is never the final decision.

## Part 11. Subject Module Contract

Every future legal subject module must define a contract.

### 11.1 Purpose

What legal domain the module covers.

### 11.2 Scope

What content the module includes and excludes.

### 11.3 Applicable Rules

The specific legal rules or policy triggers for the subject.

### 11.4 Exclusions

What must not be classified under this subject.

### 11.5 Required Evidence

What kind of evidence is required for the subject to produce a finding.

### 11.6 Decision Tree

The subject’s ordered decision logic.

### 11.7 Examples

Positive examples that should be classified by the subject.

### 11.8 Non-examples

Examples that must not be classified by the subject.

### 11.9 Contract rule

Subject modules define legal rules only.

They do not define the shared reasoning architecture.

## Part 12. Future Extensibility

The reasoning architecture must allow future growth.

### 12.1 Adding new legal subjects

To add a subject:

1. define the subject contract
2. map the subject to the reasoning stages
3. attach subject-specific legal rules
4. keep the shared reasoning contract unchanged unless a genuinely new stage is required

### 12.2 Adding new AI providers

New providers may be plugged into the same reasoning contract.

The contract must be model-independent so that the same thinking process can run on different providers.

### 12.3 Adding new reasoning stages

New stages may be added when the reasoning process truly requires them.

The stage builder must support ordered insertion without hardcoding the entire chain into prompt text.

## Part 13. AI Independence

The reasoning engine belongs to Raawi.

GPT executes it.
Gemini executes it.
Claude executes it.
GPT OSS executes it.

The reasoning contract must never depend on a single model family.

The system must treat the model as an executor of the contract, not the owner of the contract.

## Part 14. Success Metrics

The reasoning engine should be evaluated using measurable criteria.

### 14.1 Repeatability

Repeated analyses of the same script version should produce the same reasoning outcome when all controlled inputs are unchanged.

### 14.2 Consistency

The same reasoning rule should behave the same way across subjects and across runs.

### 14.3 Precision

The system should avoid false positives.

### 14.4 Recall

The system should avoid missing real violations.

### 14.5 Context Awareness

The system should recognize when context changes meaning.

### 14.6 Explainability

The system should be able to explain why it reached a conclusion.

### 14.7 False Positive Rate

The system should keep false positives below an operational threshold.

### 14.8 False Negative Rate

The system should keep false negatives below an operational threshold.

### 14.9 Determinism

The system should behave deterministically under controlled inputs as much as the provider allows.

## Part 15. Future Roadmap

The current roadmap for V3 reasoning is expected to include:

### 15.1 Glossary V2

Formal lexical knowledge without classification authority.

### 15.2 Context Intelligence

Richer scene, story, and narrative interpretation.

### 15.3 AI Benchmarking

Systematic comparison of providers and configurations under the same reasoning contract.

### 15.4 Consensus Layer

Optional future agreement logic across multiple executors or reasoning passes.

## Final Statement

This specification defines the reasoning constitution of Analysis Engine V3.

It is designed so that an experienced AI engineer can implement the future V3 reasoning stack without needing to inspect the existing runtime codebase.

