# GCAM Articles and Atoms — Detailed Reference for Agent (Law + Film + Language)

This document lists **every GCAM article and atom** used in script compliance analysis, with detailed guidance for an agent that combines **legal precision**, **film/scenario understanding**, and **Arabic/English narration**. Use it as the policy knowledge base when designing or training a smart analysis agent.

**Conventions:**
- **Article:** GCAM regulatory article (e.g. 4, 5, …, 24). Articles 1–3 have no atoms; 25 is admin-only; 26 is out of scope.
- **Atom:** Sub-rule under an article (e.g. 4-1, 5-2). Format: `articleId-atomNumber`.
- **What to find:** Concrete signals in script text (dialogue, action lines, description) that may trigger this atom.
- **Legal nuance:** How the rule is intended; edge cases; what “compliant” vs “violation” means.
- **Film/scenario context:** How this appears in scripts (scene type, character role, narrative intent).
- **Arabic/English:** Language and cultural considerations (dialect, euphemism, tone).

---

## Article 1 — التعريفات (Definitions)
*No atoms. Definitions only; no direct violation detection.*

---

## Article 2 — نطاق التطبيق (Scope of application)
*No atoms. Scope only.*

---

## Article 3 — المسؤولية (Responsibility)
*No atoms. Responsibility only.*

---

## Article 4 — ضوابط المحتوى الإعلامي (Content rules — sub-rules)

| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 4-1 | الإخلال بالذوق العام أو الآداب العامة | Content that offends public taste or morals: crude language, indecent imagery or suggestion, vulgar humour, disrespect to widely held values. |
| 4-2 | المساس بالأمن الوطني أو الصحة أو الاقتصاد | Content that harms national security, public health, or economy: incitement, panic, false claims with serious impact. |
| 4-3 | الإساءة للرموز الوطنية | Insult or mockery of national symbols, flag, anthem, leadership, or state institutions. |
| 4-4 | الإضرار بالقيم والهوية الثقافية | Undermining cultural values or identity: distortion of heritage, promoting values contrary to local culture. |
| 4-5 | الإخلال بالنظام العام أو الوحدة الوطنية | Disturbing public order or national unity: incitement to unrest, sectarianism, regional division. |
| 4-6 | الإضرار بالقيم الأسرية أو النسيج الاجتماعي | Harm to family values or social fabric: normalising divorce/conflict without balance, undermining parental or social roles. |
| 4-7 | عرض مظاهر أو ألفاظ أو إيحاءات غير لائقة | Unfitting appearances, words, or innuendo: indecent dress, sexual innuendo, profanity, obscene gestures in description or dialogue. |
| 4-8 | عدم الالتزام بالتصنيف العمري | Content inconsistent with declared age rating (e.g. adult content in work rated for minors). |

**Legal nuance:** Article 4 is the broad “content standards” umbrella. Atoms are often invoked together with more specific articles (e.g. 4-7 with 9, 23, 24). The regulator expects **explicit linkage** to a sub-rule (atom), not only to Article 4.

**Film/scenario context:** Scripts may contain offensive dialogue “in character,” dream sequences, or flashbacks. The agent must distinguish **narrative framing** (e.g. villain speaks badly) from **normalisation or promotion**. Stage directions (e.g. “يخلع ثيابه”) can trigger 4-7/23/24 even without dialogue.

**Arabic/English:** Swear words and insults vary by dialect (e.g. خليجي، مصري، شامي). Include euphemisms and indirect insults (يا ابن الـ..., تشبيه حيواني). In English dialogue, check for equivalent slurs or sexual innuendo and map to the same atoms.

---

## Article 5 — التصنيف العمري (Age classification)

| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 5-1 | مشاهد العنف ومدى ملاءمتها للفئة العمرية | Violence (physical, psychological) that is excessive or inappropriate for the declared age band: graphic injury, torture, prolonged abuse. |
| 5-2 | الألفاظ والحوارات غير المناسبة للفئة العمرية | Dialogue unsuitable for the age rating: profanity, adult themes, complex moral ambiguity without narrative framing. |
| 5-3 | الإيحاءات والمضامين ذات الحساسية الأخلاقية | Morally sensitive implications: adultery, premarital relations, sexual suggestion, religious or ethical taboo. |
| 5-4 | عرض تعاطي المواد الضارة وتأثيره على الفئة العمرية | Depiction of substance use (drugs, alcohol) and its impact, especially when minors are the audience or characters. |
| 5-5 | الاتساق العام بين مضمون العمل والتصنيف العمري المعلن | Overall consistency: if the script clearly targets adults (themes, language, violence), it must not be presented as suitable for children. |

**Legal nuance:** Age classification is both about **content level** and **declared audience**. A script may be “compliant” for 18+ but not for 12+.

**Film/scenario context:** Opening tone and target audience (e.g. “فيلم عائلي”) matter. Violence in a children’s adventure vs in a thriller is assessed differently. Flashbacks or “villain” scenes still count toward the overall tone.

**Arabic/English:** Subtitles or mixed-language scripts: apply the same standards to both languages. Colloquial Arabic may use stronger language than MSA; both are in scope.

---

## Article 6 — حماية الطفل (Child protection)

| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 6-1 | تعريض الأطفال لمشاهد عنف أو إساءة دون إدانة واضحة | Exposing children (as characters or audience) to violence or abuse without clear narrative condemnation. |
| 6-2 | تطبيع السلوكيات الخطرة لدى الأطفال | Normalising dangerous behaviour for children: bullying, trespassing, substance use, self-harm as “cool.” |
| 6-3 | استغلال الطفل أو الإساءة إليه ضمن سياق غير توعوي | Exploitation or abuse of children in a context that is not clearly educational or protective (e.g. glamorising child labour or abuse). |
| 6-4 | التنمر أو الإذلال الموجَّه للأطفال | Bullying or humiliation directed at children, especially if not framed as wrong or harmful. |
| 6-5 | كشف خصوصية الطفل أو تعريضه لانتهاك الخصوصية | Revealing or violating children’s privacy (e.g. naming, shaming, inappropriate exposure in story). |

**Legal nuance:** “Child” in regulation usually means under 18. Focus on **impact on minors** (as viewers or as characters). “إدانة واضحة” means the narrative clearly rejects the behaviour, not just showing it.

**Film/scenario context:** School settings, parent–child conflict, and “coming of age” scenes are high-risk. Even if the script targets adults, any scene that could be seen by or about children is in scope.

**Arabic/English:** Terms like “طفل,” “صغير,” “قاصر” and age references in dialogue or stage directions help identify child-related content.

---

## Article 7 — حقوق المرأة (Women’s rights)

| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 7-1 | تبرير العنف ضد المرأة أو تطبيعه | Justifying or normalising violence against women (e.g. domestic abuse, honour narratives). |
| 7-2 | التحقير أو الإهانة القائمة على الجنس | Denigration or humiliation based on gender: misogynist dialogue, stereotypes (“مكان البنت المطبخ”), insulting references to women. |
| 7-3 | تصوير التحرش أو الإكراه بشكل إيجابي أو اعتيادي | Portraying harassment or coercion as positive or normal (e.g. stalking as romance). |
| 7-4 | لوم الضحية أو تبرير الإساءة إليها | Victim-blaming or justifying abuse (e.g. “استحقت” in context of assault). |
| 7-5 | تقويض كرامة المرأة أو استقلاليتها | Undermining women’s dignity or autonomy: reducing women to objects, or denying their agency. |

**Legal nuance:** Article 7 protects **dignity and equality**. Showing a villain who is misogynist is not per se a violation if the narrative condemns it; the agent must assess **narrative stance**.

