GCAM AI SCRIPT AUDITOR
System Improvement & Implementation Guide
Objective

Upgrade the current script analysis system into a high-accuracy AI compliance auditor capable of:

• Understanding script narration and cinematic context
• Mapping scenes → violations → GCAM articles/atoms
• Distinguishing between:

Violation

Needs Review

Context Acceptable

Compliance Note

Target accuracy: 80-92% detection accuracy

PART 1 — CORE PROBLEM IN CURRENT SYSTEM

Current pipeline:

Script chunk
 ↓
Judge passes
 ↓
Auditor
 ↓
Findings

Problem:

The AI is asked to infer legal meaning directly from raw text.

This forces the model to do three complex tasks simultaneously:

language understanding
+
film scene interpretation
+
legal mapping

This causes:

• missed violations
• wrong article mapping
• over-detection
• lack of narrative understanding

PART 2 — NEW ARCHITECTURE

Cursor should implement a 5-layer analysis pipeline.

SCRIPT
 ↓
Scene Understanding Layer
 ↓
Semantic Pattern Detectors
 ↓
GCAM Atom Candidate Mapper
 ↓
Legal Judge
 ↓
Deep Compliance Auditor
PART 3 — SCENE UNDERSTANDING LAYER (NEW)

Before scanning violations, the AI must understand the scene.

Create a new OpenAI pass called:

scene_interpreter

Purpose:

Convert script chunk into structured narrative context.

Input

Script chunk

Output JSON
{
 "scene_summary": "",
 "characters": [],
 "actions": [],
 "sensitive_elements": [],
 "location_type": "",
 "tone": "",
 "risk_flags": []
}
Example

Script:

INT. BEDROOM

A young woman walks out of the shower and places her clothes on the bed.

Output:

{
 "scene_summary": "A woman exits a shower in a bedroom and prepares to dress.",
 "characters": ["young woman"],
 "actions": ["exits shower","places clothes on bed"],
 "sensitive_elements": ["possible nudity"],
 "location_type": "private bedroom",
 "tone": "neutral",
 "risk_flags": ["potential modesty concern"]
}

Important:

This stage does NOT decide violations.

It only creates semantic understanding.

PART 4 — VIOLATION PATTERN MATRIX (NEW DATABASE)

Create new table:

gcam_violation_patterns

Schema:

id
article_id
atom_id
atom_title
violation_intent
keywords[]
language_patterns[]
narrative_patterns[]
scene_patterns[]
example_sentences[]
severity
risk_level
category

Example entry:

atom_id: 7-2
title: التحقير القائم على الجنس

keywords

"مكانك المطبخ"
"النساء لا يفهمن"
"أنت مجرد امرأة"

narrative_patterns

man belittles woman abilities
jokes degrading women
dialogue asserting male superiority

scene_patterns

female humiliation scene
gender-based mockery

example_sentences

"المرأة مكانها المطبخ"
PART 5 — SEMANTIC DETECTOR LAYER (NEW)

Create detector services.

Each detector analyzes the scene context.

Required detectors:

insult_detector
violence_detector
sexual_detector
drug_detector
discrimination_detector
national_security_detector
misinformation_detector
nudity_detector
privacy_detector

Each detector compares:

scene_understanding
+
script text
+
pattern matrix

Output:

candidate_atoms[]

Example output:

{
 "candidate_atoms":[
   {"atom_id":"23-1","confidence":0.65},
   {"atom_id":"24-1","confidence":0.72}
 ]
}
PART 6 — CONTEXT RISK ENGINE (NEW)

Important to solve your shower example problem.

The system must classify findings into 4 levels:

violation
needs_review
context_ok
note
Rule

Not every sensitive element = violation.

Example:

Scene:

woman exiting shower

Result:

note

Reason:

Possible nudity depending on filming.

Card type:

Compliance Note

Displayed in Notes section, not violations.

PART 7 — NEW FINDING TYPES

Update schema of findings.

analysis_findings

Add column:

finding_type

