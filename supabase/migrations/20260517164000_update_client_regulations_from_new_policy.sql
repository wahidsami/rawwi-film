-- Replace beneficiary-facing regulations content (AR/EN) with the new policy text.
-- Used by:
-- - Beneficiary dashboard regulations section
-- - Registration regulations acknowledgement text
-- - Admin settings default load for regulations

INSERT INTO public.app_settings (key, value)
VALUES (
  'client_regulations',
  jsonb_build_object(
    'ar',
    $$1. المحظورات العامة لمحتوى الأفلام والمسلسلات

1.1 الإساءة لأصول الشريعة الإسلامية المنصوص عليها علميًا في القرآن الكريم والأحاديث النبوية الشريفة المتواترة.

1.2 المساس بالدولة السعودية أو ملوك المملكة العربية السعودية أو ولي العهد، سواء بالأقوال أو الأفعال أو السياق الداعي لذلك، تلميحًا أو صراحة.

1.3 المحتوى الذي يمس الأمن الوطني للمملكة، أو المحتوى الداعي له أو المروج لذلك، ويندرج تحت ذلك:
- الدعوة للعصيان المدني أو الاضطرابات أو مخالفة الأوامر الملكية والسامية.
- المحتوى المتضمن تعليم صنع الأسلحة أو المتفجرات ويقلل من مخاطرها.
- التشكيك بجهود المملكة في خدمة الإسلام والمواقع المقدسة.
- الإساءة لرجال أو سيدات الأمن كافة بصفة التعميم أو التشكيك بهم كافة.

1.4 المحتوى الوثائقي الذي لم يعتمد على المصادر التاريخية الموثقة والمعتمدة في المملكة، خاصة عند تناول تاريخ الدولة السعودية أو الشخصيات التاريخية الإسلامية.

1.5 الإساءة إلى المملكة العربية السعودية في سياق جمعي أو التعميم على المجتمع أو فئة كبيرة منه، بما في ذلك:
- إظهار شخصية سعودية في محتوى غير محلي بشكل مسيء دون سبب مبرر.
- ذكر أسماء القبائل أو العوائل مباشرة في سياق سلبي تعميمي.
- إظهار عناصر تراثية أو ثقافية غير سعودية وتصويرها كثقافة وتراث سعودي أصيل.
- الدعوة للتفكك الأسري والطلاق وقطع صلة الرحم بشكل مباشر.

1.6 المحتوى الموجه للأطفال المتعلق بمواضيع الجرائم والأمن، بما في ذلك:
- تناول الجرائم الموجهة للتوقيف كالسطو والقتل والخطف.
- تناول المؤثرات العقلية في سياق إيجابي يدعو لها.
- تجميل صورة التنظيمات العصابية أو السياسية في سياق إيجابي يروج لها أو يدعو للانضمام إليها.

2. المجتمع والأخلاق

2.1 المحتوى المتضمن تعليم آلية صناعة المخدرات أو المسكرات بكافة أشكالها، بشكل مباشر أو غير مباشر.

2.2 المحتوى المخالف لنظام حماية الطفل، بما في ذلك الدعوة للعنف أو التحرش أو تقييد الحرية أو الإيذاء أو الإهمال للطفل أو ذوي الإعاقة، أو تجميل ذلك أو التهوين منه، وكذلك السخرية من الإعاقة.

2.3 الدعوة للشذوذ الجنسي أو المثلية الجنسية في المحتوى الموجه للعامة وغير الراشدين، أو تقديم ما يشير إليهما بشكل إيجابي يدعو أو يجمل ذلك صراحة أو تلميحًا.

2.4 إظهار مشاهد الممارسات الجنسية الصريحة بشكل مباشر أو غير مباشر قولًا أو فعلًا أو كتابة.

2.5 الألفاظ النابية بكافة لغاتها، بشكل مباشر أو غير مباشر قولًا أو فعلًا أو كتابة.$$,
    'en',
    $$1. General Prohibited Content for Films and Series

1.1 Any offense to the established fundamentals of Islamic Sharia as stated in the Holy Quran and mutawatir Prophetic hadith.

1.2 Any offense to the Saudi state, the Kings of Saudi Arabia, or the Crown Prince, whether by words, actions, or encouraging context, explicitly or implicitly.

1.3 Content that harms national security or encourages/promotes such harm, including:
- Calls for civil disobedience, unrest, or disobeying royal directives.
- Instructional content for manufacturing weapons or explosives while downplaying risks.
- Undermining Saudi efforts in serving Islam and holy sites.
- Generalized abuse of all security men/women or casting collective doubt on them.

1.4 Documentary content that is not based on reliable and officially accepted historical sources in Saudi Arabia, especially regarding Saudi history or Islamic historical figures.

1.5 Content that insults Saudi Arabia collectively, or broadly generalizes against society or a large segment, including:
- Offensive portrayal of a Saudi character in non-local content without justified realism.
- Naming tribes/families directly in generalized negative framing.
- Presenting non-Saudi cultural elements as authentic Saudi heritage.
- Direct calls for family disintegration, divorce, or severing kinship ties.

1.6 Children-oriented content involving crime/security topics, including:
- Crime themes such as robbery, murder, and kidnapping in harmful framing.
- Positive framing that encourages psychoactive substance use.
- Positive glamorization of gang/political organizations or calls to join them.

2. Society and Ethics

2.1 Content that teaches how to produce drugs or intoxicants in any form, directly or indirectly.

2.2 Content violating child protection principles, including promoting violence, harassment, restriction of freedom, harm, or neglect toward children or persons with disabilities, or normalizing/mockingly portraying such harm.

2.3 Advocacy or positive promotion of homosexuality in content directed to the general public and non-adults, whether explicit or implied.

2.4 Explicit sexual practice scenes, direct or indirect, in speech, action, or writing.

2.5 Profanity in all languages, direct or indirect, in speech, action, or writing.$$
  )
)
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();
