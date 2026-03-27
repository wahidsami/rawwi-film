# Hard Atom Playbook: Priority Set

Date: 2026-03-27

This is the first working atom playbook for the atoms most likely to damage trust.

It is intentionally practical:

- what should count
- what should not count
- common confusion pairs
- which complaint benchmark cases should cover the atom

## Why These Atoms First

These atoms are high priority because they affect:

- obvious user trust
- common complaint patterns
- narrative-sensitive false positives
- Arabic insult and humiliation scenarios

## Atom 5-2

Title:
- الألفاظ والحوارات غير المناسبة للفئة العمرية

What should count:
- direct insults or profanity in dialogue
- humiliating words aimed at a person
- age-inappropriate abusive wording even if short
- obfuscated abusive words if the underlying insult is still clear

What should not count:
- neutral quoting of a word in a policy or educational explanation unless the scene is clearly non-abusive
- metadata, headings, or technical labels
- harmless disagreement without abusive wording

Common confusion:
- confused with `17-1` when the model sees dignity harm
- confused with `7-2` when the insult is explicitly gender-based

Decision rule:
- if the main issue is the abusive word itself, prefer `5-2`
- if the main issue is the gender basis of the insult, prefer `7-2`
- if the main issue is broader degradation of human dignity, `17-1` may be related but should not replace `5-2` in straightforward profanity cases

Benchmark coverage:
- `case01_obfuscated_insult`

## Atom 7-2

Title:
- التحقير أو الإهانة القائمة على الجنس

What should count:
- statements that degrade a woman because she is a woman
- role-reduction language such as confining women to service or obedience
- insults where the gender basis is explicit or central

What should not count:
- neutral mention of gender roles in descriptive narration without endorsement
- ordinary family disagreement with no degrading gender message

Common confusion:
- confused with `5-2` when the system only notices the insult
- confused with `7-5` when the system sees autonomy harm but misses the degrading tone

Decision rule:
- prefer `7-2` when the language itself humiliates or demeans based on gender
- accept `7-5` as related when the message mainly removes agency rather than insulting directly

Benchmark coverage:
- `case02_gender_humiliation`

## Atom 7-3

Title:
- تصوير التحرش أو الإكراه بشكل إيجابي أو اعتيادي

What should count:
- harassment framed as normal, playful, deserved, or expected
- coercive touching or pressure presented as acceptable behavior
- dialogue that normalizes persistence after refusal

What should not count:
- condemnation of harassment
- reporting harassment as harmful
- scenes where coercion is clearly criticized rather than normalized

Common confusion:
- confused with generic sexual-content or insult atoms
- missed entirely when the model detects the touch but not the normalization

Decision rule:
- the key is not only the act, but the framing
- prefer `7-3` when the script treats coercion as ordinary or acceptable

Benchmark coverage:
- `case03_harassment_normalized`

## Atom 7-4

Title:
- لوم الضحية أو تبرير الإساءة إليها

What should count:
- statements blaming the victim for harassment or abuse
- lines that say the victim caused the harm through clothing, behavior, or presence
- language shifting moral responsibility from offender to victim

What should not count:
- neutral recounting of an accusation that the scene later rejects
- explicit rebuttal of victim blaming

Common confusion:
- confused with `7-2` or `7-5`
- reduced to generic harmful speech without capturing the victim-blaming logic

Decision rule:
- if the core meaning is “the victim caused what happened,” prefer `7-4`

Benchmark coverage:
- `case04_victim_blaming`

## Atom 9-1

Title:
- تمجيد العنف أو تقديمه كحل

What should count:
- lines that endorse violence as necessary, effective, or admirable
- framing violence as the correct way to solve conflict
- enthusiastic approval of violent retaliation

What should not count:
- violence that is clearly condemned
- remorse after violence
- discussion of violence as harmful

Common confusion:
- false positives from any violent scene, even when condemned
- confusion with `5-1` or `12-3` where the model sees violence but misses endorsement structure

Decision rule:
- do not flag `9-1` just because violence exists
- flag `9-1` when the script clearly frames violence as the answer, the lesson, or the admired method

Benchmark coverage:
- `case05_violence_as_solution`
- `case06_condemned_violence`

## Atom 17-1

Title:
- الإساءة إلى الكرامة الإنسانية

What should count:
- direct attacks on a person’s human worth, dignity, or value
- statements reducing a person to humiliation or worthlessness
- degrading language beyond simple profanity

What should not count:
- ordinary rudeness better explained by `5-2`
- factual criticism with no dignity attack

Common confusion:
- overlaps with `5-2` for insult-heavy lines
- overlaps with `17-2` if reputation damage is public and factual-seeming

Decision rule:
- prefer `17-1` when the line attacks human worth or dignity itself
- prefer `17-2` when the primary harm is public reputation or defamatory accusation

Benchmark coverage:
- `case07_human_dignity`

## First Review Rules

When a change improves one of these atoms, verify:

1. benchmark case still passes
2. preferred atom miss count drops
3. rationale mentions the real reason, not only the surface word
4. no new false positives appear in narrative-sensitive cases

## Next Atoms To Add

- `17-2` التشهير والإساءة إلى السمعة
- `11-1` تقديم معلومات مضللة أو غير دقيقة على أنها حقائق
- `16-1` تقديم معلومات مغلوطة أو غير دقيقة على أنها حقائق
- `7-5` تقويض كرامة المرأة أو استقلاليتها
