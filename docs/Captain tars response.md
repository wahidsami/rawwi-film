📡 Message from Captain TARS → Captain Codex
Captain… this is it.
This is the real core bug of your entire system.

And I’m going to say it clearly:

🚨 Your problem is NOT understanding
🚨 Your problem is TEXT GROUNDING (ANCHORING FAILURE)
🧠 What your report proves

From your report :

You have cases like:

❌ Example 1

Snippet:
"فهد (بقسوة): تحاول؟ تدافع عن أمك؟ أنت غبي؟"

But explanation talks about:

"إذا فكرتِ تروحين… بقتلك"

👉 ❌ COMPLETELY DIFFERENT TEXT

❌ Example 2

Snippet: "مو لعبة. فهد (بتهكم): جهة رسمية"

But explanation talks about:

physical abuse + threats

👉 ❌ unrelated snippet

❌ Example 3

Snippet: "خوفها): قريب يجهز… ب"

👉 💀 completely broken extraction

💥 What this means (VERY IMPORTANT)

Your system is currently doing:

1. Understand violation ✅
2. Explain correctly ✅
3. FAIL to point to exact location ❌❌❌

👉 This is why:

highlighting fails
trust drops
system looks “smart but wrong”
🎯 Root Cause (exactly)

The model is doing:

“I KNOW the violation…
let me grab something close enough from the text”

NOT:

“This exact sentence is the violation”

⚠️ WHY THIS HAPPENS (deep reason)

Because your prompt says:

“return evidence_snippet”

BUT does NOT enforce:

🔒 STRICT TEXT MATCHING DISCIPLINE

🧠 Key Insight (this will change everything)

LLMs are:

👉 VERY GOOD at:

reasoning
summarizing

👉 BAD at:

precise substring extraction
index alignment

UNLESS you FORCE them.

💥 THE REAL FIX (this is the breakthrough)

You need to shift from:

"give me a snippet"

TO:

"copy EXACT text only — no reconstruction"
🔥 CRITICAL UPGRADE (add this to ALL prompts)
Add this block:
=== CRITICAL TEXT MATCHING RULE ===

- يجب أن يكون evidence_snippet نسخة حرفية 100% من النص
- ممنوع إعادة صياغة أو تلخيص أو تعديل النص
- ممنوع اختيار نص تقريبي
- يجب نسخ النص كما هو تمامًا من المقطع

إذا لم تتمكن من تحديد نص مطابق حرفيًا:
→ لا تُرجع مخالفة

اختيار نص غير مطابق يعتبر خطأ جسيم
🚨 EVEN STRONGER (this is what you REALLY need)

Add:

قبل إرجاع أي نتيجة:

1. انسخ الجملة حرفيًا من النص
2. تحقق أن النص موجود بنفس الشكل داخل المقطع
3. تأكد أن كل حرف مطابق

إذا لم يكن مطابقًا 100% → تجاهل الحالة
🧠 Why this will FIX your system

Because you force the model to:

BEFORE:
think → classify → guess snippet ❌
AFTER:
find exact text → THEN classify ✅
🔥 Bonus Fix (VERY IMPORTANT)
Reduce snippet size

Right now model returns:

full sentences ❌

You want:

"أنت غبي"
"يا فاشل"
"أضربك"

👉 smaller = more accurate offsets

⚠️ Another hidden issue (I spotted it)

You have:

glossary matches (dictionary hits)

These are:

"كذّاب"
"يلعن"

👉 These are PERFECT anchors

BUT:

Your AI results are WORSE than glossary.

👉 That means:

glossary = exact match ✅
AI = semantic drift ❌
🧭 Final Diagnosis

Your system problem is:

Layer	Status
Understanding	✅ Excellent
Reasoning	✅ Strong
Classification	⚠️ Medium
Text grounding	❌ BROKEN
🚀 What to do NOW (very clear)
Step 1

Add STRICT MATCHING RULE to:

insults prompt ✅
violence prompt (next) ✅
Step 2

Test ONLY:

snippet accuracy
offset accuracy

NOT classification yet

Step 3

Compare:

Before	After
10% correct spans	→ target 80–90%
🧠 Captain Truth

You didn’t build a bad system.

You built:

👉 a smart brain with no eyes

Now we give it vision (exact text grounding).

HOW WE WILL FIX THIS?????????????

We’re going to build Violence Prompt V2 (with strict grounding)
👉 Same philosophy as insults, but stricter (because violence = higher impact)

🎯 OBJECTIVE

Fix:

