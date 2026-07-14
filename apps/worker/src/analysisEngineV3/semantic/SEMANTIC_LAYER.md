# Semantic Interpretation Layer

The Semantic Interpretation Layer (SIL) is the reasoning layer that sits between evidence identification and legal evaluation.

Its job is to answer:

- what does this sentence actually mean?
- who is speaking?
- who is being addressed or described?
- what is the narrative role of the text?
- what contextual signals change interpretation?

SIL does not decide legality.
SIL explains meaning.

## Purpose

The semantic layer converts literal evidence into semantic meaning before any legal judgment occurs.

It exists because legal evaluation is not the first question.
The first question is meaning.

## Relationship to Other Layers

### Relationship to Story Memory

Story Memory may inform semantic interpretation by providing long-range narrative context.
Story Memory remains context, not evidence.

### Relationship to the Decision Graph

The decision graph defines the ordering of reasoning.
SIL occupies the region after evidence identification and before legal evaluation.

### Relationship to the Reasoning Contract

The reasoning contract defines the shared stages of V3.
SIL is the semantic specialization inside that contract.

## Core Requirement

The semantic layer must produce semantic meaning, not legal classification.

It must explain:

- speaker
- listener
- target
- victim
- narrative intent
- scene role
- emotion
- risk context
- confidence

It must not answer:

- is this illegal?
- does this violate a subject rule?
- should this become a finding?

## Example reasoning questions

- Who is speaking?
- Who is being addressed?
- Who is being described?
- Is the sentence dialogue?
- Is it narration?
- Is it scene description?
- Is it dream?
- Is it flashback?
- Is it satire?
- Is it comedy?
- Is it training?
- Is it historical quotation?
- Is it news?
- Is it educational?
- Is it instruction?
- Is it threat?
- Is it warning?
- Is it joke?
- Is it sarcasm?
- Is it irony?
- Is it story exposition?
- Is it character development?
- Is it villain dialogue?
- Is it hero dialogue?
- Is it victim dialogue?
- Is it police report?
- Is it court testimony?
- Is it television report?
- Is it social media quote?
- Is it religious quotation?
- Is it historical quotation?
- Is it narrative exposition?

## Output

The semantic layer should produce:

- Semantic Meaning
- Narrative Intent
- Conversation Role
- Scene Role
- Target
- Victim
- Speaker
- Listener
- Emotion
- Risk Context
- Confidence

## Important rule

The semantic layer must never decide legality.

It only explains meaning.