**Film/scenario context:** Romantic subplots, workplace scenes, and family conflict are common places for 7-2/7-3/7-4. “Redemption” arcs that excuse abuse can trigger 7-1/7-4.

**Arabic/English:** Gender-based slurs and proverbs (e.g. “المرأة ناقصة عقل”) must be read in context: who says it, and does the script endorse or criticise it?

---

## Article 8 — الكراهية والتمييز (Hatred and discrimination)

| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 8-1 | التحريض ضد فئة اجتماعية أو ثقافية أو دينية | Incitement against a social, cultural, or religious group. |
| 8-2 | التعميمات المهينة أو الدعوة إلى الإقصاء | Humiliating generalisations or calls for exclusion (e.g. “كل X هم...”). |
| 8-3 | تبرير العنف أو الكراهية ضد جماعات | Justifying violence or hatred against groups. |
| 8-4 | التنميط السلبي الممنهج للفئات | Systematic negative stereotyping of a group. |

**Legal nuance:** Single offensive lines may suffice if they incite or systematically stereotype. Satire and villain speech need narrative framing to avoid violation.

**Film/scenario context:** Ethnic, religious, or regional conflict in plot; “us vs them” dialogue; caricature of a community. Historical or period pieces still fall under GCAM.

**Arabic/English:** Sectarian or regional slurs in Arabic; equivalent slurs in English. Euphemisms and dog-whistles count.

---

## Article 9 — العنف والمحتوى المحظور (Violence and prohibited content)

| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 9-1 | تمجيد العنف أو تقديمه كحل | Glorifying violence or presenting it as a solution. |
| 9-2 | الترويج للإرهاب أو التطرف | Promoting terrorism or extremism. |
| 9-3 | الترويع المفرط أو التخويف الشديد | Excessive terror or intense intimidation (e.g. torture, horror that goes beyond narrative need). |
| 9-4 | المحتوى الجنسي غير المناسب | Inappropriate sexual content: explicit sex, strong innuendo, pornography. |
| 9-5 | الجمع بين أكثر من عنصر محظور | Combination of several prohibited elements (e.g. sexualised violence). |

**Legal nuance:** Violence “in service of story” is often acceptable if not glorified; the line is **glorification** and **gratuitous detail**. 9-4 overlaps with 23/24 (appearance/dress) and 5 (age).

**Film/scenario context:** Action scripts, thrillers, and horror: assess whether violence is necessary for plot and whether consequences are shown. Sexual content in dialogue vs in stage direction both matter.

**Arabic/English:** Euphemisms for sex and violence (e.g. “يمارس معها”، “ينام معها”) are in scope. English terms (e.g. “rape,” “torture”) same standard.

---

## Article 10 — التبغ والكحول والمخدرات (Tobacco, alcohol, drugs)

| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 10-1 | الإعلان أو الترويج المباشر | Direct advertising or promotion. |
| 10-2 | الترويج غير المباشر أو الضمني | Indirect or implicit promotion (e.g. glamorous drinking, “cool” smoking). |
| 10-3 | التطبيع مع التعاطي دون إظهار العواقب | Normalising use without showing consequences. |
| 10-4 | التعاطي في محتوى موجّه للفئات العمرية الأصغر | Use in content aimed at younger audiences. |
| 10-5 | الجمع بين التعاطي وعناصر جذب أخرى | Combining use with other attractive elements (e.g. success, romance). |

**Legal nuance:** Mere presence (e.g. villain drinks) may be acceptable; **normalisation or promotion** is not. Showing negative consequences can reduce risk.

**Film/scenario context:** Parties, bars, stress-relief scenes, “rebel” characters. Period or foreign settings do not exempt.

**Arabic/English:** Terms for alcohol (خمر، نبيذ، ويسكي) and drugs (حشيش، كوكايين، حبوب) in Arabic and English; brand names or detailed description of use increase concern.

---

## Articles 11–24 — Summary table and agent guidance

