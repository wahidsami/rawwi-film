# Prompt Engine Architecture

This document describes the current prompt architecture used by the worker when it talks to GPT.

It is based on the current source tree, especially:

- `apps/worker/src/aiConstants.ts:20-360`
- `apps/worker/src/multiPassJudge.ts:156-1885`
- `apps/worker/src/openai.ts:87-243`
- `apps/worker/src/pipelineV2.ts:18-98`
- `apps/worker/src/pipelineV2/contextMemory.ts:81-147`
- `apps/worker/src/pipelineV2/sceneMemory.ts:121-198`
- `apps/worker/src/pipelineV2/scriptMemory.ts:146-260`
- `apps/worker/src/pipelineV2/stagedMemory2.ts:43-118`
- `apps/worker/src/v3PromptPack.ts:4-220`
- `apps/worker/src/v4PromptPack.ts:4-176`
- `apps/worker/src/canonicalAtomFramework.ts:18-189`

The worker currently supports two prompt-pack families:

- `v3`, selected when `VIOLATION_SYSTEM_VERSION=v3`
- `v4`, selected when `VIOLATION_SYSTEM_VERSION=v4`

The live default in config is still `v3`, but the prompt-architecture code now understands both packs.

## 1. High-Level Architecture

The prompt stack has five layers:

1. Prompt-pack selection
2. Subject or pass assembly
3. Canonical atom framework injection
4. Memory2 context injection
5. OpenAI request rendering

The important property is that the worker does not send a single flat prompt template.
It composes the final system prompt from multiple deterministic pieces:

- a shared overview file
- a pass-specific or subject-specific file
- a canonical-atom framework block
- structured rationale instructions
- article payload text
- Memory2 prompt context from Pipeline V2
- optional user-prompt addenda

The actual OpenAI call then adds the chunk text and JSON formatting rules.

## 2. Exact Assembly Order

### 2.1 Pack selection

`apps/worker/src/multiPassJudge.ts:1592-1597` chooses the active pass family:

- if `config.VIOLATION_SYSTEM_VERSION` is `v3` or `v4`, the worker uses the subject-mode pass list
- otherwise it uses the legacy pass list

Within subject mode:

- `v3` subjects come from `apps/worker/src/v3PromptPack.ts:62-182`
- `v4` subjects come from `apps/worker/src/v4PromptPack.ts:53-138`

### 2.2 Prompt overlay

For non-subject legacy passes, `applyViolationSystemOverlay()` in `apps/worker/src/multiPassJudge.ts:182-199` prepends the pack overlay:

- `buildV3PromptOverlay(passName)` for `v3`
- `buildV4PromptOverlay(passName)` for `v4`

Those overlays are built from:

- `shared_overview.md`
- the pass-specific markdown files listed in the pack mapping
- an optional `=== Pass: ... ===` separator

For subject-mode passes, the pack-specific subject section is already embedded by:

- `buildV3SubjectPromptSection()` in `apps/worker/src/v3PromptPack.ts:209-220`
- `buildV4SubjectPromptSection()` in `apps/worker/src/v4PromptPack.ts:165-176`

### 2.3 Subject prompt body

`buildSubjectPrompt()` in `apps/worker/src/multiPassJudge.ts:203-236` is the central subject-mode constructor.

It concatenates, in this order:

1. the pack subject section
2. `STRUCTURED_RATIONALE_INSTRUCTIONS`
3. the article payload
4. the subject operating rules
5. any subject-specific hard rules

### 2.4 Memory2 context

`apps/worker/src/pipelineV2.ts:24-33` builds Memory2 context in this order:

1. chunk context envelope
2. scene memory
3. script memory
4. Memory2 staged bundle
5. prompt context string

That prompt context is stored into `job.config_snapshot.v2_prompt_context` at `apps/worker/src/pipelineV2.ts:76-95`.

Then `apps/worker/src/multiPassJudge.ts:1842-1844` appends it to the system prompt under:

`سياق إضافي للمراجعة (Pipeline V2)`

### 2.5 OpenAI rendering

