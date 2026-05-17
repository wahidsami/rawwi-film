# V4 Regulation Golden Test Set

## Purpose
- Validate `VIOLATION_SYSTEM_VERSION=v4` against the new regulation.
- Measure practical precision/recall before full rollout.

## How to Use
1. Create small scripts (or chunks) from the snippets below.
2. Run analysis in `v4`.
3. Check:
   - finding exists for positive cases
   - no finding for negative cases
   - `needs_review` for ambiguous cases
4. Compare against v3 output for regression awareness.

## Case Format
- `ID`
- `Clause`
- `Snippet (AR)`
- `Expected`
- `Expected Topic`
- `Notes`

---

## 1.1 Religious Fundamentals

### R-1 (Positive)
- Clause: 1.1
- Snippet: "قال الشخص: هذه النصوص الدينية لا قيمة لها ويجب السخرية منها."
- Expected: `finding`
- Expected Topic: `v4_01_religious_fundamentals`
- Notes: Direct contempt/insult framing.

### R-2 (Negative)
- Clause: 1.1
- Snippet: "دار نقاش أكاديمي حول الاختلاف بين المدارس الفقهية دون إساءة."
- Expected: `no_finding`
- Expected Topic: `v4_01_religious_fundamentals`
- Notes: Neutral mention.

### R-3 (Needs Review)
- Clause: 1.1
- Snippet: "استخدم الكاتب تعبيرًا ساخرًا غير واضح المقصد عن مسألة دينية."
- Expected: `needs_review`
- Expected Topic: `v4_01_religious_fundamentals`
- Notes: Ambiguous sarcasm.

---

## 1.2 State / Leadership

### S-1 (Positive)
- Clause: 1.2
- Snippet: "يجب التمرد على القيادة وإسقاطها."
- Expected: `finding`
- Expected Topic: `v4_02_state_leadership`
- Notes: Direct incitement.

### S-2 (Negative)
- Clause: 1.2
- Snippet: "تحدث التقرير عن تاريخ الدولة السعودية بشكل وصفي."
- Expected: `no_finding`
- Expected Topic: `v4_02_state_leadership`
- Notes: Neutral reference.

### S-3 (Needs Review)
- Clause: 1.2
- Snippet: "هناك جملة تلميحية غير صريحة تحتمل النقد السياسي العام."
- Expected: `needs_review`
- Expected Topic: `v4_02_state_leadership`
- Notes: Indirect and uncertain.

---

## 1.3 National Security

### N-1 (Positive)
- Clause: 1.3
- Snippet: "سأشرح لكم خطوة بخطوة طريقة تصنيع عبوة متفجرة منزلية."
- Expected: `finding`
- Expected Topic: `v4_03_national_security`
- Notes: Instructional harm.

### N-2 (Positive)
- Clause: 1.3
- Snippet: "كل رجال الأمن فاسدون ويجب عدم الثقة بهم جميعًا."
- Expected: `finding`
- Expected Topic: `v4_03_national_security`
- Notes: Generalized abuse.

### N-3 (Negative)
- Clause: 1.3
- Snippet: "تناول العمل آثار الاضطرابات تاريخيًا دون دعوة أو تحريض."
- Expected: `no_finding`
- Expected Topic: `v4_03_national_security`

---

## 1.4 Historical Documentary Reliability

### H-1 (Positive)
- Clause: 1.4
- Snippet: "هذا الفيلم الوثائقي يؤكد حدثًا تاريخيًا كبيرًا دون أي مصدر أو توثيق."
- Expected: `finding`
- Expected Topic: `v4_04_historical_documentary_reliability`

### H-2 (Negative)
- Clause: 1.4
- Snippet: "استند الفيلم الوثائقي إلى وثائق رسمية ومراجع موثقة."
- Expected: `no_finding`
- Expected Topic: `v4_04_historical_documentary_reliability`

---

## 1.5 Society / Generalization

### G-1 (Positive)
- Clause: 1.5
- Snippet: "كل أبناء القبيلة الفلانية كاذبون بطبيعتهم."
- Expected: `finding`
- Expected Topic: `v4_05_society_identity_generalization`

### G-2 (Positive)
- Clause: 1.5
- Snippet: "يجب على الجميع قطع صلة الرحم والتفكك الأسري."
- Expected: `finding`
- Expected Topic: `v4_05_society_identity_generalization`

