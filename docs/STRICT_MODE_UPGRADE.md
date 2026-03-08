# STRICT MODE AI Analysis Upgrade

## Overview
Upgraded the AI analysis system from "context-aware" to **STRICT MODE** - a literal rule matcher that detects violations based purely on word/content matching, without considering dramatic context or story justification.

---

## Key Changes

### Judge Prompt: v1.2 → v1.3 (STRICT MODE)

#### What Changed:
1. **Removed interpretive/soft signals** - No more "maybe" violations
2. **Removed story context consideration** - AI no longer justifies violations based on plot
3. **Enforced literal matching** - Word present = violation, regardless of context
4. **Increased confidence** - Lexicon matches now get confidence = 1.0

#### Philosophy Shift:

**Before (v1.2):**
```
"إذا كان السياق الدرامي يبرره، لا تخرج مخالفة"
"الشخصية الشريرة تقوله = قد لا يكون مخالفة"
```

**After (v1.3 - STRICT MODE):**
```
⚠️ وضع التشغيل: STRICT MODE
- لا تفسر القصة
- لا تبرر السياق الدرامي
- اللفظ موجود = مخالفة فورية، بدون تفكير أو تبرير
```

---

## Strict Mode Rules

### Phase 1: Lexicon Checking (100% Mandatory)
```arabic
✓ قواعد المطابقة الصارمة:
1. ابحث عن الكلمة الكاملة والمشتقات
2. ابحث في أي سياق: حوار، وصف، سرد، أي شيء
3. لا تتجاهل اللفظ بحجة "السياق الدرامي"
4. اللفظ موجود = مخالفة فورية
5. استخدم المادة والشدة المحددة بالضبط
6. confidence = 1.0 للألفاظ المحظورة
```

### Phase 2: Article Violations (Strict & Direct)
```arabic
✗ ممنوع التبرير بـ:
- "هذا جزء من القصة" ← لا يهم، المحتوى منتهك
- "الشخصية سيئة وهذا طبيعي" ← لا يهم، اللفظ موجود
- "المشهد يخدم الحبكة" ← لا يهم، المخالفة واضحة
- "السياق الدرامي يبرره" ← لا يهم، القاعدة مطلقة
```

### Exceptions (Technical Metadata Only)
Only pure technical metadata is ignored:
- Scene titles: "المشهد 5"
- Durations: "20 دقيقة"
- Stage directions: "INT. غرفة"
- Age ratings: "R18+"

**If there's ANY dialogue, description, or narrative content → apply rules strictly.**

---

## Impact

### Detection Strength
- **Before**: AI might skip "نصاب" if it's part of a villain's dialogue
- **After**: AI flags "نصاب" immediately, regardless of who says it or why

### Use Cases
This strict mode is ideal for:
1. **Regulatory compliance** - Zero tolerance for prohibited content
2. **First-pass filtering** - Catch everything, human review decides
3. **Literal policy enforcement** - Rules are rules, no exceptions

### Trade-offs
- **More findings**: Expect higher violation counts
- **Less nuance**: AI won't distinguish between "bad character says bad word" vs "narrator endorses bad word"
- **Human review required**: Regulators will need to review findings and decide if context matters

---

## Files Modified

1. `supabase/functions/_shared/aiConstants.ts`
   - Updated `JUDGE_SYSTEM_MSG` to v1.3 (STRICT MODE)
   - Updated `PROMPT_VERSIONS.judge` to "v1.3"

2. `apps/worker/src/aiConstants.ts`
   - Updated `JUDGE_SYSTEM_MSG` to v1.3 (STRICT MODE)
   - Updated `PROMPT_VERSIONS.judge` to "v1.3"

3. `apps/worker/src/openai.ts`
   - Removed old hardcoded prompts
   - Now imports `ROUTER_SYSTEM_MSG` and `JUDGE_SYSTEM_MSG` from `aiConstants.ts`
   - Uses injected prompts as defaults

---

## Deployment

### Required Steps:
1. **Deploy Edge Functions** (scripts function uses aiConstants for config hashing)
   ```bash
   npx supabase functions deploy scripts
   ```

2. **Rebuild & Deploy Worker**
   ```bash
   cd apps/worker
   pnpm build
   # Deploy to your environment
   ```

3. **Test with Known Violations**
   - Upload a script containing "نصاب" or other lexicon terms
   - Run analysis
   - Verify AI detects and flags with confidence = 1.0

---

## Rollback Plan

If strict mode produces too many false positives:

1. Revert `JUDGE_SYSTEM_MSG` to v1.2 in both `aiConstants.ts` files
2. Update `PROMPT_VERSIONS.judge` back to "v1.2"
3. Redeploy scripts function and worker

---

## Future Enhancements

Potential improvements:
1. **Configurable strictness** - Let admins toggle between strict/balanced/lenient modes
2. **Context tags** - Mark findings with "literal_match" vs "contextual_violation"
3. **Severity adjustment** - Reduce severity for violations in "negative character dialogue" context
4. **Whitelist patterns** - Allow specific phrases like "لا تكن نصاباً" (educational/warning context)

---

## Version Timeline

- **v1.0**: Generic prompts, no lexicon
- **v1.1 (Router)**: Lexicon injection placeholder
- **v1.2 (Judge)**: Mandatory lexicon checking + context consideration
- **v1.3 (Judge)**: STRICT MODE - literal matching, no context justification

---

## Testing Checklist

- [ ] Deploy scripts Edge Function
- [ ] Rebuild and deploy worker
- [ ] Add test lexicon terms (نصاب, حرامي, etc.)
- [ ] Upload test script with violations
- [ ] Run analysis
- [ ] Verify findings appear with correct article_id and severity
- [ ] Check confidence = 1.0 for lexicon matches
- [ ] Review findings in UI
- [ ] Confirm no false negatives (missed violations)

---

**Status**: Ready for deployment
**Risk Level**: Medium (expect more findings, may need human review adjustment)
**Rollback Time**: ~5 minutes (revert + redeploy)
