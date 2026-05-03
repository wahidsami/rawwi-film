Captain… this is the final boss of your system architecture.

And Codex is absolutely right again :

👉 Article 4 is NOT a normal prompt
👉 It’s a system design problem, not a prompt problem

🧠 FINAL DECISION (very clear)
✅ The correct approach is:
👉 Option C — Hybrid (Prompt + Pipeline Logic)
🎯 Why NOT A or B
❌ Option A (full prompt)
will over-trigger
will overlap everything
will recreate your original chaos
❌ Option B (logic only)
loses flexibility
misses edge cases
too rigid
✅ Option C (correct)
Minimal prompt
+ Strict deferral rules
+ Auditor enforcement

👉 This is exactly how mature systems do fallback categories

🧠 What Article 4 REALLY is

It is NOT:

❌ a detector

It IS:

👉 “Residual risk bucket”

Meaning:

“Something is wrong… but no specific pass owns it”

💥 Core Principle
Article 4 = LAST RESORT ONLY

If ANY other pass can own it:

👉 Article 4 MUST disappear

🚀 MESSAGE TO CAPTAIN CODEX
📡 Captain TARS → Captain Codex
🎯 Mission: Article 4 Stabilization (Hybrid Control)
🧠 PART 1 — PIPELINE RULES (MOST IMPORTANT)
🔥 Rule 1 — Deferral Priority

Before accepting ANY Article 4 finding:

if (
  overlapWith(insults) ||
  overlapWith(violence) ||
  overlapWith(women) ||
  overlapWith(discrimination) ||
  overlapWith(misinformation)
) {
  DROP Article4 finding
}
🔥 Rule 2 — Stronger Evidence Wins

If another pass has:

same span OR
better snippet OR
clearer violation

👉 Article 4 = ❌ DROP

🔥 Rule 3 — No Duplicate Meaning

If Article 4 rationale describes:

insult
violence
discrimination

👉 but another pass already detected it

👉 ❌ DROP

🔥 Rule 4 — Weak Evidence Kill

If:

snippet does NOT independently prove violation

👉 ❌ DROP

🔥 Rule 5 — Scene / Heading Rejection

If snippet is:

scene title
location
timing

👉 ❌ DROP immediately

🧠 PART 2 — MINIMAL SYSTEM PROMPT
🔥 REPLACE WITH THIS (VERY STRICT)
أنت محلل امتثال محتوى يعمل كمسار احتياطي (Fallback).

⚠️ مهم جدًا:
هذا المسار يُستخدم فقط إذا لم يكن هناك مسار آخر مناسب.

=== القاعدة الأساسية ===

لا تُرجع أي نتيجة إلا إذا:

- لا يوجد تصنيف آخر مناسب
- النص نفسه يحتوي على سلوك أو محتوى إشكالي واضح
- الدليل موجود حرفيًا داخل النص

=== لا يشمل ===

❌ أي محتوى يمكن تصنيفه ضمن:
- إهانات
- عنف
- تمييز
- محتوى جنسي
- معلومات مضللة

=== قاعدة المطابقة النصية ===

- يجب أن يكون evidence_snippet مطابقًا حرفيًا 100%
- ممنوع إعادة الصياغة
- ممنوع اختيار نص قريب

إذا لم يكن النص واضحًا:
→ لا تُرجع نتيجة

=== قواعد الدقة ===

- كن محافظًا جدًا
- هذا المسار نادر الاستخدام
- الأفضل عدم إرجاع نتيجة

=== المطلوب ===

استخرج فقط الحالات النادرة التي لا يمكن تصنيفها ضمن المسارات الأخرى.
🔹 USER PROMPT
=== STRICT EVIDENCE RULES ===

- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن يحتوي النص نفسه على المشكلة
- لا تعتمد على السياق العام

إذا لم توجد حالة واضحة:
{ "findings": [] }
🧠 PART 3 — AUDITOR RULE (CRITICAL)

Inside auditor:

🔥 Add:
if (finding.pass === "article_4") {
  if (existsBetterMatchFromOtherPass(finding)) {
    DROP
  }
}
🎯 DROP CONDITIONS (VERY IMPORTANT)

Article 4 must be REMOVED if:

snippet ≠ rationale ❌
snippet weak ❌
another pass covers it ❌
requires context ❌
is generic ❌
🧪 TEST CASES
✅ SHOULD SURVIVE (RARE)
"هذا الشيء غلط وما يصح"

👉 vague but problematic → no clear category

"في تصرفات غير مقبولة تصير"

👉 unclear violation → fallback

❌ MUST BE DROPPED
"أنت غبي"

👉 insults owns it

"أضربك"

👉 violence owns it

"مكانك المطبخ"

👉 women owns it

"اطردوهم"

👉 discrimination owns it

"التاريخ كله كذب"

👉 misinformation owns it

🧠 FINAL SYSTEM BEHAVIOR

After this fix:

BEFORE:
Article 4 = noise generator ❌
overlaps everything ❌
AFTER:
Article 4 = rare safety net ✅
activates only when needed ✅
never conflicts ✅
🧭 Captain Insight (VERY IMPORTANT)

Every strong system has:

👉 specialized detectors
👉 AND a fallback safety layer

BUT:

fallback must be weaker, stricter, rarer

🚀 Final State

You now have:

Detection → Grounding → Specialization → Audit → Fallback control

👉 This is enterprise-grade architecture