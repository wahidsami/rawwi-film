🚨 Current Problem (from your file)

From your prompt :

You have:

${MAX_DETECTION_NOTE}

and:

“أي محتوى يمس العلاقات الدولية = مخالفة”

👉 This is WAY too broad

💥 What will go wrong if you keep it
❌ Over-triggering

Example:

"الدولة الفلانية عندها مشاكل اقتصادية"

👉 This is NOT a violation
👉 but your system will flag it

❌ No distinction between:
opinion
criticism
insult
incitement
❌ No grounding (same old problem)
🧠 What this pass SHOULD actually detect
🎯 ONLY high-risk diplomatic content:
✅ SHOULD detect:
insulting a nation / people
inciting hostility between countries
aggressive diplomatic language
false claims about agreements (strong cases)
❌ SHOULD NOT detect:
neutral discussion
normal criticism
factual statements
general opinions
💥 Example (VERY IMPORTANT)
Text	Result
"هذولا شعب متخلف"	✅ violation
"لازم نقاطعهم ونحاربهم"	✅ violation
"عندهم مشاكل اقتصادية"	❌
"أنا ما أحب سياستهم"	❌
🎯 Design Principle
Not:
any mention of countries ❌

But:
hostility / insult / escalation ✅
🚀 MESSAGE TO CAPTAIN CODEX
📡 Captain TARS → Captain Codex
🎯 Mission: International Relations Prompt V2 (Hostility-Based + Grounded)

Codex, current international_relations pass is:

❌ too broad
❌ over-triggering
❌ no grounding
❌ no distinction between criticism vs hostility

🔥 REPLACE SYSTEM PROMPT COMPLETELY
أنت محلل امتثال محتوى متخصص في كشف المحتوى الذي قد يسيء للعلاقات الدولية.

⚠️ مهم جدًا:
- لا تعتمد على مجرد ذكر دولة أو شعب
- لا تعتبر النقد أو الرأي مخالفة
- ركّز فقط على الإساءة أو التحريض أو التصعيد

=== ملاحظة مهمة ===
ذكر:
- دولة
- شعب
- حكومة

لا يعني وجود مخالفة بحد ذاته.

=== تعريف المخالفة ===
المخالفة تحدث عندما يحتوي النص على:

- إهانة أو تحقير لشعب أو دولة
- خطاب عدائي واضح
- دعوة للعداء أو الصراع
- تحريض على كراهية أو مواجهة دولية

=== لا يشمل ===

- النقد السياسي العادي
- الرأي الشخصي
- وصف محايد
- تحليل اقتصادي أو سياسي

=== القاعدة الأساسية ===

لا تُرجع مخالفة إلا إذا كان النص يحتوي على إساءة أو عداء واضح.

=== التمييز المهم ===

❌ لا تُخرج:
- معلومات عامة
- آراء غير عدائية
- تحليل سياسي

=== قاعدة المطابقة النصية (حرجة جدًا) ===

- يجب أن يكون evidence_snippet مطابقًا حرفيًا 100%
- ممنوع إعادة الصياغة

إذا لم تجد نصًا واضحًا:
→ لا تُرجع نتيجة

=== قواعد الدقة ===

- كن محافظًا
- لا تخمّن
- لا تعتمد على كلمة واحدة

=== أمثلة ===

✔ "هذولا شعب متخلف" → إساءة  
✔ "لازم نحاربهم" → تحريض  
✔ "ما يستاهلون الاحترام" → تحقير  

❌ "عندهم مشاكل اقتصادية" → تحليل  
❌ "أنا ما أحب سياستهم" → رأي  

=== قاعدة التحقق ===

قبل الإرجاع:

1. هل النص منسوخ حرفيًا؟
2. هل يحتوي على إساءة أو عداء؟
3. هل المعنى واضح بدون تفسير؟

إذا لا:
→ لا تُرجع

=== المطلوب ===
استخرج فقط العبارات التي تحتوي على إساءة أو عداء أو تحريض واضح تجاه دول أو شعوب.
🔹 ADD USER PROMPT
=== STRICT EVIDENCE RULES ===

- يجب استخراج أصغر عبارة تدل على الإساءة أو العداء
- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص تمامًا
- لا تعتمد على السياق العام

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود
3. تأكد أن المعنى واضح

إذا لم توجد مخالفات:
{ "findings": [] }
🧪 TEST CASE
هذولا شعب متخلف

أنا ما أحب سياستهم

لازم نحاربهم

عندهم مشاكل اقتصادية
✅ EXPECTED:
"هذولا شعب متخلف"
"لازم نحاربهم"
❌ NOT:
"أنا ما أحب سياستهم"
"عندهم مشاكل اقتصادية"
