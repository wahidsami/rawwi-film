# Reasoning Contract Engine

This document describes the internal reasoning framework for Analysis Engine V3.

The framework is intentionally separate from the current V2 prompts.
It defines how reasoning is organized, not the legal wording itself.

## Why this exists

The goal is to give every future V3 subject a shared reasoning backbone so the prompt layer can stay thin:

- one context object
- one ordered reasoning pipeline
- one stage vocabulary
- one place to describe inputs and outputs

No legal rules are defined here yet.
No V2 prompt file is modified.
No runtime behavior changes.

## Stage Order

1. Narrative Understanding
2. Evidence Identification
3. Context Evaluation
4. Legal Evaluation
5. Exception Evaluation
6. Finding Construction
7. Reporting

## Stage Responsibilities

### Narrative Understanding

Purpose:

- Understand the story before judging
- Produce no findings

### Evidence Identification

Purpose:

- Locate candidate evidence inside the chunk
- Produce no legal judgment yet

### Context Evaluation

Purpose:

- Use Story Memory and local context to understand the meaning of the candidate evidence

### Legal Evaluation

Purpose:

- Apply the subject rules
- Do not generate JSON yet

### Exception Evaluation

Purpose:

- Apply exclusions such as:
  - historical quotation
  - educational discussion
  - condemnation
  - satire
  - documentary
  - neutral narration

### Finding Construction

Purpose:

- Construct the internal finding object
- Do not format JSON yet

### Reporting

Purpose:

- Generate rationale
- Generate confidence
- Generate offsets
- Generate evidence
- Generate JSON

## Shared Context

All stages read and enrich the same reasoning context object.

The context holds:

- Story Memory
- Chunk
- Glossary
- Subject
- Candidate Evidence
- Narrative Understanding
- Legal Decision
- Exceptions
- Finding

## Stage Metadata

Every stage exposes:

- `name`
- `description`
- `purpose`
- `inputs`
- `outputs`

This is for future diagnostics and for later prompt generation.

## Builder Model

The stage builder lets V3 assemble reasoning in sequence without hardcoding the full chain into prompt text.

The intended future shape is:

```text
Stage A
↓
Stage B
↓
Stage C
↓
...
```

The builder is currently a scaffold only.

## How prompts will use this later

Future V3 prompts will consume the reasoning contract by:

1. Selecting the active subject module.
2. Loading the shared reasoning stage sequence.
3. Feeding the live context object through the stage builder.
4. Rendering only the stage-relevant instructions into the subject prompt.
5. Leaving V2 prompts untouched.

## Current scope

This framework is architecture only.

It does not yet:

- rewrite legal rules
- replace subject prompts
- change OpenAI behavior
- change V2 runtime behavior
- generate new findings by itself

