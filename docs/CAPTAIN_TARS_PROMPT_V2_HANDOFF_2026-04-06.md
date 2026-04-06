# Captain TARS Prompt V2 Handoff

This note gives Captain TARS the exact backend contract needed to redesign **one prompt safely** without breaking the worker pipeline.

Scope:

- non-glossary detection pass
- current target example: `insults`
- exact schema / atoms / evidence rules / empty response shape

This is intended as a strict compatibility handoff.

---

## 1. Exact JSON Shape Expected From A Detection Pass

The worker expects this outer shape:

```json
{
  "findings": [
    {
      "article_id": 5,
      "atom_id": "5-2",
      "canonical_atom": "INSULT",
      "intensity": 3,
      "context_impact": 2,
      "legal_sensitivity": 2,
      "audience_risk": 1,
      "title_ar": "مخالفة محتوى",
      "description_ar": "",
      "confidence": 0.92,
      "is_interpretive": false,
      "depiction_type": "unknown",
      "speaker_role": "unknown",
      "narrative_consequence": "unknown",
      "context_window_id": null,
      "context_confidence": null,
      "lexical_confidence": null,
      "policy_confidence": null,
      "rationale_ar": "يتضمن المقتطف إهانة مباشرة بلفظ يحط من قدر الشخص ويطعن في كرامته، لذلك يندرج تحت الإساءة اللفظية.",
      "final_ruling": null,
      "evidence_snippet": "أنت غبي",
      "location": {
        "start_offset": 123,
        "end_offset": 130,
        "start_line": 8,
        "end_line": 8
      }
    }
  ]
}
```

Relevant code:

