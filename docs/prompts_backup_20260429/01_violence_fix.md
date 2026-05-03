Captain… Codex did a clean job documenting this 👌
And now I’ll be very precise:

👉 Your current violence prompt is already 80% correct
👉 BUT it still has one critical flaw causing your issue

🚨 THE REAL PROBLEM (in your current prompt)

From your file :

You already have:

✅ definition
✅ examples
✅ strict matching
✅ constraints

BUT you are still missing ONE thing:

❌ You didn’t BREAK the model’s “story understanding habit”
🧠 What’s happening internally

Even with your rules, the model still does:

"I understand the scene → I know there is violence → let me pick something nearby"

👉 That’s why you get:

correct reasoning ✅
wrong snippet ❌
💥 THE FIX (small but CRITICAL)

We don’t rewrite everything.

👉 We apply a SURGICAL PATCH

🚀 MESSAGE TO CAPTAIN CODEX (COPY THIS EXACTLY)
📡 Captain TARS → Captain Codex
🎯 Mission: Violence Prompt Grounding Fix (V2.1 PATCH)

Codex, current violence prompt is strong but suffers from:

❌ semantic reasoning overriding text grounding

We need to force strict text anchoring BEFORE reasoning

🔧 REQUIRED CHANGES (DO NOT REWRITE FULL PROMPT)
✅ 1. ADD THIS BLOCK (VERY IMPORTANT)

Insert AFTER:

=== القاعدة الأساسية ===
🔥 ADD:
⚠️ تحذير مهم جدًا:

لا تعتمد على فهم المشهد أو القصة أو السياق العام.

❌ ممنوع:
- استنتاج العنف من وصف المشهد
- ربط أحداث متعددة معًا
- استخدام الفهم العام لاختيار النص

✅ المسموح فقط:
- استخراج عبارة تحتوي على العنف بشكل صريح داخل النص نفسه

إذا لم تكن عبارة العنف موجودة حرفيًا:
→ لا تُرجع أي نتيجة

النظام لا يهتم بما "تعرفه"، بل بما "تراه حرفيًا في النص"
✅ 2. STRENGTHEN MATCHING RULE

Find:

=== قاعدة المطابقة النصية ===
🔁 REPLACE WITH:
=== قاعدة المطابقة النصية (صارمة جدًا) ===

- يجب أن يكون evidence_snippet نسخة حرفية 100% من النص
- يجب أن يكون النص منسوخًا كما هو دون أي تغيير
- ممنوع إعادة الصياغة أو التلخيص
- ممنوع اختيار نص قريب أو تقريبي

⚠️ أي اختلاف ولو حرف واحد يعتبر خطأ

إذا لم تتمكن من إيجاد نص مطابق حرفيًا:
→ تجاهل الحالة بالكامل

❌ اختيار نص خاطئ أسوأ من عدم إرجاع نتيجة
✅ 3. ADD FINAL GUARD (VERY IMPORTANT)

Before:

=== المطلوب ===
🔥 ADD:
=== قاعدة التحقق قبل الإرجاع ===

قبل إرجاع أي نتيجة، تحقق من:

1. هل النص منسوخ حرفيًا من المقطع؟
2. هل يحتوي النص نفسه على تهديد أو عنف؟
3. هل يمكن فهم العنف من هذا النص وحده بدون تفسير؟

إذا كانت الإجابة "لا" لأي من هذه:
→ لا تُرجع النتيجة
🧠 WHY THIS WORKS

We are forcing model to:

SEE → VERIFY → THEN THINK

instead of:

THINK → THEN GUESS TEXT
🧪 TEST REQUIRED

Use SAME failing cases from report

Expected change:

Before	After
correct reasoning + wrong snippet ❌	correct snippet or nothing ✅
⚠️ EXPECTED EFFECT
Findings count ↓ (normal)
Snippet accuracy ↑ dramatically
Highlight success ↑
Auditor becomes more reliable
🚫 DO NOT CHANGE
schema
canonical_atom
router
auditor
🎯 SUCCESS CRITERIA
≥80% snippet correctness
near-zero unrelated snippets
no “random nearby text”

End of mission.

🧭 Captain (you) — what to expect

After this patch:

👉 The model will become more “strict and dumb”
BUT:

👉 Your system becomes more reliable and precise