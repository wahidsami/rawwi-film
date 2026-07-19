# ACADEMY_MIGRATION_PLAN

## Purpose

This is a planning-only migration map for the current Reviewer Academy. It does not change runtime behavior, code, prompts, or database state.

## Current Academy Snapshot

The current Academy is split into:

- `Universal/` shared reviewer guidance
- `Reviewers/` legacy reviewer-pack folders
- `Articles/` canonical GCAM article markdown files
- `Atoms/` canonical atom registry
- `Relationships/` reviewer-to-article/atom ownership map
- `Templates/` structure-only article/atom templates

### Important inconsistency

`Articles/article_01.md` currently contains religion-style knowledge, but `Articles/index.yaml` assigns article 01 to the General article (`"التعريفات"`). That means the current content in `article_01.md` is misfiled and must be migrated to the religion target article (`article_08.md`) or split between the General and Religion targets depending on the topic.

## Canonical GCAM Article Targets

| Article | Canonical Title | Target Atoms |
|---|---|---|
| article_01 | التعريفات | none |
| article_02 | نطاق التطبيق | none |
| article_03 | المسؤولية | none |
| article_04 | ضوابط المحتوى الإعلامي — تفصيل القواعد الفرعية | atom_4_1 .. atom_4_8 |
| article_05 | التصنيف العمري | atom_5_1 .. atom_5_5 |
| article_06 | حماية الطفل | atom_6_1 .. atom_6_5 |
| article_07 | حقوق المرأة | atom_7_1 .. atom_7_5 |
| article_08 | الكراهية والتمييز | atom_8_1 .. atom_8_4 |
| article_09 | العنف والمحتوى المحظور | atom_9_1 .. atom_9_5 |
| article_10 | التبغ والكحول والمخدرات | atom_10_1 .. atom_10_5 |
| article_11 | المصداقية الإعلامية | atom_11_1 .. atom_11_4 |
| article_12 | النظام العام | atom_12_1 .. atom_12_5 |
| article_13 | ثوابت الحكم | atom_13_1 .. atom_13_5 |
| article_14 | التحريض على قلب نظام الحكم أو الدعوة إلى العنف | atom_14_1 .. atom_14_5 |
| article_15 | الجماعات المحظورة | atom_15_1 .. atom_15_5 |
| article_16 | الشائعات والمعلومات المضللة | atom_16_1 .. atom_16_5 |
| article_17 | الكرامة والسمعة والخصوصية | atom_17_1 .. atom_17_6 |
| article_18 | العلاقات الدولية | atom_18_1 .. atom_18_5 |
| article_19 | الاقتصاد والاستقرار المالي | atom_19_1 .. atom_19_5 |
| article_20 | الإفلاس والقضايا التجارية | atom_20_1 .. atom_20_5 |
| article_21 | الوثائق والمعلومات السرية | atom_21_1 .. atom_21_5 |
| article_22 | الاتفاقيات والمعاهدات | atom_22_1 .. atom_22_5 |
| article_23 | المظهر العام | atom_23_1 .. atom_23_5 |
| article_24 | الزي والاحتشام | atom_24_1 .. atom_24_5 |
| article_25 | الالتزام بالترخيص | none |
| article_26 | الجزاءات | none |

## Migration Matrix