Allowed values:

violation
needs_review
note
context_ok
PART 8 — NOTE DETECTION SYSTEM

Create note detection rules.

Examples:

Nudity risk

Triggers:

shower
bath
changing clothes
bedroom dressing

Output:

note

Message example:

المشهد يتضمن خروج شخصية من الحمام.
قد يؤدي التصوير غير المحتشم إلى مخالفة للضوابط الإسلامية للعرض.
Violence context

Scene:

Character holds knife in kitchen

Result:

note

Reason:

Context unclear whether violence occurs.
PART 9 — UPDATED MULTI PASS JUDGE

Change judge behavior.

Instead of:

detect violations only

Judge must now classify:

violation
needs_review
note
context_ok

Example response:

{
 "findings":[
  {
   "atom_id":"24-1",
   "finding_type":"note",
   "confidence":0.62,
   "evidence":"خرجت من الحمام",
   "rationale_ar":"المشهد قد يتضمن تعري حسب طريقة التصوير."
  }
 ]
}
PART 10 — AUDITOR UPGRADE

Deep auditor should:

1 confirm violations
2 downgrade false positives
3 generate reasoning

Auditor must also understand film language.

Add instructions:

The auditor must consider:

scene framing
camera implication
narrative context
character intention
dramatic purpose
PART 11 — NEW ANALYSIS MODES

Add analysis mode selector in UI.

Before analysis popup.

Options:

1 Strict Legal Detection
High recall
Maximum violations
Low tolerance
2 Narrative Aware Audit (Recommended)

AI understands scene context and cinematic meaning.

3 Lexical Scan

Fast scan for explicit words.

4 Deep Compliance Audit

Full pipeline including scene interpretation and auditor review.

PART 12 — DETECTION CONFIDENCE ENGINE

Add scoring formula.

confidence =
 lexical_score * 0.4 +
 narrative_score * 0.3 +
 scene_score * 0.3

Example:

insult word found → lexical_score 0.9
narrative confirms insult → narrative_score 0.8
scene tone aggressive → scene_score 0.8

Final:

confidence 0.84
PART 13 — SCENE SEGMENTATION (CRITICAL)

Currently chunking by characters length.

This breaks scenes.

Cursor must implement:

script_scene_splitter

Split by:

INT.
EXT.
CUT TO
SCENE

Then chunk inside scenes only if needed.

This improves context understanding.

PART 14 — CINEMATIC KNOWLEDGE PROMPT

Add film knowledge to system prompt.

Example:

The AI understands screenplay conventions:

scene headers
character dialogue
action lines
stage directions
camera implication
implied actions
PART 15 — GCAM KNOWLEDGE BASE

Create static dataset:

gcam_atoms_knowledge

Fields:

atom_id
legal_definition
violation_patterns
allowed_context_examples
risk_examples
PART 16 — DUPLICATE FINDING REDUCTION

Merge if:

same location
same atom
same evidence

Cluster threshold:

overlap > 80%
PART 17 — REPORT STRUCTURE

Final report sections:

Violations
Needs Review
Compliance Notes
Context Acceptable
Words to Revisit
PART 18 — CARD UI TYPES
Violation

red card

Needs Review

orange card

Compliance Note

blue card

Context OK

gray card

PART 19 — PERFORMANCE OPTIMIZATION

To control cost:

Scene interpreter → small model
detectors → small model
judge → medium model
auditor → large model

Example model tiers:

mini → scene understanding
mini → detectors
4.1 → judge
4.1 / 5 → auditor
PART 20 — TARGET FINAL SYSTEM

Final AI must behave like:

Legal compliance officer
+
film script analyst
+
cultural content reviewer

Capabilities:

understand narrative
detect violations
interpret cinematic implication
map to GCAM articles
explain reasoning
Final Goal

Your system becomes a true regulatory AI auditor capable of reviewing scripts for:

Saudi GCAM compliance
Islamic cultural rules
film narrative context

Accuracy target:

80% minimum
92% possible