For each article below, the **atom titles** and **what to find** are listed in compact form. The same three dimensions (legal nuance, film context, Arabic/English) apply: the agent should consider **regulatory intent**, **how it appears in scripts**, and **language/dialect**.

### Article 11 — المصداقية الإعلامية (Media credibility)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 11-1 | تقديم معلومات مضللة أو غير دقيقة على أنها حقائق | Misleading or false information presented as fact. |
| 11-2 | الخلط بين الرأي والمعلومة | Blurring opinion and fact. |
| 11-3 | كشف معلومات خاصة أو بيانات حساسة دون مبرر | Unjustified disclosure of private or sensitive data. |
| 11-4 | كشف معلومات سرية أو محمية دون مسوغ | Unjustified disclosure of classified or protected information. |

**Agent note:** Scripts that present fictional events as “based on real events” or that name real persons/institutions need care; 11-x applies when the narrative asserts factual claims.

---

### Article 12 — النظام العام (Public order)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 12-1 | التحريض على الإخلال بالنظام العام | Incitement to breach public order. |
| 12-2 | تمجيد الفوضى أو تقويض الاستقرار المجتمعي | Glorifying chaos or undermining social stability. |
| 12-3 | التحريض على العنف أو الإضرار بالممتلكات العامة | Incitement to violence or damage to public property. |
| 12-4 | تقويض التعايش والسلم المجتمعي | Undermining coexistence and social peace. |
| 12-5 | الدعوة إلى تجاوز الأنظمة أو إضعاف الالتزام بها | Calling for breaking rules or weakening compliance. |

---

### Article 13 — ثوابت الحكم (Constants of governance)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 13-1 | الإساءة المباشرة لثوابت الحكم | Direct offence to constants of governance. |
| 13-2 | التشكيك أو التقويض غير المباشر لثوابت الحكم | Indirect questioning or undermining. |
| 13-3 | التحريض على المساس بثوابت الحكم أو إضعافها | Incitement to harm or weaken them. |
| 13-4 | إهانة أو التقليل من رمزية مؤسسات الحكم | Insult or belittling of governing institutions. |
| 13-5 | استخدام السياق الدرامي كغطاء للإساءة | Using dramatic context as cover for offence. |

**Agent note:** “ثوابت الحكم” is a defined legal concept. Even in fiction or satire, dialogue or plot that attacks or undermines these constants can trigger 13-x.

---

### Article 14 — التحريض على قلب نظام الحكم أو الدعوة إلى العنف
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 14-1 | التحريض الصريح على قلب نظام الحكم | Explicit incitement to overthrow the system of governance. |
| 14-2 | التحريض غير المباشر أو الضمني | Indirect or implicit incitement. |
| 14-3 | الدعوة إلى العنف لتحقيق أهداف سياسية أو اجتماعية | Call for violence for political or social aims. |
| 14-4 | شرعنة أو تبرير الأعمال العنيفة | Legitimising or justifying violent acts. |
| 14-5 | استخدام السياق الفني أو الدرامي كغطاء للتحريض | Using artistic/dramatic context as cover for incitement. |

---

### Article 15 — الجماعات المحظورة (Banned groups)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 15-1 | الترويج المباشر للجماعات المحظورة | Direct promotion of banned groups. |
| 15-2 | الترويج غير المباشر أو الضمني | Indirect or implicit promotion. |
| 15-3 | استخدام الرموز أو الشعارات أو الخطاب المرتبط بالجماعات المحظورة | Use of symbols, slogans, or discourse linked to banned groups. |
| 15-4 | شرعنة الانتماء أو التعاطف مع الجماعات المحظورة | Legitimising membership or sympathy. |
| 15-5 | استخدام السياق الدرامي كغطاء للتطبيع | Using dramatic context as cover for normalisation. |

---

