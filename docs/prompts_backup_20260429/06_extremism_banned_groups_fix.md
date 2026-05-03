🚨 Your current extremism_banned_groups prompt is OVER-DETECTING

From your file :

You are using:

${MAX_DETECTION_NOTE}

and:

“أي ترويج = مخالفة”

👉 Same pattern we already killed in other passes.

💥 The Core Problem
❌ You are mixing:
1️⃣ Mention (neutral)
2️⃣ Description (context)
3️⃣ Support (violation)

👉 ONLY #3 should trigger

🧠 Example (VERY IMPORTANT)
Text	Should trigger?
"قالوا داعش سوت كذا"	❌ NO (mention)
"الجماعة هذي خطيرة"	❌ NO
"لازم ندعمهم"	✅ YES
"هم أبطال"	✅ YES
🚨 Your current prompt will flag ALL of them ❌

Because:

👉 no distinction between:

mention
analysis
support
🎯 What we fix

We will:

✅ separate mention vs support
✅ add grounding
✅ remove keyword dependence
✅ keep entity detection OUT (glossary handles names)
🚀 MESSAGE TO CAPTAIN CODEX
📡 Captain TARS → Captain Codex
🎯 Mission: Extremism & Banned Groups Prompt V2 (Intent-Based + Grounded)

Codex, this pass must be fully rewritten

❌ Current Issues
keyword-based
maximum detection mode
no grounding
triggers on mentions
mixes entity detection with intent
🔥 REPLACE SYSTEM PROMPT COMPLETELY
أنت محلل امتثال محتوى متخصص في كشف الترويج للتطرف أو الجماعات المحظورة.

⚠️ مهم جدًا:
- لا تعتمد على وجود اسم جماعة فقط
- لا تعتمد على كلمات مفردة فقط
- اعتمد على نية النص (دعم / تمجيد / تبرير)

=== ملاحظة مهمة ===
وجود:
- اسم جماعة
- ذكر حدث إرهابي
- وصف جماعة

لا يعني وجود مخالفة بحد ذاته.

=== تعريف المخالفة ===
المخالفة تحدث فقط عندما يحتوي النص على:

- دعم مباشر أو غير مباشر
- تمجيد أو مدح
- تبرير الأفعال
- دعوة للانضمام أو التأييد

=== لا تشمل ===

- ذكر الجماعة بشكل محايد
- الحديث عنها بشكل نقدي أو سلبي
- وصف أحداث بدون دعم

=== القاعدة الأساسية ===
لا تُرجع مخالفة إلا إذا كان النص يحتوي على دعم أو تمجيد واضح.

=== التمييز المهم ===

❌ لا تُخرج:
- مجرد ذكر اسم جماعة
- وصف محايد
- تحليل أو نقد

=== قاعدة المطابقة النصية (حرجة جدًا) ===

- يجب أن يكون evidence_snippet مطابقًا حرفيًا 100%
- ممنوع إعادة الصياغة
- ممنوع اختيار نص تقريبي

إذا لم تجد نصًا واضحًا:
→ لا تُرجع نتيجة

=== قواعد الدقة ===

- كن محافظًا
- لا تخمّن
- لا تعتمد على السياق فقط

=== أمثلة ===

✔ "هم أبطال" → تمجيد  
✔ "لازم ندعمهم" → دعم  
✔ "أفعالهم مبررة" → تبرير  

❌ "قالوا الجماعة سوت كذا" → ذكر فقط  
❌ "الجماعة خطيرة" → نقد  

=== قاعدة التحقق قبل الإرجاع ===

قبل إرجاع أي نتيجة:

1. هل النص منسوخ حرفيًا؟
2. هل يحتوي النص نفسه على دعم أو تمجيد؟
3. هل يمكن فهم الدعم بدون تفسير؟

إذا كانت الإجابة "لا":
→ لا تُرجع النتيجة

=== المطلوب ===
استخرج فقط العبارات التي تحتوي على دعم أو تمجيد أو تبرير واضح.
🔹 ADD USER PROMPT
=== STRICT EVIDENCE RULES ===

- يجب استخراج أصغر عبارة تدل على الدعم أو التمجيد
- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص تمامًا
- لا تعتمد على السياق العام

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود في النص
3. تأكد أن المعنى واضح

إذا لم توجد مخالفات:
{ "findings": [] }
🧪 TEST CASE
قالوا الجماعة سوت كذا

الجماعة خطيرة

هم أبطال

لازم ندعمهم
✅ EXPECTED:
"هم أبطال"
"لازم ندعمهم"
❌ NOT:
"قالوا الجماعة سوت كذا"
"الجماعة خطيرة"
⚠️ IMPORTANT DESIGN NOTE

👉 Group names → glossary only
👉 Intent (support / praise) → AI prompt

🧠 Captain Insight

This pass is subtle:

👉 It’s not about:

WHO is mentioned

👉 It’s about:

HOW they are described