- [schemas.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/schemas.ts#L34)

Important compatibility note:

- offsets are nested under `location`
- they are **chunk-local offsets**
- not global document offsets

---

## 2. Minimal Safe Contract For A Prompt Rewrite

If Captain TARS wants the simplest safe shape, this is the minimum practical payload that should still work:

```json
{
  "findings": [
    {
      "article_id": 5,
      "atom_id": "5-2",
      "canonical_atom": "INSULT",
      "intensity": 3,
      "context_impact": 2,
      "legal_sensitivity": 2,
      "audience_risk": 1,
      "title_ar": "إهانة لفظية مباشرة",
      "description_ar": "يحتوي المقتطف على إهانة مباشرة.",
      "confidence": 0.92,
      "is_interpretive": false,
      "rationale_ar": "المقتطف يتضمن لفظاً مهيناً مباشراً موجهاً إلى الشخص الآخر، لذلك يندرج تحت الإهانة اللفظية.",
      "evidence_snippet": "أنت غبي",
      "location": {
        "start_offset": 123,
        "end_offset": 130,
        "start_line": 8,
        "end_line": 8
      }
    }
  ]
}
```

This is the safest working core.

---

## 3. Exact Allowed `canonical_atom` Values

System-wide allowed canonical atoms are:

- `INSULT`
- `VIOLENCE`
- `SEXUAL`
- `SUBSTANCES`
- `DISCRIMINATION`
- `CHILD_SAFETY`
- `WOMEN`
- `MISINFORMATION`
- `PUBLIC_ORDER`
- `EXTREMISM`
- `INTERNATIONAL`
- `ECONOMIC`
- `PRIVACY`
- `APPEARANCE`

Relevant code:

- [severityRulebook.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/severityRulebook.ts#L15)

### For the `insults` pass specifically

The intended pass is:

- `name: "insults"`
- `articleIds: [4, 5, 7, 17]`

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L543)

The primary expected canonical atom for a clean insults rewrite is:

- `INSULT`

Do **not** invent values like:

- `DIRECT_INSULT`
- `VERBAL_ABUSE`
- `HUMILIATION`

unless the backend is changed too.

---

## 4. Language Rules

### Must remain Arabic

- `title_ar`
- `description_ar`
- `rationale_ar`

### Must remain exact enum/code strings

- `canonical_atom`
- `depiction_type`
- `speaker_role`
- `narrative_consequence`
- `final_ruling`

### `evidence_snippet`

- must be the literal text as it appears in the chunk
- so it follows the script language itself

---

## 5. Strict vs Flexible Schema

The parser is **not strict** in the sense of rejecting every unknown field.

That means extra fields are usually tolerated and ignored.

Examples that are safe:

- `confidence`
- `depiction_type`
- `speaker_role`
- `lexical_confidence`

Relevant code:

- [schemas.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/schemas.ts#L34)
- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L147)

### Important nuance

Unknown fields are not the main risk.

The main risk is:

- wrong shape
- missing `findings`
- bad `location`
- invalid enum-like core fields

---

## 6. Evidence Rules

This is one of the most important parts of the contract.

### Required behavior

- `evidence_snippet` should be the **smallest exact literal quote possible**
- it may be a **partial sentence**
- it should not be a full paragraph unless absolutely necessary
- it must be an **exact substring of the current chunk**
- `location.start_offset` and `location.end_offset` must point to that same exact snippet

Relevant code:

- [openai.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/openai.ts#L107)

### Practical evidence length limit

After the model returns findings, the worker compacts evidence to about:

- `260` characters max

Relevant code:

- [pipeline.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipeline.ts#L55)
- [pipeline.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/pipeline.ts#L142)

### Best operational rule for TARS

Use:

- one exact phrase
- or one short line of dialogue

Avoid:

- broad windows
- combined sentence clusters
- surrounding context paragraph as evidence

---

## 7. Empty Response Behavior

If no qualifying findings exist, the model should return exactly:

```json
{
  "findings": []
}
```

This is the correct empty shape.

Relevant code:

- [schemas.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/schemas.ts#L80)

---

## 8. Current Insults Pass Context

Current pass definition:

```ts
{
  name: "insults",
  articleIds: [4, 5, 7, 17],
  buildPrompt: buildInsultsPrompt,
  model: "gpt-4.1-mini"
}
```

Relevant code:

- [multiPassJudge.ts](/d:/Waheed/MypProjects/Raawifilm%20fix/apps/worker/src/multiPassJudge.ts#L543)

This means Captain TARS should keep prompt output compatible with:

- article family `4, 5, 7, 17`
- likely primary atom `INSULT`

---

## 9. Good Test Input Chunk

This is a useful real-world test chunk for prompt redesign evaluation:

```text
فهد:
أنتِ بس… مكانك المطبخ والسرير وبس.

ناصر:
اسمع يا فاشل، إذا تأخرت مرة ثانية… أضربك. أنت سامع؟ أضربك لين يسيل دمك.

فهد:
إذا رفعتِ صوتك، بقوم آخذ الجزمة وأضربك فيها.
```

Why this chunk is useful:

- it contains a likely insult:
  - `يا فاشل`
- it contains direct threat/violence:
  - `أضربك لين يسيل دمك`
  - `آخذ الجزمة وأضربك فيها`
- it contains likely women/discrimination degradation:
  - `مكانك المطبخ والسرير`

This makes it a strong test for:

- false positives
- evidence precision
- boundary between insult / violence / women-related harm

---

## 10. One Safe Example Output For Insults-Only Behavior

If Captain TARS is rewriting **only** the insults pass, then from the test chunk above, a safe insults-only output might look like:

```json
{
  "findings": [
    {
      "article_id": 5,
      "atom_id": "5-2",
      "canonical_atom": "INSULT",
      "intensity": 2,
      "context_impact": 2,
      "legal_sensitivity": 2,
      "audience_risk": 1,
      "title_ar": "إهانة لفظية مباشرة",
      "description_ar": "يتضمن المقتطف إهانة مباشرة بلفظ يحط من قدر المخاطَب.",
      "confidence": 0.96,
      "is_interpretive": false,
      "rationale_ar": "المقتطف يتضمن وصفاً مهيناً مباشراً بلفظ \"فاشل\" موجهاً إلى الطفل على نحو يحط من كرامته، لذلك يندرج تحت الإهانة اللفظية.",
      "evidence_snippet": "يا فاشل",
      "location": {
        "start_offset": 0,
        "end_offset": 7,
        "start_line": 1,
        "end_line": 1
      }
    }
  ]
}
```

Important note:

- this example is only a **shape and compatibility example**
- offsets above are illustrative
- real offsets must match the actual chunk text exactly

---

## 11. What Captain TARS Should Not Change In The Prompt Contract

To stay backend-safe, do **not** change:

- outer key `findings`
- nested `location` object shape
- Arabic requirement for `rationale_ar`
- `canonical_atom` code values
- empty result shape

---

## 12. Practical Conclusion

Captain TARS can safely redesign one prompt if he preserves:

1. outer JSON shape
2. allowed `canonical_atom` values
3. exact-snippet evidence behavior
4. chunk-local `location.start_offset` / `end_offset`
5. empty response = `{ "findings": [] }`

That is the safe compatibility boundary for a prompt rewrite experiment.