`callJudgeRaw()` in `apps/worker/src/openai.ts:146-243` renders the final request:

- system message = constructed prompt
- user message = article payload + chunk text + formatting rules + optional user-prompt addition
- `response_format = { type: "json_object" }`
- `max_tokens = 4096`
- `temperature` and `seed` come from the job config

## 3. Fully Rendered Prompt Shape

The example below is structurally exact, but the article payload, chunk text, and Memory2 excerpts are placeholders.
This is the shape GPT actually receives for a subject-mode pass.

### 3.1 System message

```text
[shared overview from docs/V4 prompts/shared_overview.md or docs/V3 prompts/shared_overview.md]

[subject prompt file for the active subject]

قواعد الشرح الإلزامية لكل finding:
1. rationale_ar مطلوبة دائماً ولا تتركها فارغة.
2. اشرح باختصار: أين يظهر المقتطف في النص، ما اللفظ أو السلوك الذي تم رصده، ولماذا يندرج تحت عنوان المخالفة نفسه.
3. اذكر سبباً قانونياً أو دلالياً واضحاً، لا مجرد إعادة صياغة النص.
4. ممنوع التعليل العام مثل: "يحتوي النص على مخالفة" أو "وجود لفظ مخالف" دون شرح.
5. إذا كان المقتطف حواراً أو وصفاً أو تهديداً أو إهانة مباشرة فاذكر ذلك صراحة.
6. في evidence_snippet أرجع أصغر اقتباس حرفي ممكن يثبت المخالفة، وليس فقرة كاملة إلا إذا كانت الضرورة تقتضي ذلك.
7. location.start_offset و location.end_offset يجب أن يحددا نفس المقتطف القصير داخل chunk الحالي، لا نافذة واسعة حوله.
8. ممنوع ذكر أرقام المواد أو أكواد atoms في rationale_ar؛ اكتفِ بعنوان المخالفة ومعنى المخالفة نفسه.
9. لا تذكر أسماء الشخصيات أو تفترض هوية المتحدث/المستهدف إلا إذا ظهرت حرفياً في المقتطف نفسه.
10. قبل صياغة rationale_ar اقرأ الجملة نفسها + جملة قبلها + جملة بعدها من نفس السياق المحلي.
11. ممنوع اختلاق أحداث أو عبارات غير موجودة حرفياً في السياق المحلي (مثل: "مقطع صوتي"، "أوامر سرية"، "الإعلام الرسمي") إذا لم ترد فعلاً في النص القريب.
12. كلمة "النظام" لا تعني تلقائياً نظام الحكم: إذا كان السياق مدرسي/انضباطي (معلم، طلاب، فصل، مدرسة) فلا تصنفها سياسياً إلا بوجود قرينة سياسية صريحة.

[article payload]

Memory2 staged context (strict budgeted retrieval):
- Stage chunk (...)
- Stage scene (...)
- Stage script (...)
- Total staged memory chars: ...
- Use staged memory only for interpretation and continuity.
- Evidence must still be literal text from the current chunk.
- يجب تفسير كلمة "النظام" بحسب السياق المحلي: نظام المدرسة/الانضباط المدرسي لا يُصنف تلقائياً كقيادة سياسية أو نظام حكم.
- قبل إصدار أي مخالفة، اقرأ العبارة نفسها + جملة قبلها + جملة بعدها داخل نفس السياق المحلي ثم علّل القرار.
- إذا كان التعليل يعتمد على ادعاء غير موجود حرفياً في السياق المحلي فلا تُخرج المخالفة.

- Script-level memory summary source: ...
- Frequent speakers across the script: ...
- Speaker profiles and sample dialogue: ...
- Opening memory excerpt: ...
- Middle memory excerpt: ...
- Ending memory excerpt: ...
- Script synopsis: ...             (only if the LLM summary exists)
- Main characters: ...
- Relationship map: ...
- Key risky events: ...
- Narrative stance: ...
- Compliance posture: ...

- Detected scene count in script: ...
- Current detected scene: ...
- Previous detected scene: ...
- Next detected scene: ...
- Current scene preview: ...
- Same-scene context before this chunk: ...
- Same-scene context after this chunk: ...
- Scene memory status: ...

- Chunk index: ...
- Boundary note: ...
- Manual review items carried from prior reviews: ...
- Speaker hints in this chunk: ...
- Current chunk dialogue turns: ...
- Previous chunk memory excerpt: ...
- Next chunk memory excerpt: ...
- Use this memory only to understand narrative continuity and intent.
- Do not copy text from the memory excerpt as evidence unless the literal evidence also exists inside the current chunk.
- Evidence and offsets must still come from the current chunk itself.
```