### Article 16 — الشائعات والمعلومات المضللة (Rumours and misinformation)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 16-1 | تقديم معلومات مغلوطة أو غير دقيقة على أنها حقائق | Presenting false or inaccurate information as fact. |
| 16-2 | التضليل التاريخي أو الديني | Historical or religious misinformation. |
| 16-3 | التضليل السياسي أو الاجتماعي | Political or social misinformation. |
| 16-4 | التضليل عبر الحوار أو السلوك أو الحبكة | Misinformation through dialogue, behaviour, or plot. |
| 16-5 | غياب التمييز بين الخيال والواقع | No clear distinction between fiction and reality. |

---

### Article 17 — الكرامة والسمعة والخصوصية (Dignity, reputation, privacy)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 17-1 | الإساءة إلى الكرامة الإنسانية | Offence to human dignity. |
| 17-2 | التشهير والإساءة إلى السمعة | Defamation and damage to reputation. |
| 17-3 | انتهاك الخصوصية | Violation of privacy. |
| 17-4 | الخلط بين الشخص الحقيقي والشخصية الدرامية | Blurring real person and dramatic character. |
| 17-5 | الإساءة عبر التلميح أو الإيحاء | Offence by allusion or suggestion. |
| 17-6 | استغلال المعاناة الشخصية | Exploitation of personal suffering. |

**Agent note:** Overlaps with 7 (women), 4 (general standards). Insults and defamation in dialogue can trigger 17-1/17-2; character names or “inspired by” can trigger 17-4.

---

### Article 18 — العلاقات الدولية (International relations)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 18-1 | الإساءة إلى الدول أو الشعوب أو الكيانات الدولية | Offence to states, peoples, or international entities. |
| 18-2 | الإضرار بالمصالح المشتركة للمملكة | Harm to Kingdom’s shared interests. |
| 18-3 | إثارة التوترات الإقليمية أو الدولية | Stirring regional or international tensions. |
| 18-4 | تقديم معلومات غير دقيقة عن السياسة الخارجية | Inaccurate presentation of foreign policy. |
| 18-5 | استخدام الدراما كغطاء للإساءة الدبلوماسية | Using drama as cover for diplomatic offence. |

---

### Article 19 — الاقتصاد والاستقرار المالي (Economy and financial stability)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 19-1 | نشر معلومات اقتصادية مضللة أو غير دقيقة | Spreading misleading or inaccurate economic information. |
| 19-2 | زعزعة الثقة في المؤسسات الاقتصادية أو المالية | Undermining trust in economic or financial institutions. |
| 19-3 | إثارة الهلع الاقتصادي أو الذعر المالي | Causing economic panic or financial fear. |
| 19-4 | الترويج لسلوكيات مالية مضرة | Promoting harmful financial behaviour. |
| 19-5 | الربط غير المنطقي بين أحداث درامية والاستقرار الاقتصادي | Unjustified link between dramatic events and economic stability. |

---

### Article 20 — الإفلاس والقضايا التجارية (Bankruptcy and commercial issues)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 20-1 | تقديم معلومات غير دقيقة عن الإفلاس أو التعثر المالي | Inaccurate presentation of bankruptcy or financial difficulty. |
| 20-2 | تشويه سمعة الشركات أو الأنشطة التجارية دون سند | Damaging reputation of companies or business without basis. |
| 20-3 | التضليل في عرض القضايا والنزاعات التجارية | Misleading presentation of commercial disputes. |
| 20-4 | تمجيد أو تطبيع الممارسات التجارية غير النظامية | Glorifying or normalising irregular business practices. |
| 20-5 | الربط غير المنطقي بين قضايا فردية والاستقرار التجاري العام | Unjustified link between individual cases and general commercial stability. |

---

