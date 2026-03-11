# Phase 0 Policy Workshop Spec

## Objective
Freeze a regulator-grade policy contract for the new Hybrid V3 analyzer before enabling strict enforcement.

## Pillar Model (Top-Level)
1. **P1 FaithAndSocialValues**  
   Content that conflicts with Islamic values, public decency, and core Saudi social norms.
2. **P2 CriminalAndProhibitedActs**  
   Crime, substances, exploitation, and prohibited acts depiction/promotion.
3. **P3 PublicOrderAndSafety**  
   Public order, safety, civil behavior, and social stability risks.
4. **P4 AuthorityAndGovernanceIntegrity**  
   Harmful portrayal/incitement against state institutions, governance legitimacy, and national cohesion.
5. **P5 MoralOutcomeAndNarrativeResponsibility**  
   Whether narrative rewards or condemns harmful behavior; consequence framing and final message.

## Mandatory Decisions Per Finding
- Canonical finding id
- Violation text span (verbatim quote)
- Pillar (primary) + optional secondary pillar
- Primary GCAM article + related article list
- Severity + confidence decomposition:
  - lexical confidence
  - context confidence
  - policy confidence
- Rationale (Arabic, auditor-facing)
- Final ruling:
  - `violation`
  - `needs_review`
  - `context_ok`

## Severity Rubric Baseline
- **Low**: isolated mention, weak harmful framing, no endorsement.
- **Medium**: harmful depiction with limited impact or ambiguous framing.
- **High**: clear harmful depiction with reinforcing or repeated framing.
- **Critical**: explicit promotion/incitement or severe prohibited content with strong endorsement.

## Primary vs Related Article Rule
- Exactly one **primary article** per canonical finding.
- Related articles are attached as references, not duplicate findings.
- Primary selection order:
  1. strongest atom-level alignment
  2. highest policy confidence
  3. highest legal severity relevance
  4. deterministic tie-break (lowest article id)

## Ambiguity Escalation Rule
- If context and lexical signals conflict materially, final ruling must be `needs_review`.
- High-impact categories (national security / governance / faith) require stricter confidence threshold.

## Rollout Guardrails
- Default runtime mode remains:
  - `ANALYSIS_ENGINE=hybrid`
  - `ANALYSIS_HYBRID_MODE=shadow`
- No strict enforcement until:
  - shadow KPI thresholds pass
  - legal/policy workshop approval signed off.