### 3.2 User message

```text
المادة X: Title
...article text...

---
مقطع النص (start_offset=..., end_offset=...):
...chunk text...

قواعد تنسيق إلزامية:
- article_id ...
- canonical_atom ...
- intensity ...
- context_impact ...
- legal_sensitivity ...
- audience_risk ...
- rationale_ar ...
- evidence_snippet ...
- location ...
- confidence ...
- evidence_snippet نصاً غير null.

[optional pass-specific user-prompt addition]

أرجع JSON بمصفوفة findings فقط.
```

`callJudgeRaw()` is the component that actually renders this user message, and it enforces the chunk slice length and JSON response format at `apps/worker/src/openai.ts:170-215`.

## 4. Shared Prompt Contents

### 4.1 V4 shared overview

Exact source: `docs/V4 prompts/shared_overview.md`

```md
# قواعد تشغيل نسخة V4

- هذه النسخة مبنية على لائحة المحظورات العامة لمحتوى الأفلام والمسلسلات + المجتمع والأخلاق.
- لا تُخرج finding إلا إذا كان المقتطف نفسه يثبت المخالفة مباشرة.
- إذا كان المحتوى عامًّا أو غير قاطع فأرجع `{"findings":[]}` لهذا المسار.
- ممنوع نقل المخالفة إلى مسار غير مطابق لموضوعه.
- في `rationale_ar` اشرح السبب من النص نفسه دون اختلاق سياق.
- `evidence_snippet` يجب أن يكون قصيراً ودقيقاً.
```

### 4.2 V3 shared overview

Exact source: `docs/V3 prompts/shared_overview.md`

It is the same conceptually, but more explicit about:

- title-only findings
- nearby scene/story memory
- strict subject routing
- using the most specific category

## 5. V4 Subject Prompts

The worker maps V4 subject names to files and article IDs in `apps/worker/src/v4PromptPack.ts:53-138`.

The following files are the important V4 subject prompts:

### 5.1 `04_historical_documentary_reliability.md`

Source: `docs/V4 prompts/04_historical_documentary_reliability.md`

```md
# 1.4 المحتوى التاريخي غير الموثوق (وثائقي)

هذا المسار للمحتوى الوثائقي عند وجود:
- ادعاءات تاريخية جوهرية بلا إسناد/مصدر موثوق.
- طرح تاريخ الدولة السعودية أو الشخصيات التاريخية الإسلامية بشكل غير موثق.

لا تخرج مخالفة في النصوص غير الوثائقية إلا مع دليل واضح جدًا على الادعاء المضلل.
```

### 5.2 `05_society_identity_generalization.md`

Source: `docs/V4 prompts/05_society_identity_generalization.md`

```md
# 1.5 الإساءة للمجتمع/الهوية بالتعميم

استخرج فقط الحالات التي تتضمن:
- إساءة تعميمية على المجتمع السعودي أو فئة كبيرة.
- إساءة تعميمية على قبائل/عوائل بأسمائها.
- إظهار عناصر غير سعودية كتراث سعودي أصيل بشكل مضلل.
- الدعوة المباشرة للتفكك الأسري أو الطلاق أو قطع صلة الرحم.

لا تخرج مخالفة عند النقد الفردي المحدد غير التعميمي.
```

### 5.3 `06_children_crime_security.md`

Source: `docs/V4 prompts/06_children_crime_security.md`