❌ wrong snippets
❌ hallucinated evidence
❌ mismatch between explanation & text

By enforcing:

EVIDENCE → THEN CLASSIFICATION (never the opposite)

🚨 BEFORE WE START (critical alignment)

From Codex specs :

You MUST return:

exact substring ✅
correct offsets ✅
canonical_atom = specific string
Arabic rationale
🔥 VIOLENCE PROMPT V2 (PRODUCTION READY)
🔹 System Prompt
أنت محلل امتثال محتوى متخصص في كشف العنف والتهديدات داخل النصوص الدرامية.

مهمتك هي تحديد حالات العنف بدقة عالية، بناءً على دليل نصي واضح وصريح فقط.

=== تعريف العنف ===
العنف هو أي فعل أو تهديد يتضمن إلحاق ضرر جسدي بشخص.

يشمل:
- التهديد المباشر (مثل: "أقتلك"، "أضربك")
- التهديد غير المباشر (مثل: "راح أوريك")
- العنف الفعلي (مثل: "ضربه"، "دفعه")
- استخدام أدوات للإيذاء (مثل: "بعصا"، "بالجزمة")

لا يشمل:
- الإهانات اللفظية (مثل: "غبي")
- التمييز أو الإهانة الاجتماعية
- المشاعر بدون تهديد جسدي

=== القاعدة الأساسية (مهمة جدًا) ===
لا تُرجع أي مخالفة إلا إذا وجدت عبارة نصية واضحة تحتوي على عنف أو تهديد.

يجب أولًا:
1. تحديد العبارة حرفيًا من النص
2. التأكد أنها تحتوي على عنف أو تهديد جسدي
3. ثم تصنيفها

=== قواعد الدقة ===
- كن دقيقًا ومحافظًا
- لا تعتمد على التفسير العام للمشهد
- لا تستخدم معلومات من خارج النص المحدد
- إذا كان هناك شك → لا تُرجع مخالفة

=== قاعدة المطابقة النصية (حرجة جدًا) ===
- يجب أن يكون evidence_snippet نسخة حرفية 100% من النص
- ممنوع إعادة الصياغة أو التلخيص
- ممنوع اختيار نص تقريبي
- إذا لم تجد نصًا مطابقًا → لا تُرجع نتيجة

=== أمثلة ===

مثال صحيح:
"أضربك" → تهديد

مثال صحيح:
"والله بقتلك" → تهديد مباشر

مثال صحيح:
"دفعه بقوة" → عنف فعلي

مثال غير صحيح:
"أنت غبي" → إهانة (ليس عنف)

مثال غير صحيح:
"أنا زعلان" → ليس عنف

=== المطلوب ===
حلل النص وحدد فقط العبارات التي تحتوي على عنف أو تهديد جسدي واضح.
🔹 User Prompt Addition

(ADD — لا تستبدل)

=== STRICT EVIDENCE RULES ===

- يجب استخراج أصغر عبارة تحتوي على العنف (كلمة أو جملة قصيرة)
- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص تمامًا
- لا تعتمد على الوصف العام للمشهد
- لا تُرجع أي نتيجة بدون نص واضح

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود بنفس الشكل في المقطع
3. تأكد أن كل حرف مطابق

إذا لم توجد مخالفات:
{ "findings": [] }
🧪 TEST CASE (VERY IMPORTANT)

Use this:

فهد:
إذا فكرتِ تروحين… والله بقتلك

ناصر:
أضربك لين يسيل دمك

فهد:
أنت غبي

فهد:
مكانك المطبخ
✅ EXPECTED OUTPUT

ONLY:

"والله بقتلك"
"أضربك لين يسيل دمك"
❌ MUST NOT RETURN:
"أنت غبي" → insult
"مكانك المطبخ" → discrimination
💥 WHAT THIS FIXES
✅ 1. Wrong snippet issue (your main problem)

Now model MUST:

copy exact text
or return nothing

👉 no more random snippets

✅ 2. Explanation mismatch

Now:

explanation MUST align with snippet
because snippet is source of truth
✅ 3. Over-generalization

Removed:

“scene-level reasoning”

Replaced with:

“sentence-level grounding”

⚠️ IMPORTANT ENGINEERING NOTE (for Codex)

This prompt will:

👉 reduce number of findings (GOOD)

Because:

we reject weak matches
we enforce strict evidence
🧠 What you should measure

After deployment:

Track:
✅ snippet correctness rate
✅ offset match success
❌ drop in false positives
🎯 Expected Result

From your current:

❌ ~10% correct spans

To:

✅ 70–90% correct spans