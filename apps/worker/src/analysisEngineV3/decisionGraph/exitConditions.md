# Exit Conditions

This file defines global exit conditions for the V3 decision graph.

An exit condition is a reason for the graph to stop moving deeper into reasoning.

## 1. No evidence

Exit when no literal evidence exists in the chunk.

## 2. Evidence outside chunk

Exit when the candidate evidence is not inside the admissible chunk boundaries.

## 3. Exception applies

Exit when a valid exception neutralizes the candidate.

## 4. Subject mismatch

Exit when the current subject module does not govern the candidate evidence.

## 5. Insufficient confidence

Exit when the decision cannot meet the required confidence floor.

## 6. Ambiguous context

Exit when context is too unclear to support a stable legal decision.

## 7. Produce finding

Exit with a finding when evidence, context, legal fit, and exception checks all pass.

## 8. Needs review

Exit with a review item when the case is real but borderline.

## 9. Reject

Exit with rejection when the case does not satisfy the reasoning contract.

