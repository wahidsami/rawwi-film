# Edge Catalog

This file defines how nodes may connect.

The graph is constrained by node type and by required execution order.

## 1. Allowed node-to-node connections

- Evidence Node -> Narrative Node
- Narrative Node -> Context Node
- Context Node -> Legal Node
- Legal Node -> Exception Node
- Exception Node -> Reporting Node

Additional allowed transitions:

- Evidence Node -> Evidence Node, when refining candidate spans
- Narrative Node -> Narrative Node, when refining speaker or scene understanding
- Context Node -> Context Node, when refining local meaning
- Legal Node -> Legal Node, when evaluating sub-rules within the same subject module
- Exception Node -> Exception Node, when testing nested exception logic
- Reporting Node -> Reporting Node, when formatting output fields

## 2. Disallowed node-to-node connections

- Evidence Node -> Reporting Node
- Narrative Node -> Reporting Node
- Context Node -> Reporting Node
- Reporting Node -> Legal Node
- Reporting Node -> Evidence Node
- Reporting Node -> Narrative Node
- Reporting Node -> Context Node
- Reporting Node -> Exception Node
- Legal Node -> Evidence Node
- Exception Node -> Evidence Node

## 3. Required execution order

1. Evidence before Narrative
2. Narrative before Context
3. Context before Legal
4. Legal before Exception
5. Exception before Reporting

## 4. Forbidden execution order

- Reporting before Legal
- Legal before Narrative
- Exception before Context
- Context before Evidence
- Narrative after Reporting

## 5. Edge semantics

An edge means:

- the downstream node may read the upstream node’s outputs
- the downstream node may enrich the shared context
- the downstream node may not erase admissible upstream evidence

## 6. Edge rules

- Evidence edges may narrow spans but may not invent spans.
- Narrative edges may refine interpretation but may not produce a legal decision.
- Context edges may explain meaning but may not classify.
- Legal edges may classify but may not serialize.
- Exception edges may suppress a candidate but may not create a new violation.
- Reporting edges may format only.

