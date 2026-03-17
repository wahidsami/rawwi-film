📘 GCAM Canonical Atom Framework (v1)
Auditor-Centric + AI-Optimized
🧠 Purpose

This framework introduces Canonical Atoms (Narrative Violation Types) to:

Eliminate duplication across GCAM articles

Align with how film script auditors think

Provide clear detection guidance for AI models

Maintain full legal traceability to GCAM atoms

🧩 Structure of Each Canonical Atom

Each atom includes:

ID

Title

Definition (AI-oriented)

What to Detect (signals)

What NOT to flag (important for precision)

Examples (positive matches)

Edge Cases (film-specific nuance)

Mapped GCAM Atoms

🔴 1. INSULT — الإهانة والسب
Definition

Any verbal or descriptive content that demeans, insults, humiliates, or attacks a person or group’s dignity.

What to Detect

Direct insults: "يا غبي", "يا حرامي"

Accusations without proof: "نصاب", "كذاب"

Mockery or sarcasm meant to degrade

Animal comparisons used offensively

Family-based insults ("ابن الـ...")

Tone indicating humiliation or contempt

What NOT to Flag

Neutral disagreement

Constructive criticism

Non-abusive sarcasm

Examples

"إنت إنسان حقير"

"هو واحد حمار ما بيفهم"

Edge Cases

Villain dialogue → still flagged (Judge rule: no justification)

Comedy → still violation if insulting

Mapped GCAM Atoms

4-1

5-2

7-2

17-1

17-2

⚔️ 2. VIOLENCE — العنف والإيذاء
Definition

Any depiction, threat, or description of physical or psychological harm.

What to Detect

Physical actions: ضرب، صفع، ركل

Threats: "هقتلك"

Weapons: سكين، مسدس

Injury descriptions: دم، جروح

Torture or abuse

What NOT to Flag

Mild non-harmful actions (e.g., tapping shoulder)

Purely symbolic language without harm

Examples

"يضربه بعنف"

"سأقتلك الليلة"

Edge Cases

Action scenes → still violations (Judge = max detection)

Off-screen violence → still counts if described

Mapped GCAM Atoms

4

5-1

6-1

9-1

9-3

🔥 3. SEXUAL — المحتوى الجنسي والإيحاءات
Definition

Any explicit or implicit reference to sexual acts, desire, or body-related arousal.

What to Detect

Sexual dialogue or innuendo

Descriptions of body parts in a suggestive way

Romantic/physical intimacy (if suggestive)

Adultery or illicit relations

Seduction language

What NOT to Flag

Neutral romantic dialogue

Non-suggestive affection

Examples

"عايزك الليلة"

"ينظر إلى جسدها بشهوة"

Edge Cases

Euphemisms ("ينام معها") → must detect

Cultural indirect language → still counts

Mapped GCAM Atoms

4-7

5-3

9-4

23

24

🍷 4. SUBSTANCES — المخدرات والكحول
Definition

Any mention, depiction, or normalization of drug, alcohol, or smoking use.

What to Detect

Drinking, smoking, drug use

Party scenes involving substances

Positive framing ("يرتاح لما يشرب")

Addiction behavior

What NOT to Flag

Negative portrayal with consequences (still detect but lower severity later)

Examples

"يشرب خمر"

"يشعل سيجارة"

Edge Cases

Casual background use → still flagged

Stylish/glamorous use → higher severity

Mapped GCAM Atoms

5-4

10-1 → 10-5

⚖️ 5. DISCRIMINATION — التمييز وخطاب الكراهية
Definition

Any content that attacks or excludes a group based on identity.

What to Detect

Racism, sexism, religious bias

Generalizations ("كل النساء...")

Hate speech

Superiority claims

What NOT to Flag

Neutral identity mentions

Non-hostile cultural references

Examples

"النساء ما ينفعوش"

"هذول أقل مننا"

Edge Cases

Historical context → still flagged

Character bias → still flagged

Mapped GCAM Atoms

5

7

8

👶 6. CHILD_SAFETY — حماية الأطفال
Definition

Any content that harms, exploits, or negatively influences children.

What to Detect

Violence against children

Bullying children

Risky behavior normalized

Child exploitation

What NOT to Flag

Protective or educational context

Examples

"يضرب الطفل"

"الطفل يدخن"

Edge Cases

Teen characters → still considered minors

Humor involving kids → still flagged if harmful

Mapped GCAM Atoms

6-1 → 6-5

👩 7. WOMEN — حقوق المرأة
Definition

Any content that undermines women’s dignity, safety, or equality.

What to Detect

Harassment

Victim blaming

Gender stereotypes

Objectification

What NOT to Flag

Neutral gender roles

Empowering narratives

Examples

"هي السبب في اللي حصل لها"

"مكان المرأة في البيت"

Edge Cases

Romantic persistence → may be harassment

Cultural norms → still evaluated strictly

Mapped GCAM Atoms

7-1 → 7-5

🧠 8. MISINFORMATION — التضليل
Definition

Presenting false or misleading information as factual.

What to Detect

Fake facts

Misleading claims

Blurring fiction/reality

What NOT to Flag

Clearly fictional content

Examples

"هذا علاج يشفي كل الأمراض"

Edge Cases

"Based on real events" → higher scrutiny

Mapped GCAM Atoms

11

16

🏛️ 9. PUBLIC_ORDER — الأمن والنظام
Definition

Content that encourages instability, chaos, or rule-breaking.

What to Detect

Calls to violence

Encouraging law-breaking

Social unrest

Examples

"لا تلتزم بالقوانين"

"اخرجوا وخربوا"

Mapped GCAM Atoms

12

13

14

🚫 10. EXTREMISM — التطرف
Definition

Any support, promotion, or normalization of extremist ideologies or groups.

What to Detect

Terrorism references

Extremist ideology

Symbols/slogans

Examples

"نؤيد الجماعة"

استخدام شعارات متطرفة

Mapped GCAM Atoms

9-2

15

🌍 11. INTERNATIONAL — العلاقات الدولية
Definition

Content that insults or harms relations with countries or peoples.

What to Detect

Mocking nations

Offensive generalizations

Mapped GCAM Atoms

18

💰 12. ECONOMIC — الاقتصاد والتجارة
Definition

Content that spreads harmful or misleading economic narratives.

What to Detect

Panic creation

False financial claims

Mapped GCAM Atoms

19

20

🔐 13. PRIVACY — الخصوصية والسمعة
Definition

Any violation of personal dignity, reputation, or privacy.

What to Detect

Defamation

Exposure of private info

Personal attacks

Mapped GCAM Atoms

17

👗 14. APPEARANCE — المظهر والاحتشام
Definition

Any depiction of clothing or appearance that violates cultural or modesty standards.

What to Detect

Revealing clothing

Sexualized appearance

Suggestive visual descriptions

Examples

"ترتدي ملابس فاضحة"

"جسدها مكشوف"

Mapped GCAM Atoms

23

24

🧠 Final Notes for Implementation
1. Multi-Mapping (Critical)

One finding can map to multiple canonical atoms:

{
  "canonical_atoms": ["SEXUAL", "WOMEN"]
}
2. Primary Atom Selection

Use:

strongest semantic match

highest severity

clearest violation type

3. AI Prompt Usage

Inject per atom:

Definition + What to Detect + Examples

This dramatically improves:

recall

consistency

cross-article alignment

4. Aggregation Logic Change

From:

article-based clustering

To:

canonical_atom clustering