# Semantic Decision Graph

This file defines the semantic reasoning path.

The semantic graph sits between evidence identification and legal evaluation.

## Flow

```text
Literal Evidence
  ↓
Is the sentence complete enough to interpret?
  ↓
Who is speaking?
  ↓
Who is being addressed?
  ↓
Who is being described?
  ↓
Is the sentence dialogue?
  ↓
Is it narration?
  ↓
Is it scene description?
  ↓
Is it dream?
  ↓
Is it flashback?
  ↓
Is it satire?
  ↓
Is it comedy?
  ↓
Is it training?
  ↓
Is it historical quotation?
  ↓
Is it news?
  ↓
Is it educational?
  ↓
Is it instruction?
  ↓
Is it threat?
  ↓
Is it warning?
  ↓
Is it joke?
  ↓
Is it sarcasm?
  ↓
Is it irony?
  ↓
What is the narrative intent?
  ↓
What is the risk context?
  ↓
Semantic Meaning
```

## Node ordering

The semantic graph is ordered from form to meaning:

1. Evidence presence
2. Speaker and listener identification
3. Narrative mode
4. Context reversal checks
5. Narrative intent
6. Risk context
7. Semantic meaning output

## Mermaid diagram

```mermaid
flowchart TD
  A[Literal Evidence] --> B{Enough to interpret?}
  B -->|No| X[Ambiguous]
  B -->|Yes| C[Who is speaking?]
  C --> D[Who is being addressed?]
  D --> E[Who is being described?]
  E --> F{Dialogue / Narration / Description?}
  F --> G{Dream / Flashback / Satire / Comedy?}
  G --> H{Historical / News / Educational / Instruction?}
  H --> I{Threat / Warning / Joke / Sarcasm / Irony?}
  I --> J[Infer Narrative Intent]
  J --> K[Assign Risk Context]
  K --> L[Emit Semantic Meaning]
```

## State diagram

```mermaid
stateDiagram-v2
  [*] --> Unresolved
  Unresolved --> EvidenceLocated
  EvidenceLocated --> SpeakerHypothesized
  SpeakerHypothesized --> ListenerHypothesized
  ListenerHypothesized --> TargetHypothesized
  TargetHypothesized --> ModeIdentified
  ModeIdentified --> IntentInterpreted
  IntentInterpreted --> ContextIntegrated
  ContextIntegrated --> RiskAssigned
  RiskAssigned --> SemanticallyStable
  RiskAssigned --> Ambiguous
  Ambiguous --> ReadyForLegalEvaluation
  SemanticallyStable --> ReadyForLegalEvaluation
```

