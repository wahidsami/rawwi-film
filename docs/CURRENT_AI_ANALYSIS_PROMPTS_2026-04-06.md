# Current AI Analysis Prompts

This document captures the **current non-glossary AI prompts** used by the worker pipeline as of `2026-04-06`.

Purpose:

- show what is actually sent to OpenAI
- show how prompts are assembled
- show which articles/passes are active
- highlight the current prompt-design risks affecting accuracy

This document focuses on:

- router / judge / auditor behavior
- multi-pass specialized prompts
- V2 prompt context additions

It intentionally does **not** focus on the glossary pass.

---

## Executive Summary

The current system is **not** giving the model rich legal article explanations.

Instead, for the main multi-pass judge flow it is mostly giving:

- article titles
- atom titles
- broad thematic scanner instructions
- long keyword/example lists
- aggressive "maximum detection" language

This creates a predictable pattern:

- literal glossary matches work better
- nuanced policy reasoning works worse
- broad semantic over-triggering is easy
- exact sentence grounding is still weaker than desired

There is also an important architectural detail:

- articles `1`, `2`, `3`, and `25` are **not** part of the actionable scannable AI set
- current scanning is effectively on actionable/scannable articles, mainly `4` to `24`

Relevant code:

- [gcam.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/gcam.ts#L1)

---

## Prompt Assembly Flow

### 1. Per-pass system prompt

For multi-pass judging, the specialized pass prompt is passed as the **system prompt**.

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L722)
- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L96)

Important implication:

- the general `JUDGE_SYSTEM_MSG` is **not** the main active system prompt for the normal multi-pass scanner when a pass-specific prompt is supplied
- instead, each pass builder becomes the effective system instruction

### 2. Judge user prompt

The user message sent with every pass contains:

- selected article payload
- current text chunk
- formatting rules
- evidence and offset instructions

Relevant code:

- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L102)

### 3. V2 context injection

For `V2`, extra prompt context is appended to the pass prompt:

- script memory
- scene memory
- adjacent chunk memory

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L724)
- [pipelineV2.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipelineV2.ts#L21)

### 4. Auditor prompt

After candidate findings are materialized, the auditor receives:

- canonical findings payload
- clipped full text
- optional V2 auditor context

Relevant code:

- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L221)
- [aiConstants.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aiConstants.ts#L197)

---

## What Article Data The Judge Actually Sees

This is one of the most important current limitations.

The article payload is built from `GCAMArticle` objects. But right now the worker populates them like this:

- `title_ar = article title`
- `text_ar = article title`
- `atoms = atom titles only`

Relevant code:

- [gcam.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/gcam.ts#L18)

That means the model is **not** getting a rich explanation of the article body.

In practice, the judge mostly sees something equivalent to:

- `المادة 7: <title>`
- `7-2: <atom title>`

not:

- full legal explanation
- detection criteria
- what should count
- what should not count
- edge cases

This strongly supports the concern that:

- "just giving the atom title is not enough"

That concern is correct.

---

## Current Common Prompt Rules

Most specialized pass prompts include these common pieces:

### A. Maximum detection language

Shared note:

- `وضع الكشف الأقصى`
- detect as much as possible
- do not be lenient

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L214)

### B. Structured rationale instructions

Shared requirement:

- return `rationale_ar`
- return the smallest literal `evidence_snippet`
- return narrow `location.start_offset` / `end_offset`

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L136)

### C. Chunk-level formatting rules

The user prompt reinforces:

- `canonical_atom` required
- factors required instead of direct severity
- `evidence_snippet` should be small
- offsets should target the same short snippet

Relevant code:

- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L102)

---

## Active Non-Glossary Passes

### 1. `insults`

Articles:

- `4, 5, 7, 17`

Model:

- `gpt-4.1-mini`

Prompt style:

- insult/abuse scanner
- long list of insult examples
- direct rule: anything humiliating or insulting = violation

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L219)

### 2. `violence`

Articles:

- `4, 9, 10`

Model:

- `gpt-4.1-mini`

Prompt style:

- violence/threat scanner
- many explicit Arabic violence examples
- direct rule: physical harm or threat = violation

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L261)

Important note:

The examples already include phrases very close to:

- `آخذ الجزمة وأضربك`
- `أضربك لين يسيل دمك`
- domestic violence
- child violence

So if those lines are still missed or mis-grounded, the problem is likely not "missing this phrase entirely from the prompt", but more likely:

- bad candidate grounding
- poor evidence selection
- weak atom/article mapping
- over-broad or under-precise pass behavior

### 3. `sexual_content`

Articles:

- `9, 23, 24`

Model:

- `gpt-4.1`

Prompt style:

- sexual-content scanner
- keyword-heavy
- broad rule: any sexual content or innuendo = violation

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L296)

Important note:

This pass is likely weak on metaphorical or contextual sexual meaning such as:

- `مكانك ... السرير`

because it mainly emphasizes:

- explicit sexual words
- overt innuendo
- body/physical intimacy terms

not:

- coercive marital-sex implication
- degrading gender-role control framed as sexual possession

### 4. `drugs_alcohol`

Articles:

- `11, 12`

Model:

- `gpt-4.1-mini`

Prompt style:

- direct mention scanner
- broad rule: any mention of drugs/alcohol = violation

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L330)

### 5. `discrimination_incitement`

Articles:

- `5, 6, 7, 8, 13, 17`

Model:

- `gpt-4.1`

Prompt style:

- discrimination / incitement / contempt scanner
- includes explicit anti-women examples
- includes exact phrases like:
  - `مكان البنت المطبخ`
  - `مكانك المطبخ والسرير`

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L364)

This means the sentence:

- `أنتِ بس… مكانك المطبخ والسرير وبس`

should be highly discoverable by the current prompt design.

If it is not being detected correctly, the likely failure is downstream or structural, not because the phrase family is absent from the prompt.

### 6. `national_security`

Articles:

- `4, 12, 13, 14`

Model:

- `gpt-4.1`

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L398)

### 7. `extremism_banned_groups`

Articles:

- `9, 14, 15`

Model:

- `gpt-4.1`

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L432)

### 8. `misinformation`

Articles:

- `11, 16, 19, 20, 21, 22`

Model:

- `gpt-4.1`

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L466)

### 9. `international_relations`

Articles:

- `18, 22`

Model:

- `gpt-4.1`

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L500)

### Pass map definition

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L536)

---

## Router Prompt

The router system prompt is also aggressive in some areas.

Relevant code:

- [aiConstants.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aiConstants.ts#L28)

Important detail:

It includes a mandatory rule similar to:

- if the text contains insult / threat / gender-based abuse / verbal hostility,
  add `[4, 5, 7, 17]`

That helps recall, but it can also widen candidate routing early.

---

## Auditor Prompt

The auditor is more context-aware than the pass prompts.

Relevant code:

- [aiConstants.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/aiConstants.ts#L197)

The auditor can return:

- `violation`
- `needs_review`
- `context_ok`

But in the recent V1 vs V2 real comparison, both jobs still converged to:

- all `32` visible review findings as `violation`

So in practice, the auditor is currently **not rejecting enough**.

---

## Current Prompt-Design Risks

### 1. Article explanations are too thin

The model gets:

- article titles
- atom titles

but not a strong article-definition payload.

This is likely a major reason why atom mapping and nuanced policy understanding are weak.

### 2. Prompts are scanner-like, not auditor-like

Most pass prompts behave like:

- theme detector
- keyword detector
- pattern matcher

more than:

- legal analyst
- script auditor
- sentence-grounded reviewer

### 3. Maximum-detection framing may be overpowering precision

The prompts repeatedly prioritize:

- recall
- over-detection

which can make the model:

- over-trigger
- return broad spans
- return findings before fully grounding them

### 4. Some nuanced women/coercion cases depend on implication, not keyword

Example:

- `مكانك المطبخ والسرير`

This is in the discrimination prompt examples, which is good.

But the system still does not deeply force the model to distinguish between:

- household-role insult
- coercive sexual possession
- gender humiliation
- domestic control

at the sentence-grounded legal-atom level.

### 5. The system still allows broad semantic candidate generation before exact proof

Even though offsets and evidence are requested, the pipeline still behaves too much like:

- detect broad risk first
- try to ground it afterward

instead of:

- prove the exact sentence first
- only then classify it

---

## Practical Conclusion

The current prompt design is likely underperforming for exactly the reasons you suspected:

- atom titles alone are not enough
- article explanation is too shallow
- passes are broad thematic scanners
- exact legal mapping is under-specified

In plain language:

- the model is being told **what kind of bad thing to look for**
- but not being taught strongly enough **how each article/atom should be interpreted like a policy expert**

---

## Immediate Next Focus

If we redesign prompts next, the most important changes should be:

1. replace title-only article payloads with richer article/atom definitions
2. move from broad theme detection to sentence-grounded legal judgment
3. require exact quoted sentence before allowing a persisted finding
4. add a harder rejection step before audit output becomes user-facing
5. separate:
   - candidate detection
   - exact evidence proof
   - legal article/atom mapping
   - reviewer ruling

---

## Exact Prompt Surface And Character Limits

This section answers a more operational question:

- what exactly do we send to OpenAI at each stage
- what is the explicit character limit for each part
- and where the current system has no hard cap

Important clarification:

- chunk size and prompt size are **not the same thing**
- a request to OpenAI is usually made of:
  - system prompt
  - user prompt
  - article payload
  - current chunk text
  - optional V2 memory
  - formatting instructions

So even if the chunk is controlled, the **full prompt** can still grow.

### Summary Table

| Stage | What we send as system prompt | What we send as user prompt | Explicit character limits in code | Output cap |
|---|---|---|---|---|
| Chunk creation | none | none | chunks are created at about `12,000` chars with `800` overlap | none |
| Router | `ROUTER_SYSTEM_MSG` | article titles payload + current chunk text | chunk text clipped to `15,000`; no explicit cap on router system prompt text | no explicit `max_tokens` |
| Multi-pass judge | specialized pass prompt itself, such as violence/discrimination/etc. | article payload + current chunk text + formatting rules | chunk text clipped to `30,000`; no explicit cap on the pass prompt itself; no explicit cap on article payload | `4096` tokens |
| Judge article payload | not separate | selected articles are sent as article title + `text_ar` + atom titles | no explicit char cap; current payload stays relatively small only because article data is shallow | included inside judge call |
| V2 chunk memory | appended to judge system prompt | none | previous excerpt `650`, next excerpt `650` | included inside judge call |
| V2 scene memory | appended to judge system prompt | none | scene preview `420`, same-scene before `650`, same-scene after `650` | included inside judge call |
| V2 script memory | appended to judge system prompt | none | opening `2200`, middle `2200`, ending `2200`; sampled script-summary input clipped to `28,000` | included inside judge call |
| Auditor | `AUDITOR_SYSTEM_MSG` | canonical findings payload + clipped full text + optional V2 auditor context | canonical payload `45,000`, full text `35,000`, extra auditor context `12,000` | `8192` tokens |
| Rationale-only | `RATIONALE_ONLY_SYSTEM_MSG` | finding list to improve | per item: `title_ar` `200`, `evidence_snippet` `500`, `weak_rationale` `300` | `3072` tokens |
| Repair JSON | `REPAIR_SYSTEM` | broken JSON content | broken JSON clipped to `8,000` | no explicit `max_tokens` |
| Revisit spotter | `REVISIT_SPOTTER_SYSTEM` | terms list + text slice | terms capped to first `80`; text clipped to `28,000` | `2048` tokens |

---

## Point-By-Point Explanation

### 1. Chunk creation

Relevant code:

- [tasks/index.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/tasks/index.ts#L764)
- [utils.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/supabase/functions/_shared/utils.ts#L298)

What it means:

- the backend tries to keep analysis chunks around `12,000` characters
- neighboring chunks overlap by about `800` characters

Why it matters:

- this protects the analysis from extremely huge text windows
- but it does **not** cap the whole prompt that goes to OpenAI

### 2. Router

Relevant code:

- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L54)

What the router receives:

- system prompt:
  - `ROUTER_SYSTEM_MSG`
- user prompt:
  - article title list
  - current text chunk

Explicit cap:

- only the chunk text is clipped to `15,000`

Important limitation:

- there is no separate hard character cap on the router system prompt itself

### 3. Multi-pass judge

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L722)
- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L96)

What the judge receives:

- system prompt:
  - the specialized pass prompt itself
  - for example `violence`, `discrimination_incitement`, `misinformation`, etc.
- user prompt:
  - article payload
  - current chunk text
  - formatting/evidence rules

Explicit cap:

- only the chunk text is clipped to `30,000`

Important limitation:

- there is no separate hard cap on:
  - the specialized pass prompt
  - the article payload
  - the appended V2 memory

This is the single most important operational point.

### 4. Judge article payload

Relevant code:

- [gcam.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/gcam.ts#L18)
- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L31)

What is sent:

- article title
- `text_ar`
- atom titles

Important detail:

- `text_ar` is currently just the article title again, not a rich article explanation

Why this matters:

- the payload stays small
- but the legal meaning sent to the model is also weak

So current weakness is not “payload too large” here.
It is more:

- payload too shallow

### 5. V2 chunk memory

Relevant code:

- [contextMemory.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipelineV2/contextMemory.ts#L20)

What is sent:

- previous chunk excerpt
- next chunk excerpt
- speaker hints
- continuity note

Explicit caps:

- previous excerpt `650`
- next excerpt `650`

Why it matters:

- this is controlled and relatively safe in size
- it is unlikely to be the main cause of prompt bloat

### 6. V2 scene memory

Relevant code:

- [sceneMemory.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipelineV2/sceneMemory.ts#L18)

What is sent:

- current scene heading
- previous scene heading
- next scene heading
- current scene preview
- same-scene context before/after the chunk

Explicit caps:

- scene preview `420`
- before/after context `650` each

Why it matters:

- this is also controlled and not huge
- it is not where the prompt is “choking”

### 7. V2 script memory

Relevant code:

- [scriptMemory.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipelineV2/scriptMemory.ts#L16)
- [scriptSummary.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/scriptSummary.ts#L29)

What is sent:

- opening sampled window
- middle sampled window
- ending sampled window
- frequent speakers
- optional script summary:
  - synopsis
  - risky events
  - narrative stance
  - compliance posture

Explicit caps:

- opening `2200`
- middle `2200`
- ending `2200`
- script-summary generation input clipped to `28,000`

Important nuance:

- the summary generation input is clipped
- but the generated summary fields themselves are only indirectly bounded by the instruction style, not a strict post-generation character clamp

Still, in practice this is usually not very large.

### 8. Auditor

Relevant code:

- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L215)

What the auditor receives:

- system prompt:
  - `AUDITOR_SYSTEM_MSG`
- user prompt:
  - canonical findings payload
  - clipped full text
  - optional V2 auditor context

Explicit caps:

- canonical payload `45,000`
- full text `35,000`
- auditor context `12,000`

Why it matters:

- this is the most explicitly size-controlled complex prompt in the system
- unlike the judge flow, auditor payload size is more deliberately clipped

### 9. Rationale-only pass

Relevant code:

- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L260)

What is sent:

- finding id
- title
- evidence snippet
- current ruling
- primary article id
- weak rationale

Explicit caps per item:

- title `200`
- evidence `500`
- weak rationale `300`

Why it matters:

- this pass is compact
- it is not a major prompt-size risk

### 10. Repair pass

Relevant code:

- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L135)

What is sent:

- system prompt:
  - JSON repair instructions
- user prompt:
  - broken JSON content

Explicit cap:

- broken JSON clipped to `8,000`

Why it matters:

- this pass is tightly bounded
- it is operationally safe

### 11. Revisit spotter

Relevant code:

- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L370)

What is sent:

- terms list
- text slice

Explicit caps:

- only first `80` terms
- text clipped to `28,000`

Why it matters:

- also tightly bounded
- not central to the current detection accuracy problem

---

## The Real Practical Answer

If the question is:

- "Do we have a hard limit on what we send as a full prompt to OpenAI?"

The honest answer is:

- **not as one single full-prompt cap for the judge/router flow**

What we do have is:

- hard caps on chunk text
- hard caps on some memory components
- hard caps on auditor inputs
- output token caps

But we do **not** currently have one unified cap such as:

- `total_prompt_chars <= X`

for the main multi-pass judge call.

So the true judge prompt size is effectively:

- specialized pass prompt
- plus article payload
- plus optional V2 memory
- plus formatting rules
- plus chunk text

and only some of those components are explicitly clipped.

---

## Most Important Operational Insight

For the current judge pipeline, the main risk is not really:

- the `12,000` chunk itself

The more important risk is:

- prompt inflation from multiple layers around the chunk

Especially:

- long specialized pass prompt
- repeated rule text
- article payload
- appended V2 memory

So if you want to simplify or redesign later, the best places to inspect first are:

1. specialized pass prompt length
2. repeated formatting/rationale instructions
3. article payload richness vs size
4. whether V2 memory should be shorter or more selective
