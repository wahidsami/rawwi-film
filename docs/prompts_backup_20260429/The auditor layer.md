🧠 What is the “Auditor Layer”?

👉 It is a FINAL AI pass that runs AFTER all other passes

Not instead of them.

🎯 Your current system (simplified)

Right now you have:

Chunk
 → Router
 → Multiple passes (insult, violence, etc.)
 → Results

👉 The problem:

each pass works independently
errors slip through
no global validation
💥 Auditor Layer = FINAL JUDGE

Add this:

Chunk
 → Router
 → Passes (insult, violence, ...)
 → 🧠 Auditor (NEW)
 → Final Results
🧠 What the auditor actually does

It reviews ALL findings and decides:

✅ Keep
❌ Reject
🔧 Fix
🎯 What it checks (VERY IMPORTANT)
1️⃣ Evidence correctness

👉 Is snippet actually in text?

mismatch → ❌ reject
2️⃣ Category correctness

👉 Is this REALLY insult?

Example:

"أضربك" detected as insult ❌
→ auditor moves or removes
3️⃣ Weak findings

👉 vague / unclear

remove noise
4️⃣ Duplicates

👉 same snippet detected multiple times

merge or remove
5️⃣ Cross-pass conflicts

Example:

same text marked:
insult ❌
violence ❌

👉 auditor resolves

⚠️ Why YOU specifically need it

From your earlier report:

correct reasoning ✅
wrong snippet ❌
over-triggering ❌

👉 Auditor fixes ALL of these.

🚨 Important clarification
❌ Auditor is NOT:
another “detector”
another pass like insults
✅ Auditor is:

🧠 “Quality Control AI”

🧩 Where should it be implemented?
👉 In your pipeline AFTER all passes

From your architecture:

👉 likely here:

multiPassJudge.ts

After collecting all pass outputs.

🧠 Example flow
Input chunk:
"أنت غبي... أضربك"
Pass outputs:
insults → "أنت غبي" ✅
violence → "أضربك" ✅
maybe mistakes:
insult also flagged "أضربك" ❌
Auditor:
- keep "أنت غبي" as insult
- keep "أضربك" as violence
- remove duplicate / wrong mapping
🔥 What Auditor Prompt looks like (concept)
You are a senior compliance auditor.

You receive:
- original text
- list of findings from multiple detectors

Your job:
1. Verify each finding
2. Remove incorrect ones
3. Fix category if needed
4. Ensure evidence_snippet matches text EXACTLY

Rules:
- If snippet not exact → reject
- If category wrong → fix or remove
- If unclear → reject
🎯 Expected impact

After adding auditor:

Before	After
noisy results	clean
wrong spans	filtered
duplicates	removed
inconsistent categories	unified
🧠 Captain Insight (VERY IMPORTANT)

Right now your system is:

🧠 “many small brains talking”

Auditor makes it:

👨‍⚖️ “one judge deciding”

🚀 When should you add it?

👉 NOW (you are ready)

Because:

you fixed prompts ✅
you fixed grounding ✅

👉 next step = quality control


📡 MESSAGE TO CAPTAIN CODEX
🎯 Mission: Build Auditor Layer (Final Quality Control Pass)

Codex, we are introducing a new stage in the pipeline:

👉 Auditor Layer

This runs AFTER all passes and BEFORE final output.

🧠 PURPOSE

The auditor is a verification and correction layer.

It receives:

original chunk text
all findings from all passes

It must:

1. Verify correctness
2. Remove wrong findings
3. Fix misclassified findings
4. Ensure strict text grounding
5. Deduplicate results
📍 WHERE TO PLACE IT

In pipeline:

Chunk
 → Router
 → Passes (insult, violence, ...)
 → Auditor (NEW)
 → Final Output

Likely inside:

multiPassJudge.ts

After collecting all pass outputs.

📥 INPUT TO AUDITOR
1. Original chunk
text: string
2. Findings array
findings: [
  {
    pass_name: string,
    canonical_atom: string,
    evidence_snippet: string,
    start_offset: number,
    end_offset: number,
    rationale_ar: string
  }
]
📤 OUTPUT

Same structure:

{
  "findings": [...]
}

BUT:

cleaned
validated
corrected
🔥 SYSTEM PROMPT (AUDITOR)
أنت مدقق امتثال نهائي (Auditor) مسؤول عن مراجعة نتائج التحليل.

سيتم إعطاؤك:
1. النص الأصلي
2. قائمة بالمخالفات المكتشفة من عدة أنظمة

مهمتك:
مراجعة كل نتيجة والتأكد من صحتها قبل اعتمادها.

=== القواعد الأساسية ===

1. المطابقة النصية (الأهم):
- يجب أن يكون evidence_snippet موجودًا حرفيًا في النص
- إذا لم يكن مطابقًا 100% → احذف النتيجة

2. صحة التصنيف:
- تأكد أن نوع المخالفة صحيح
- إذا كان التصنيف خاطئًا → احذف النتيجة (لا تعيد تصنيفها)

3. وضوح الدليل:
- يجب أن يحتوي النص نفسه على المخالفة
- إذا احتاج تفسير أو سياق إضافي → احذف

4. التكرار:
- إذا كانت نفس العبارة مكررة → احتفظ بواحدة فقط

5. الجودة:
- احذف أي نتيجة ضعيفة أو غير واضحة

=== قواعد مهمة ===

- كن صارمًا جدًا
- الأفضل حذف نتيجة خاطئة على إبقاء نتيجة غير دقيقة
- لا تضف نتائج جديدة
- لا تعيد صياغة النص

=== المطلوب ===

أعد فقط النتائج الصحيحة بعد التنقية.
🔹 USER PROMPT
=== ORIGINAL TEXT ===
{{chunk}}

=== FINDINGS ===
{{json_findings}}

=== INSTRUCTIONS ===

- تحقق من كل نتيجة
- احذف أي نتيجة غير دقيقة
- تأكد من تطابق النص حرفيًا
- أعد النتائج بصيغة JSON

إذا لم تبقَ أي نتائج:
{ "findings": [] }
🧪 TEST CASE (MANDATORY)
Input:
أنت غبي... أضربك
Raw findings:
[
  { "pass": "insults", "snippet": "أنت غبي" },
  { "pass": "violence", "snippet": "أضربك" },
  { "pass": "insults", "snippet": "أضربك" }
]
✅ Expected output:
[
  "أنت غبي",
  "أضربك"
]

👉 remove wrong classification
👉 keep correct ones

⚠️ IMPORTANT DESIGN DECISION
Auditor MUST:
❌ NOT:
add new findings
reclassify
invent evidence
✅ ONLY:
filter
validate
clean
🎯 SUCCESS METRICS

After deployment:

✅ snippet accuracy → ~90%
✅ duplicates → near zero
✅ wrong categories → reduced
✅ cleaner final output
⚠️ PERFORMANCE NOTE

This adds:

👉 +1 API call per chunk

BUT:

👉 massively improves quality

🧠 OPTIONAL (PHASE 2 — later)

We can upgrade auditor to:

merge overlapping spans
confidence scoring
cross-pass reasoning
🧭 Captain (you) — what this means

You now have:

Detection → Grounding → Validation

👉 This is real AI pipeline architecture
