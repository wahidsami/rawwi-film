# Node Catalog

This file defines the node catalog for the V3 decision graph.

Each node describes a decision point, its role, its inputs, its outputs, the branch choices available, the exit conditions, and the nodes that may follow.

## Node Types

- Evidence Node
- Narrative Node
- Context Node
- Legal Node
- Exception Node
- Reporting Node

## 1. Does literal evidence exist?

- Type: Evidence Node
- Purpose: Determine whether there is a literal span in the chunk that can be evaluated.
- Inputs: chunk text, local offsets, candidate spans
- Outputs: evidence present or absent
- Possible branches: yes, no
- Exit conditions: no literal evidence, no further evaluation
- Downstream nodes: Is evidence admissible?

## 2. Is evidence admissible?

- Type: Evidence Node
- Purpose: Determine whether the candidate span is allowed to participate in reasoning.
- Inputs: chunk text, candidate span, evidence boundaries
- Outputs: admissible, inadmissible, borderline
- Possible branches: admissible, inadmissible, borderline
- Exit conditions: inadmissible evidence
- Downstream nodes: Who is speaking?

## 3. Who is speaking?

- Type: Narrative Node
- Purpose: Identify the apparent speaker when the chunk supports it.
- Inputs: chunk text, dialogue markers, scene structure
- Outputs: speaker hypothesis
- Possible branches: explicit, implied, narrator, unknown
- Exit conditions: speaker cannot be resolved and the subject requires a speaker
- Downstream nodes: Is speaker identifiable?

## 4. Is speaker identifiable?

- Type: Narrative Node
- Purpose: Determine whether the speaker hypothesis is strong enough to support later interpretation.
- Inputs: speaker hypothesis, narrative context
- Outputs: identifiable, not identifiable, partially identifiable
- Possible branches: yes, no, partial
- Exit conditions: no usable speaker identity and the subject depends on it
- Downstream nodes: Is the statement literal?

## 5. Is the statement literal?

- Type: Narrative Node
- Purpose: Determine whether the text is a direct literal statement or something else.
- Inputs: chunk text, narrative mode
- Outputs: literal, figurative, ambiguous
- Possible branches: literal, non-literal, ambiguous
- Exit conditions: non-literal content with no exception path
- Downstream nodes: Is it quoted?

## 6. Is it quoted?

- Type: Narrative Node
- Purpose: Determine whether the relevant span is quotation.
- Inputs: chunk text, speaker, target, punctuation, quotation markers
- Outputs: quoted, not quoted, unclear
- Possible branches: quoted, not quoted, unclear
- Exit conditions: quotation that is protected by an exception
- Downstream nodes: Is it narrated?

## 7. Is it narrated?

- Type: Narrative Node
- Purpose: Determine whether the relevant span is narration rather than direct speech.
- Inputs: chunk text, narrative voice, scene structure
- Outputs: narrated, not narrated, unclear
- Possible branches: narrated, not narrated, unclear
- Exit conditions: narrated content may need contextual handling before legal evaluation
- Downstream nodes: Is it documentary?

## 8. Is it documentary?

- Type: Narrative Node
- Purpose: Determine whether the content is framed as documentary or documentary-like.
- Inputs: narrative voice, story position, evidence language
- Outputs: documentary, not documentary, unclear
- Possible branches: documentary, not documentary, unclear
- Exit conditions: documentary framing may trigger an exception path
- Downstream nodes: Is it educational?

## 9. Is it educational?

- Type: Narrative Node
- Purpose: Determine whether the content is instructional or explanatory.
- Inputs: chunk text, narrative intent, context
- Outputs: educational, not educational, unclear
- Possible branches: educational, not educational, unclear
- Exit conditions: educational exception may apply
- Downstream nodes: Is it satire?

## 10. Is it satire?

- Type: Narrative Node
- Purpose: Determine whether the content is satirical or parodic.
- Inputs: tone, intent, context
- Outputs: satire, not satire, unclear
- Possible branches: satire, not satire, unclear
- Exit conditions: satire exception may apply
- Downstream nodes: Is it fiction?

## 11. Is it fiction?

- Type: Narrative Node
- Purpose: Determine whether the content is explicitly fictional or nested fiction.
- Inputs: story frame, scene type, context
- Outputs: fiction, not fiction, unclear
- Possible branches: fiction, not fiction, unclear
- Exit conditions: fiction exception may apply
- Downstream nodes: Is it condemnation?

## 12. Is it condemnation?

- Type: Context Node
- Purpose: Determine whether the text is condemning the referenced content.
- Inputs: narrative intent, surrounding context, tone
- Outputs: condemnation, not condemnation, unclear
- Possible branches: yes, no, unclear
- Exit conditions: condemnation may neutralize a candidate
- Downstream nodes: Is it endorsement?

## 13. Is it endorsement?

- Type: Context Node
- Purpose: Determine whether the text is endorsing the referenced content.
- Inputs: narrative intent, tone, local context
- Outputs: endorsement, not endorsement, unclear
- Possible branches: yes, no, unclear
- Exit conditions: endorsement may strengthen a candidate
- Downstream nodes: Is there sufficient evidence?

## 14. Is there sufficient evidence?

- Type: Evidence Node
- Purpose: Determine whether the available literal evidence is enough for a decision.
- Inputs: evidence quality, evidence boundaries, context
- Outputs: sufficient, insufficient, borderline
- Possible branches: sufficient, insufficient, borderline
- Exit conditions: insufficient evidence
- Downstream nodes: Does the legal module apply?

## 15. Does the legal module apply?

- Type: Legal Node
- Purpose: Determine whether the active subject module governs this evidence.
- Inputs: subject scope, evidence, narrative context
- Outputs: applies, does not apply, uncertain
- Possible branches: yes, no, uncertain
- Exit conditions: subject mismatch
- Downstream nodes: Does an exception apply?

## 16. Does an exception apply?

- Type: Exception Node
- Purpose: Determine whether a generic exception prevents classification.
- Inputs: evidence, narrative model, context model, legal decision candidate
- Outputs: exception applies, no exception, borderline
- Possible branches: yes, no, borderline
- Exit conditions: exception applies, borderline exception
- Downstream nodes: Produce finding?, Needs review?, Reject?

## 17. Produce finding?

- Type: Reporting Node
- Purpose: Decide whether the case should become a reportable finding.
- Inputs: legal decision, exceptions, evidence, context
- Outputs: finding eligible, not eligible
- Possible branches: yes, no
- Exit conditions: no finding eligibility
- Downstream nodes: Reporting

## 18. Needs review?

- Type: Reporting Node
- Purpose: Determine whether the case should be marked for manual review.
- Inputs: evidence, context, legal decision, exception uncertainty
- Outputs: needs review, no review
- Possible branches: yes, no
- Exit conditions: manual review route or reject route
- Downstream nodes: Reporting or Reject

## 19. Reject?

- Type: Reporting Node
- Purpose: Terminate the path without a finding.
- Inputs: any upstream rejection signal
- Outputs: rejection
- Possible branches: terminal
- Exit conditions: terminal
- Downstream nodes: none