### G-3 (Negative)
- Clause: 1.5
- Snippet: "انتقد النص تصرف شخصية واحدة دون تعميم."
- Expected: `no_finding`
- Expected Topic: `v4_05_society_identity_generalization`

---

## 1.6 Child-Directed Crime/Security

### C-1 (Positive)
- Clause: 1.6
- Snippet: "البطل الطفل عبّر بفخر عن الخطف والسطو وقدّمها كإنجاز بطولي."
- Expected: `finding`
- Expected Topic: `v4_06_children_crime_security`

### C-2 (Negative)
- Clause: 1.6
- Snippet: "عرض العمل جريمة ثم أكد أضرارها وعواقبها بوضوح للأطفال."
- Expected: `no_finding`
- Expected Topic: `v4_06_children_crime_security`

---

## 2.1 Drugs / Alcohol Manufacture

### D-1 (Positive)
- Clause: 2.1
- Snippet: "هذه طريقة تصنيع مادة مخدرة باستخدام ثلاث خطوات منزلية."
- Expected: `finding`
- Expected Topic: `v4_07_drugs_alcohol_manufacture`

### D-2 (Negative)
- Clause: 2.1
- Snippet: "الشخصية قالت إنها تتعافى من الإدمان دون أي شرح للتصنيع."
- Expected: `no_finding`
- Expected Topic: `v4_07_drugs_alcohol_manufacture`

---

## 2.2 Child / Disability Harm

### CD-1 (Positive)
- Clause: 2.2
- Snippet: "يجب تقييد حركة الطفل وضربه لتربيته."
- Expected: `finding`
- Expected Topic: `v4_08_child_disability_harm`

### CD-2 (Positive)
- Clause: 2.2
- Snippet: "سخروا من إعاقته أمام الجميع واعتبروا ذلك مضحكًا."
- Expected: `finding`
- Expected Topic: `v4_08_child_disability_harm`

### CD-3 (Negative)
- Clause: 2.2
- Snippet: "الفيلم يدين التنمر على ذوي الإعاقة ويعرض أثره السلبي."
- Expected: `no_finding`
- Expected Topic: `v4_08_child_disability_harm`

---

## 2.3 Positive LGBTQ Advocacy

### L-1 (Positive)
- Clause: 2.3
- Snippet: "النص يدعو المراهقين صراحة لتجربة هذا النمط ويقدمه كخيار أفضل."
- Expected: `finding`
- Expected Topic: `v4_09_lgbtq_positive_advocacy`

### L-2 (Negative)
- Clause: 2.3
- Snippet: "ورد ذكر عابر للموضوع دون دعوة أو ترويج."
- Expected: `no_finding`
- Expected Topic: `v4_09_lgbtq_positive_advocacy`

### L-3 (Needs Review)
- Clause: 2.3
- Snippet: "إشارة غير مباشرة قد تُفهم كتعاطف أو كعرض محايد حسب السياق."
- Expected: `needs_review`
- Expected Topic: `v4_09_lgbtq_positive_advocacy`

---

## 2.4 Explicit Sexual Scenes

### X-1 (Positive)
- Clause: 2.4
- Snippet: "وصف النص ممارسة جنسية صريحة بتفاصيل مباشرة."
- Expected: `finding`
- Expected Topic: `v4_10_explicit_sexual_scenes`

### X-2 (Negative)
- Clause: 2.4
- Snippet: "تلميح عاطفي عام بلا وصف جنسي صريح."
- Expected: `no_finding`
- Expected Topic: `v4_10_explicit_sexual_scenes`

---

## 2.5 Profanity

### P-1 (Positive)
- Clause: 2.5
- Snippet: "تضمن الحوار ألفاظًا نابية مباشرة ومتكررة."
- Expected: `finding`
- Expected Topic: `v4_11_profanity`

### P-2 (Negative)
- Clause: 2.5
- Snippet: "حوار حاد لكنه خالٍ من الشتائم الصريحة."
- Expected: `no_finding`
- Expected Topic: `v4_11_profanity`

---

## Metrics Sheet (fill during testing)
- Total positive cases:
- Positive hit rate:
- Total negative cases:
- False positive rate:
- Needs-review match rate:
- Top false-positive themes:
- Top misses:
- Prompt tweaks needed:
