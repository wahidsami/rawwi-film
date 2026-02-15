# Taxonomy extraction – validation summary

**Source:** منهجية ومعايير منصة «راوي» لتحليل النصوص السينمائية والإعلامية.docx  
**Extracted:** Articles (المادة) + atom rules (القاعدة) titles only.

## Counts

- **Articles found:** 24  
- **Atoms found:** 99 (grouped under articles 5–24; articles 1, 2, 3, 25 have no atoms)

## Per-article atom counts

| Article | Title (ar)           | Atoms |
|--------:|----------------------|-------|
| 1       | التعريفات            | 0     |
| 2       | نطاق التطبيق         | 0     |
| 3       | المسؤولية            | 0     |
| 5       | التصنيف العمري       | 5     |
| 6       | حماية الطفل          | 5     |
| 7       | حقوق المرأة          | 5     |
| 8       | الكراهية والتمييز    | 4     |
| 9       | العنف والمحتوى المحظور | 5   |
| 10      | التبغ والكحول والمخدرات | 5  |
| 11      | المصداقية الإعلامية  | 4     |
| 12      | النظام العام          | 5     |
| 13      | ثوابت الحكم          | 5     |
| 14      | التحريض على قلب نظام الحكم أو الدعوة إلى العنف | 5 |
| 15      | الجماعات المحظورة    | 5     |
| 16      | الشائعات والمعلومات المضللة | 5 |
| 17      | الكرامة والسمعة والخصوصية | 6  |
| 18      | العلاقات الدولية     | 5     |
| 19      | الاقتصاد والاستقرار المالي | 5 |
| 20      | الإفلاس والقضايا التجارية | 5 |
| 21      | الوثائق والمعلومات السرية | 5 |
| 22      | الاتفاقيات والمعاهدات | 5    |
| 23      | المظهر العام         | 5     |
| 24      | الزي والاحتشام       | 5     |
| 25      | الالتزام بالترخيص    | 0     |

## Numbering gaps

- **Missing article number:** 4 (document has 1, 2, 3, 5… 25; no المادة (4)).
- **Atom numbering:** No gaps; within each article atom ids are consecutive (e.g. 8-1, 8-2, 8-3, 8-4).

## Output file

- **JSON:** `docs/taxonomy-from-docx.json`  
  Structure: `{ "articles": [ { "id", "title_ar", "atoms": [ { "id", "title_ar" } ] } ] }`.