```md
# 1.6 جرائم/أمن موجهة للأطفال

استخرج فقط الحالات التي تتضمن:
- محتوى جرائم موجّه للأطفال (قتل/خطف/سطو...) بإطار إيجابي.
- تجميل صورة تنظيمات عصابية/سياسية أو الدعوة للانضمام لها.
- إظهار الجريمة أو التنظيم بصورة محببة/بطولية مع غياب الإدانة أو العواقب.

لا تخرج مخالفة إذا كان السياق يدين السلوك بوضوح ويبرز الأثر السلبي.
```

### 5.4 `11_profanity.md`

Source: `docs/V4 prompts/11_profanity.md`

```md
# 2.5 الألفاظ النابية

استخرج فقط الحالات التي تتضمن:
- ألفاظ نابية مباشرة بأي لغة.
- سباب/شتائم واضحة.

لا تخرج مخالفة لعبارات حادة غير نابية بوضوح.
```

### 5.5 `12_other.md`

Source: `docs/V4 prompts/12_other.md`

```md
# مخالفات عامة أخرى

يُستخدم هذا المسار عند وجود مخالفة مرتبطة باللائحة الجديدة لا تنطبق بدقة على المسارات المتخصصة.

قواعد:
- لا تستخدم هذا المسار إذا وُجد مسار متخصص أوضح.
- يجب أن يكون الدليل واضحاً ومباشراً.
- إذا كان هناك شك، أعد findings فارغة.
```

### 5.6 V4 subject-mode injection rules

`buildSubjectPrompt()` in `apps/worker/src/multiPassJudge.ts:203-236` adds the operational rules that make the subject prompt work:

- one subject only
- do not borrow findings from another subject
- use Memory2 for interpretation only
- evidence must come from the current chunk
- return `needs_review` rather than dropping borderline cases
- return empty findings when the text does not actually prove the subject

For political/security subjects, additional hard rules are injected at `apps/worker/src/multiPassJudge.ts:207-215`:

- direct political/governmental evidence is required
- the word `النظام` alone is not enough

## 6. Story Memory

Pipeline V2 builds memory in layers.

### 6.1 Chunk context

`apps/worker/src/pipelineV2/contextMemory.ts:81-147`

This layer contributes:

- chunk index
- chunk length and offsets
- previous and next excerpts
- speaker hints in the current chunk
- dialogue-turn previews
- a boundary note that tells GPT to read the chunk as part of continuing scene continuity

### 6.2 Scene memory

`apps/worker/src/pipelineV2/sceneMemory.ts:121-198`

This layer contributes:

- scene heading detection
- previous/current/next scene
- same-scene text before and after the chunk
- guidance about dramatic beat and whether the text is endorsement, condemnation, narration, dream logic, or neutral mention

### 6.3 Script memory

`apps/worker/src/pipelineV2/scriptMemory.ts:146-260`

This layer contributes:

- a cached script summary keyed by `script_id:version_id`
- speaker hints
- speaker profiles
- opening, middle, and ending excerpts
- summary metadata such as hash, source, generation timestamp, model, and version

### 6.4 Memory2 staged bundle

`apps/worker/src/pipelineV2/stagedMemory2.ts:43-118`

This layer compresses the three memory sources into a staged summary with hard budgets:

- chunk stage
- scene stage
- script stage

It also adds the explicit instruction that:

- memory is for interpretation and continuity only
- evidence must still be literal text from the current chunk

### 6.5 Current responsibilities of Memory2

Memory2 is responsible for:

- stabilizing narrative interpretation across chunks
- preserving speaker continuity
- preserving scene continuity
- giving long-range script context

Memory2 is not responsible for:

- generating evidence
- changing judge prompts
- changing the meaning of a finding
- overriding literal-text requirements

## 7. Glossary

The glossary path is a lexical hard-match path, not a general semantic pass.

### 7.1 Lexicon injection

`apps/worker/src/aiConstants.ts:313-360` builds a lexicon string from DB terms and injects it into:

- the router prompt
- the judge prompt

via `injectLexiconIntoPrompts()`.

### 7.2 Router behavior

`apps/worker/src/openai.ts:87-141`

The router:

