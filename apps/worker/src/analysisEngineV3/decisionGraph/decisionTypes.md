# Decision Types

This file defines the node typing model for the decision graph.

## Evidence Node

Evidence nodes deal with literal spans, admissibility, and sufficiency.

Examples:

- Does literal evidence exist?
- Is evidence admissible?
- Is there sufficient evidence?

## Narrative Node

Narrative nodes deal with story interpretation, speaker identity, scene type, and literalness.

Examples:

- Who is speaking?
- Is the statement literal?
- Is it narrated?
- Is it documentary?
- Is it satire?
- Is it fiction?

## Context Node

Context nodes deal with interpretation using surrounding text and memory.

Examples:

- Is speaker identifiable?
- Is it condemnation?
- Is it endorsement?

## Legal Node

Legal nodes apply subject rules and determine whether the subject module governs the case.

Examples:

- Does the legal module apply?
- Does the subject rule apply?

## Exception Node

Exception nodes evaluate whether a generic exception overrides an otherwise plausible legal signal.

Examples:

- Is it educational?
- Is it historical?
- Is it quotation?
- Does an exception apply?

## Reporting Node

Reporting nodes determine whether the case becomes a finding, needs review, or rejection, and then render the output structure.

Examples:

- Produce finding?
- Needs review?
- Reject?