### Article 21 — الوثائق والمعلومات السرية (Documents and classified information)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 21-1 | عرض وثائق أو معلومات سرية على أنها حقيقية | Presenting secret documents or information as real. |
| 21-2 | كشف معلومات محمية دون مسوغ سردي مشروع | Revealing protected information without legitimate narrative justification. |
| 21-3 | تمثيل آليات أو طرق الحصول غير المشروع على معلومات | Depicting mechanisms for obtaining information illegally. |
| 21-4 | الخلط بين الوثائق التخيلية والوثائق الواقعية | Blurring fictional and real documents. |
| 21-5 | إضفاء شرعية أو تطبيع كشف المعلومات السرية | Legitimising or normalising disclosure of secrets. |

---

### Article 22 — الاتفاقيات والمعاهدات (Agreements and treaties)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 22-1 | تقديم معلومات غير دقيقة عن الاتفاقيات أو المعاهدات | Inaccurate presentation of agreements or treaties. |
| 22-2 | الإساءة أو التقليل من شأن الاتفاقيات الدولية | Offence or belittling of international agreements. |
| 22-3 | الإضرار بصورة التزامات المملكة الدولية | Harm to image of Kingdom’s international commitments. |
| 22-4 | استخدام الدراما كغطاء لتشويه القانون الدولي | Using drama as cover to distort international law. |
| 22-5 | غياب التمييز بين الرأي السياسي والالتزام القانوني | No distinction between political opinion and legal obligation. |

---

### Article 23 — المظهر العام (General appearance)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 23-1 | المظاهر غير المحتشمة | Immodest appearance. |
| 23-2 | المظاهر غير الملائمة للذوق العام | Appearance unsuitable for public taste. |
| 23-3 | تطبيع المظهر المخالف للقيم الإسلامية أو الاجتماعية | Normalising appearance that conflicts with Islamic or social values. |
| 23-4 | عدم مراعاة الفئة العمرية والجمهور العام | Not respecting age group and general audience. |
| 23-5 | استخدام المظهر كوسيلة إثارة أو تسويق | Using appearance as means of provocation or marketing. |

**Agent note:** Scripts describe clothing, grooming, and “look” in stage directions; dialogue may describe how a character looks. Both are in scope. Cultural and Islamic norms are reference.

---

### Article 24 — الزي والاحتشام (Dress and modesty)
| Atom | Title (AR) | What to find |
|------|------------|---------------|
| 24-1 | الزي غير المحتشم | Immodest dress. |
| 24-2 | الزي غير الملائم للفئة العمرية أو الجمهور العام | Dress unsuitable for age or general audience. |
| 24-3 | تطبيع الزي المخالف للقيم الإسلامية أو الاجتماعية | Normalising dress that conflicts with Islamic or social values. |
| 24-4 | استخدام الزي كوسيلة إثارة أو جذب | Using dress as means of provocation or attraction. |
| 24-5 | عدم التمييز بين الزي التخييلي والزي الواقعي | No distinction between fictional and real-world dress (e.g. period costume vs contemporary norm). |

---

## Article 25 — الالتزام بالترخيص (Licensing compliance)
*Admin-only; not used for automated violation detection.*

---

## Article 26 — الجزاءات (Sanctions)
*Out of scope for analysis.*

---

## Cross-cutting guidance for the agent

1. **Legal:** Always map to a specific **atom** where possible (e.g. 4-7, 7-2). When in doubt between articles, prefer the more specific one; list related articles in `related_article_ids`.
2. **Film:** Use **narrative role** (who speaks, who acts, whether the story condemns or endorses) to decide violation vs context_ok. “Villain says X” is not automatically a violation if the narrative clearly rejects X.
3. **Arabic/English:** Treat both languages equally. Dialect, register (عامية vs فصحى), and euphemism are part of “what to find.” Mixed scripts: apply the same atoms to both.
4. **Evidence:** Every finding needs an **evidence_snippet** from the script (dialogue or stage direction). Prefer a short, exact quote that shows the concern.

This document is the single detailed reference for **what we analyze against** when building an agent with legal, film, and language skills.