- receives the article list
- receives the chunk slice
- returns JSON only
- sorts candidates deterministically
- caps the candidate count

### 7.3 Glossary pass behavior

`apps/worker/src/multiPassJudge.ts:270-330`

The glossary pass:

- prints the lexicon details
- prints the matched term list
- asks for direct literal matches
- requires the exact term or one of its variants
- treats match as a direct finding when the term is present

The glossary pass is intentionally narrower than the semantic passes.

## 8. Current Responsibilities

### Shared overview

The shared overview defines the broad behavior of the pack:

- direct evidence only
- no cross-pass leakage
- no invented context
- no generic findings when the text is too vague

### Subject prompt file

Each subject file defines the local domain boundary:

- what counts
- what does not count
- when to return empty findings

### Canonical atom framework

`apps/worker/src/canonicalAtomFramework.ts:18-189`

The framework defines the canonical content classes that anchor the prompts:

- INSULT
- VIOLENCE
- SEXUAL
- SUBSTANCES
- DISCRIMINATION
- CHILD_SAFETY
- WOMEN
- MISINFORMATION
- PUBLIC_ORDER
- EXTREMISM
- INTERNATIONAL
- ECONOMIC
- PRIVACY
- APPEARANCE

These sections are embedded in the specialized prompts as the pass-level reference point.

### Structured rationale instructions

`apps/worker/src/multiPassJudge.ts:168-180`

These instructions are responsible for:

- forcing concise rationale
- tying rationale to the current chunk
- preventing generic explanations
- preventing unsupported speaker/target attribution

### Memory2 prompt context

`apps/worker/src/pipelineV2.ts:28-33`

The prompt context is responsible for:

- continuity
- scene linkage
- script-level memory

It is not allowed to change the evidence contract.

### OpenAI wrapper

`apps/worker/src/openai.ts:146-243`

The wrapper is responsible for:

- turning the prompt into a chat request
- applying JSON response format
- applying deterministic temperature and seed settings
- recording the rendered prompts

## 9. Complexity Audit

The prompt system is moderately complex because the worker combines several instruction layers:

- a shared pack-level policy
- a pass-specific subject policy
- a canonical atom definition block
- a large article payload
- a large chunk payload
- three Memory2 views of the same text
- a user-prompt addendum for each pass
- deterministic request settings

The main complexity drivers are:

1. The chunk payload itself
2. The article payload
3. The Memory2 context stack
4. The per-pass special cases

The strongest simplification in the current design is that each pass is still single-purpose.
That keeps the model from having to solve a broad multi-objective task in one prompt.

## 10. Decision Audit

The following decisions are made by the prompt stack:

- router decides candidate articles
- pass planner decides which passes run
- subject prompt decides what subject is in scope
- Memory2 decides the interpretive frame
- judge decides whether the current chunk contains a candidate finding
- auditor decides whether a candidate finding survives review

The following decisions are not made by the prompt stack:

- final persistence rules
- deduplication rules
- pass gating rules
- run-ordering rules
- deterministic cache rules

## 11. Contradiction Audit

The current source contains several intentional tensions.

### 11.1 Maximum detection vs direct evidence

`JUDGE_SYSTEM_MSG` in `apps/worker/src/aiConstants.ts:53-196` tells the model to detect aggressively.

At the same time, the pack overlays in `docs/V4 prompts/shared_overview.md` and the subject files insist on direct evidence and empty output when the text is unclear.

This is intentional:

- the judge is encouraged to search hard
- the pack overlay still forces direct proof

### 11.2 Memory2 context vs evidence purity

The Memory2 layers are allowed to help interpret narrative context.

But they are explicitly forbidden from becoming evidence.

That tension is resolved by repeated instructions in:

- `apps/worker/src/pipelineV2/contextMemory.ts:128-146`
- `apps/worker/src/pipelineV2/sceneMemory.ts:182-198`
- `apps/worker/src/pipelineV2/stagedMemory2.ts:106-118`

### 11.3 Subject strictness vs needs-review fallback

The subject prompt says to return empty findings when the text does not prove the subject.

But it also allows `needs_review` when the evidence is borderline.