| Current Academy | Target GCAM Article | Target Atom | Migration Notes | Risk |
|---|---|---|---|---|
| `Universal/01_Reviewer_Identity.md` through `Universal/10_Review_Workflow.md` | Shared across all articles | none | Keep as the shared universal layer. Do not duplicate into article docs unless a rule is truly article-specific. | Low |
| `Reviewers/General/*` | `article_01`, `article_02`, `article_03`, `article_04`, `article_05`, `article_25`, `article_26` | mostly none; only `article_04` and `article_05` have atoms | This is the broadest split. General reviewer content currently mixes definitions, scope, responsibility, evidence handling, examples, and rating guidance. It should be partitioned into the canonical General articles instead of living as one reviewer pack. | High |
| `Reviewers/Children/*` | `article_06` | `atom_6_1 .. atom_6_5` | This is a direct migration: child-safety knowledge belongs in the children article and its 5 atoms. | Medium |
| `Reviewers/SexualContent/*` | `article_07`, `article_23`, `article_24` | `atom_7_1 .. atom_7_5`, `atom_23_1 .. atom_23_5`, `atom_24_1 .. atom_24_5` | Split the current sexual-content pack into female-violence/rights content, appearance content, and dress/modesty content. | High |
| `Reviewers/Religion/*` | `article_08` | `atom_8_1 .. atom_8_4` | Religion knowledge should move here. This is the canonical destination for the religion/hate/denial-style content that currently appears in `article_01.md`. | High |
| `Articles/article_01.md` | `article_08` as currently written, or split between `article_01` and `article_08` if general definitions are extracted | `atom_8_1 .. atom_8_4` for the religion parts | This file is currently misfiled. Its substantive text is religion-oriented, but the index says article 01 is General definitions. The religion-specific material should be extracted to `article_08.md`; any generic methodology should be moved to the appropriate General article(s). | High |
| `Reviewers/Violence/*` | `article_09` | `atom_9_1 .. atom_9_5` | Violence pack maps directly to the violence article and its atom set. | Medium |
| `Reviewers/Drugs/*` | `article_10` | `atom_10_1 .. atom_10_5` | Direct migration. | Medium |
| `Reviewers/History/*` | `article_11`, `article_16` | `atom_11_1 .. atom_11_4`, `atom_16_1 .. atom_16_5` | Split factual credibility / misinformation content between the credibility article and the misinformation article. | High |
| `Reviewers/Security/*` | `article_12`, `article_14`, `article_15`, `article_21` | `atom_12_1 .. atom_12_5`, `atom_14_1 .. atom_14_5`, `atom_15_1 .. atom_15_5`, `atom_21_1 .. atom_21_5` | Security content is already multi-article in GCAM and should remain split by protected-interest subtype. | High |
| `Reviewers/Crime/*` | `article_13` | `atom_13_1 .. atom_13_5` | Direct migration. | Medium |
| `Reviewers/Society/*` | `article_17` | `atom_17_1 .. atom_17_6` | Direct migration. | Medium |
| `Reviewers/State/*` | `article_18`, `article_19`, `article_20`, `article_22` | `atom_18_1 .. atom_18_5`, `atom_19_1 .. atom_19_5`, `atom_20_1 .. atom_20_5`, `atom_22_1 .. atom_22_5` | State/policy/economy/trade content must remain split across the four canonical state articles. | High |
| `Reviewers/Language/*` | No current GCAM target | none | Legacy/orphaned reviewer pack. It has no canonical article mapping in the current index/relationship map and should not be treated as a standalone GCAM article without a future policy decision. | Medium |
| `Reviewers/Morality/*` | No current GCAM target | none | Legacy/orphaned reviewer pack. If the content is needed, it should be folded into the most relevant canonical article instead of being kept as a separate reviewer silo. | Medium |
| `README.md` files inside `Reviewers/` and `Articles/` | None | none | Documentation only. Keep as scaffolding. | Low |

## Knowledge That Must Be Split Across Multiple Articles

1. **General reviewer knowledge**
   - Current `Reviewers/General/*` content is too broad to stay in one bucket.
   - It should be split into the General GCAM articles:
     - `article_01` definitions
     - `article_02` scope
     - `article_03` responsibility
     - `article_04` content-rule detail
     - `article_05` age-rating logic
     - `article_25` licensing compliance
     - `article_26` sanctions

2. **Religion / hate / discrimination**
   - Current religion material is split between `article_01.md` and `Reviewers/Religion/*`.
   - The religious content belongs in `article_08`, while any generic reviewer-methodology text should move to the relevant General article.

3. **Sexual content / appearance / dress**
   - The current sexual-content pack needs to be split across `article_07`, `article_23`, and `article_24`.
   - These should not remain as one combined reviewer pack because their atom sets are already separate.

4. **History / misinformation**
   - Split between `article_11` and `article_16`.
   - `article_11` is about media credibility and factual integrity; `article_16` is the misinformation / rumour / distortion article.

