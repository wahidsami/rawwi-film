📘 GCAM Severity Rulebook (v1)
Deterministic + AI-Guided + Auditor-Trusted
🧠 Core Principle

❗ AI does NOT output severity
✅ AI outputs factors → Backend computes severity

⚙️ 1. Severity Model Overview

Each finding is scored across:

{
  "intensity": 1-4,
  "context_impact": 1-4,
  "legal_sensitivity": 1-4,
  "audience_risk": 1-4
}
🧮 2. Final Severity Calculation
score = intensity + context_impact + legal_sensitivity + audience_risk
Mapping:
Score	Severity
4–6	low
7–9	medium
10–12	high
13–16	critical
🔴 3. Factor Definitions (Global)
3.1 🔥 INTENSITY (C)

What it measures:
Strength of the violation itself

Level	Description
1	Very mild / implicit
2	Clear but moderate
3	strong / explicit
4	extreme / graphic / aggressive
3.2 🎬 CONTEXT IMPACT (X)

What it measures:
How prominent the violation is in the scene

Level	Description
1	Mention only (background)
2	Single dialogue/action
3	Repeated / emphasized
4	Central to scene or plot
3.3 ⚖️ LEGAL SENSITIVITY (L)

What it measures:
Regulatory seriousness

Level	Description
1	etiquette / mild
2	moderate
3	sensitive
4	critical
3.4 👁️ AUDIENCE RISK (A)

What it measures:
Risk level based on audience

Level	Description
1	adults only
2	general audience
3	minors involved
4	children targeted
🧩 4. Canonical Atom Severity Rules

This is the most important section for AI + Cursor.

🔴 INSULT
Intensity
Level	Signals
1	mild sarcasm
2	"غبي", "كذاب"
3	"حقير", "وسخ"
4	family insult / degrading identity
Legal Sensitivity = 2 (default)
Overrides

Repeated insult → context ≥ 3

Public humiliation → +1 context

⚔️ VIOLENCE
Intensity
Level	Signals
1	implied threat
2	minor hit
3	strong violence
4	قتل / تعذيب / دم
Legal Sensitivity = 3
Overrides

Torture → intensity = 4

Weapon use → min intensity = 3

🔥 SEXUAL
Intensity
Level	Signals
1	light romance
2	suggestive
3	explicit
4	graphic / coercive
Legal Sensitivity = 3
Overrides

Sexual violence → CRITICAL

Minors involved → CRITICAL

🍷 SUBSTANCES
Intensity
Level	Signals
1	mention only
2	casual use
3	repeated use
4	promotion / glorification
Legal Sensitivity = 3
Overrides

With minors → audience ≥ 3

Glamorous portrayal → +1 intensity

⚖️ DISCRIMINATION
Intensity
Level	Signals
1	subtle bias
2	stereotype
3	offensive generalization
4	hate speech
Legal Sensitivity = 4
Overrides

Call to harm → CRITICAL

Religious discrimination → min intensity = 3

👶 CHILD_SAFETY
Intensity
Level	Signals
2	mild risk
3	harm
4	abuse / exploitation
Legal Sensitivity = 4
Audience Risk = 4 (always)
Overrides

Any abuse → CRITICAL

👩 WOMEN
Intensity
Level	Signals
1	mild stereotype
2	degrading comment
3	harassment
4	violence / coercion
Legal Sensitivity = 3
Overrides

Victim blaming → min intensity = 3

Sexual harassment → map also to SEXUAL

🧠 MISINFORMATION
Intensity
Level	Signals
1	unclear
2	misleading
3	false claim
4	harmful misinformation
Legal Sensitivity = 3
🏛️ PUBLIC_ORDER
Intensity
Level	Signals
2	rule breaking
3	incitement
4	violence / chaos
Legal Sensitivity = 4
🚫 EXTREMISM
Intensity
Level	Signals
3	mention
4	support / promotion
Legal Sensitivity = 4
Overrides

Always ≥ HIGH

Promotion → CRITICAL

🌍 INTERNATIONAL
Intensity
Level	Signals
2	negative comment
3	offensive
4	hostile
Legal Sensitivity = 3
💰 ECONOMIC
Intensity
Level	Signals
2	misleading
3	harmful
4	panic-inducing
Legal Sensitivity = 3
🔐 PRIVACY
Intensity
Level	Signals
2	minor exposure
3	defamation
4	serious violation
Legal Sensitivity = 3
👗 APPEARANCE
Intensity
Level	Signals
1	borderline
2	inappropriate
3	suggestive
4	explicit sexualized
Legal Sensitivity = 2
🚨 5. Global Overrides (Critical Layer)

These rules override everything:

Always CRITICAL

Child abuse

Sexual violence

Extremism promotion

Explicit incitement to violence

Always ≥ HIGH

Weapon violence

Hate speech

Harassment with coercion

🧩 6. AI Output Schema (MANDATORY)

AI MUST output:

{
  "canonical_atom": "VIOLENCE",
  "intensity": 4,
  "context_impact": 2,
  "legal_sensitivity": 3,
  "audience_risk": 2
}
⚙️ 7. Backend Function (Cursor-ready)
function calculateSeverity(factors) {
  const score =
    factors.intensity +
    factors.context_impact +
    factors.legal_sensitivity +
    factors.audience_risk;

  if (score >= 13) return "critical";
  if (score >= 10) return "high";
  if (score >= 7) return "medium";
  return "low";
}
🧠 8. Why This Will Work

✅ Removes randomness
✅ Fully explainable
✅ Auditor-trust friendly
✅ Easy to tune later
✅ Works across all atoms