This is not a bug; it is a deliberate middle path for ambiguous cases.

### 11.4 General prompt vs subject hard rules

The subject hard rules for state/security topics require political or governmental proof and reject `النظام` as a standalone trigger.

That creates a stricter local override for a subset of subjects.

## 12. Glossary Audit

The glossary mechanism has three roles:

1. Router hinting
2. Judge lexical matching
3. Pass-level evidence narrowing

It is not a broad semantic classifier.

Important behaviors:

- if a term appears in the lexicon list, it can influence candidate article selection
- if a term appears in the glossary pass, it can produce a direct finding
- the glossary pass still expects the exact word or a listed variant

This means the glossary is a deterministic lexical gate, not a freeform content classifier.

## 13. Repetition Audit

The current system repeats several instructions on purpose.

Repeated across multiple layers:

- direct evidence only
- no invented context
- return empty when unclear
- use nearby or staged memory only for interpretation
- keep evidence short and literal

This repetition is visible in:

- shared overview files
- subject files
- `STRUCTURED_RATIONALE_INSTRUCTIONS`
- `buildSubjectPrompt()`
- Memory2 prompt context builders
- `callJudgeRaw()` formatting rules

The repetition is deliberate because the worker uses multiple pass types and several prompt-pack entry points.

## 14. Dependency Graph

```text
docs/V3 prompts/shared_overview.md
docs/V4 prompts/shared_overview.md
        ↓
v3PromptPack.ts / v4PromptPack.ts
        ↓
multiPassJudge.ts
        ↓
buildSubjectPrompt() or buildGlossaryPrompt()
        ↓
STRUCTURED_RATIONALE_INSTRUCTIONS
        ↓
article payload from GCAM article text
        ↓
pipelineV2.ts Memory2 stack
        ↓
contextMemory.ts + sceneMemory.ts + scriptMemory.ts
        ↓
stagedMemory2.ts
        ↓
promptContext appended to system prompt
        ↓
callJudgeRaw() in openai.ts
        ↓
OpenAI chat.completions.create()
```

The practical runtime flow is:

1. choose V3 or V4 pack
2. build the pass prompt
3. add Memory2 context
4. render the OpenAI request
5. parse the JSON reply

## 15. File Map

| File | Role |
|---|---|
| `apps/worker/src/aiConstants.ts` | Prompt versions, router prompt, judge prompt, auditor prompt, rationale-only prompt, lexicon injection |
| `apps/worker/src/multiPassJudge.ts` | Pass selection, subject prompt assembly, pass overlays, glossary prompt, runtime prompt construction |
| `apps/worker/src/openai.ts` | Final OpenAI request rendering and response parsing wrapper |
| `apps/worker/src/pipelineV2.ts` | Memory2 orchestration and prompt-context composition |
| `apps/worker/src/pipelineV2/contextMemory.ts` | Chunk-local context memory |
| `apps/worker/src/pipelineV2/sceneMemory.ts` | Scene continuity memory |
| `apps/worker/src/pipelineV2/scriptMemory.ts` | Script summary and speaker memory |
| `apps/worker/src/pipelineV2/stagedMemory2.ts` | Memory2 stage compression and staged prompt context |
| `apps/worker/src/canonicalAtomFramework.ts` | Canonical atom definitions injected into prompts |
| `apps/worker/src/v3PromptPack.ts` | V3 pack overlays and V3 subject definitions |
| `apps/worker/src/v4PromptPack.ts` | V4 pack overlays and V4 subject definitions |
| `docs/V3 prompts/*` | V3 shared and subject prompt files |
| `docs/V4 prompts/*` | V4 shared and subject prompt files |
| `apps/worker/src/config.ts` | Environment switches that decide pack selection, memory behavior, and deterministic settings |

## 16. Short Takeaway

The current prompt engine is a layered prompt composer, not a single prompt string.

The final GPT request is shaped by:

- the selected violation pack
- the selected subject or pass
- the canonical atom framework
- the current chunk text
- the current article list
- the staged Memory2 context
- the deterministic request settings

That is the actual architecture the worker uses today.