5. **Security**
   - Split across `article_12`, `article_14`, `article_15`, and `article_21`.
   - These are distinct protected-interest buckets and should not be merged.

6. **State**
   - Split across `article_18`, `article_19`, `article_20`, and `article_22`.
   - Each article covers a different state/civic/economic/legal risk surface.

## Knowledge That Can Stay Unchanged

- `Universal/*` shared reviewer guidance.
- Canonical IDs and ownership ordering in `Articles/index.yaml`.
- Canonical atom registry in `Atoms/index.yaml`.
- `Relationships/relationshipMap.yaml` as the source of reviewer-to-article/atom ownership.
- The existing article/atom naming convention (`article_XX`, `atom_X_Y`).
- Template scaffolding under `Templates/` and README-only folders.

## Articles That Currently Have No Substantive Knowledge

The current canonical article files are mostly scaffolded. In practice:

- `article_01.md` contains substantive text, but it is misfiled religion content.
- `article_02.md` through `article_26.md` are currently placeholder-heavy and need population.

So the Academy currently has **no fully populated canonical article manual** yet.

## Articles With Duplicated or Overlapping Knowledge

1. **Religion**
   - `Articles/article_01.md`
   - `Reviewers/Religion/*`
   - Target canonical destination: `article_08.md`
   - Risk: the same religious concepts are split between an article file and a reviewer pack, while the article index points elsewhere.

2. **General methodology**
   - `Universal/*`
   - `Reviewers/*` packs that re-state definitions, examples, false-positive rules, false-negative rules, context, and decision logic
   - Risk: repeated instructions can diverge over time unless they are normalized into one shared universal layer plus article-specific overlays.

3. **Cross-article rating and content guidance**
   - `Reviewers/General/*`
   - `article_04`, `article_05`, `article_25`, `article_26`
   - Risk: a single folder currently appears to carry content that spans several GCAM articles.

## Migration Notes by Canonical Article

- `article_01`  
  General definitions only. Keep it free of religion content.

- `article_02`  
  Scope / applicability. Populate from general reviewer-scope material.

- `article_03`  
  Responsibility / accountability. Populate from general decision-process material.

- `article_04`  
  General content-rule details. This is where the current broad “content media rules” material belongs.

- `article_05`  
  Age-rating logic. Keep age appropriateness, thresholding, and audience suitability here.

- `article_06`  
  Child-protection knowledge.

- `article_07`, `article_23`, `article_24`  
  Split sexual-content, appearance, and modesty/attire knowledge instead of keeping them in one broad folder.

- `article_08`  
  Canonical religion / hate / discrimination destination. This is the correct target for the current misfiled religion knowledge.

- `article_09`  
  Violence and blocked-content patterns.

- `article_10`  
  Drugs / alcohol / tobacco.

- `article_11`, `article_16`  
  Factual integrity vs misinformation / rumours.

- `article_12`, `article_14`, `article_15`, `article_21`  
  Security article split; do not merge these into one folder.

- `article_13`  
  Crime / leadership / governance-related violations.

- `article_17`  
  Dignity, reputation, and privacy.

- `article_18`, `article_19`, `article_20`, `article_22`  
  State / economy / commerce / treaties.

- `article_25`, `article_26`  
  Currently placeholder-only; keep them separate and populate later.

## Risk Summary

- **High risk**
  - Moving misfiled religion content out of `article_01.md`
  - Splitting `Reviewers/General/*` across multiple General articles
  - Splitting `Reviewers/SexualContent/*`, `Reviewers/History/*`, `Reviewers/Security/*`, and `Reviewers/State/*`
  - Any rename that changes article IDs or atom IDs

- **Medium risk**
  - Migrating `Reviewers/Language/*` and `Reviewers/Morality/*` into canonical articles
  - Re-assigning content from legacy reviewer packs into canonical article docs

- **Low risk**
  - Keeping `Universal/*`, indexes, and templates as shared scaffolding
  - Copying content-only text into the correct canonical article file without changing IDs

## Final Planning Conclusion

The current Academy should be migrated from reviewer-pack centric storage to article-centric storage, with `article_08.md` becoming the canonical home for religion/hate knowledge and `article_01.md` being restored to General definitions only.

