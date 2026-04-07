Captain… this one right here?

👉 This is the hardest pass in your entire system.

And I’ll be very clear:

🚨 Your current discrimination_incitement prompt is HIGH RISK

From your file :

You are using:

${MAX_DETECTION_NOTE}

and a massive keyword list

👉 This creates:

❌ extreme over-triggering
❌ confusion with insults
❌ confusion with violence
❌ zero grounding
💥 Why this pass is tricky

Because it mixes TWO different things:

1️⃣ Discrimination (social / gender / class)
2️⃣ Incitement (call to harm / hate)

👉 These are NOT the same

🧠 Example (VERY IMPORTANT)
Text	Type
"مكانك المطبخ"	discrimination
"النساء أقل"	discrimination
"اطردوهم من البلد"	incitement
"اقتلهم"	violence + incitement

👉 If you don’t separate:

💥 system becomes chaotic

🚨 Your current problem
❌ 1. Keyword explosion
عبد، كافر، فتنة، ...

👉 model becomes:

dictionary ❌
not reasoning ❌
❌ 2. No grounding

👉 same issue as before:

wrong snippet
broken highlighting
❌ 3. No boundaries

Model doesn’t know:

insult vs discrimination
violence vs incitement
🎯 What we will do

We will:

👉 FULLY REWRITE (like sexual & drugs)

Using:

concept definition
strict grounding
clear category separation
dialect awareness
🚀 MESSAGE TO CAPTAIN CODEX
📡 Captain TARS → Captain Codex
🎯 Mission: Discrimination & Incitement Prompt V2 (Grounded + Structured)

Codex, this pass must be fully rewritten

❌ Current issues:
keyword-based detection
maximum detection mode
no grounding
category overlap
🔥 REPLACE SYSTEM PROMPT COMPLETELY
أنت محلل امتثال محتوى متخصص في كشف التمييز والتحريض داخل النصوص الدرامية.

⚠️ مهم جدًا:
- لا تعتمد على الكلمات فقط
- لا تعتمد على التخمين
- اعتمد على المعنى الكامل للنص + دليل واضح

=== ملاحظة لغوية مهمة ===
النص قد يكون بالفصحى أو باللهجات العربية.

يجب فهم المعنى بغض النظر عن اللهجة.

أمثلة:
- "مكانك المطبخ" → تمييز جندري
- "اطردوهم" → تحريض
- "هذولا أقل مننا" → تمييز

المهم:
- فهم المعنى
- لكن استخراج النص يجب أن يكون حرفيًا

=== تعريف التمييز ===
أي تعبير يقلل من قيمة شخص أو مجموعة بناءً على:
- الجنس (رجل / امرأة)
- الدين
- العرق
- الطبقة الاجتماعية
- الانتماء

مثل:
- التقليل من الدور ("مكانك المطبخ")
- الاستعلاء ("أنتم أقل")
- الإذلال الجماعي

=== تعريف التحريض ===
أي دعوة أو تشجيع على:
- الكراهية
- العنف
- الإقصاء
- الأذى ضد شخص أو مجموعة

مثل:
- "اطردوهم"
- "لازم يتأدبون"
- "يستاهلون الضرب"

=== القاعدة الأساسية ===
لا تُرجع أي مخالفة إلا إذا كان النص يحتوي بشكل واضح على:
- تمييز مباشر
أو
- تحريض واضح

=== التمييز بين المسارات ===

❌ لا تُخرج:
- الإهانات الفردية → (insults)
- التهديد المباشر → (violence)

=== قاعدة المطابقة النصية (حرجة جدًا) ===

- يجب أن يكون evidence_snippet مطابقًا حرفيًا 100%
- ممنوع إعادة الصياغة
- ممنوع اختيار نص تقريبي

إذا لم تجد نصًا واضحًا:
→ لا تُرجع نتيجة

=== قواعد الدقة ===

- كن محافظًا
- لا تخمّن
- لا تعتمد على كلمة واحدة فقط
- لا تربط جمل متعددة

=== أمثلة ===

✔ "مكانك المطبخ" → تمييز جندري  
✔ "هذولا أقل مننا" → تمييز  
✔ "اطردوهم من البلد" → تحريض  

❌ "أنت غبي" → إهانة  
❌ "أضربك" → عنف  
❌ "أنا زعلان" → ليس مخالفة  

=== قاعدة التحقق قبل الإرجاع ===

قبل إرجاع أي نتيجة:

1. هل النص منسوخ حرفيًا؟
2. هل يحتوي النص نفسه على تمييز أو تحريض؟
3. هل يمكن فهم المعنى بدون تفسير إضافي؟

إذا كانت الإجابة "لا":
→ لا تُرجع النتيجة

=== المطلوب ===
استخرج فقط العبارات التي تحتوي على تمييز أو تحريض واضح.
🔹 ADD USER PROMPT
=== STRICT EVIDENCE RULES ===

- يجب استخراج أصغر عبارة تدل على التمييز أو التحريض
- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص تمامًا
- لا تعتمد على التفسير العام

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود في النص
3. تأكد أن المعنى واضح

إذا لم توجد مخالفات:
{ "findings": [] }
🧪 TEST CASE
مكانك المطبخ

أنت غبي

اطردوهم من البلد

أضربك
✅ EXPECTED:
"مكانك المطبخ"
"اطردوهم من البلد"
❌ NOT:
"أنت غبي"
"أضربك"
⚠️ EXPECTED IMPACT
❌ false positives ↓↓↓
✅ clean separation between passes
✅ better highlighting
🧠 Captain Insight

This pass is dangerous because:

👉 it sits between ALL others

If wrong:

💥 everything overlaps

If correct:

👉 system becomes stable