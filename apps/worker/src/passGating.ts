import { config } from "./config.js";
import { canonicalArabicToken, findStringMatches } from "./lexiconCache.js";

export const PASS_GATING_VERSION = "v2";

type SignalSpec = {
  value: string;
  termType: "word" | "phrase";
};

export type PassGatingDecision = {
  shouldRun: boolean;
  reason: "disabled" | "always_on" | "signals_matched" | "no_signals";
  matchedSignals: string[];
};

const PASS_SIGNAL_SPECS: Record<string, SignalSpec[]> = {
  sexual_content: [
    { value: "جنسي", termType: "word" },
    { value: "جنس", termType: "word" },
    { value: "قبلة", termType: "word" },
    { value: "تقبيل", termType: "word" },
    { value: "عناق", termType: "word" },
    { value: "حميمي", termType: "word" },
    { value: "عري", termType: "word" },
    { value: "مثير", termType: "word" },
    { value: "إغراء", termType: "word" },
    { value: "اغراء", termType: "word" },
    { value: "شهوة", termType: "word" },
    { value: "عشيقة", termType: "word" },
    { value: "عشيق", termType: "word" },
    { value: "علاقة محرمة", termType: "phrase" },
    { value: "ملابس فاضحة", termType: "phrase" },
  ],
  discrimination_incitement: [
    { value: "عنصري", termType: "word" },
    { value: "عنصرية", termType: "word" },
    { value: "كراهية", termType: "word" },
    { value: "تحريض", termType: "word" },
    { value: "تكفير", termType: "word" },
    { value: "طائفي", termType: "word" },
    { value: "فتنة", termType: "word" },
    { value: "عبد", termType: "word" },
    { value: "عبيد", termType: "word" },
    { value: "كافر", termType: "word" },
    { value: "اطردوهم", termType: "word" },
    { value: "أقل مننا", termType: "phrase" },
    { value: "لا يستحقون", termType: "phrase" },
    { value: "هذولا أقل", termType: "phrase" },
  ],
  women: [
    { value: "المطبخ", termType: "word" },
    { value: "السرير", termType: "word" },
    { value: "امرأة", termType: "word" },
    { value: "المرأة", termType: "word" },
    { value: "البنت", termType: "word" },
    { value: "مكان البنت", termType: "phrase" },
    { value: "مكانك المطبخ", termType: "phrase" },
    { value: "ما لك كلمة", termType: "phrase" },
    { value: "أنت بس للمطبخ", termType: "phrase" },
    { value: "المرأة مكانها البيت", termType: "phrase" },
  ],
  national_security: [
    { value: "الأمن الوطني", termType: "phrase" },
    { value: "الامن الوطني", termType: "phrase" },
    { value: "نظام الحكم", termType: "phrase" },
    { value: "ثوابت الحكم", termType: "phrase" },
    { value: "قلب نظام الحكم", termType: "phrase" },
    { value: "إسقاط الحكم", termType: "phrase" },
    { value: "اسقاط الحكم", termType: "phrase" },
    { value: "النشيد الوطني", termType: "phrase" },
    { value: "الوحدة الوطنية", termType: "phrase" },
    { value: "السلم المجتمعي", termType: "phrase" },
    { value: "الرموز الوطنية", termType: "phrase" },
    { value: "الفوضى", termType: "word" },
    { value: "الاستقرار", termType: "word" },
  ],
  extremism_banned_groups: [
    { value: "إرهاب", termType: "word" },
    { value: "ارهاب", termType: "word" },
    { value: "إرهابي", termType: "word" },
    { value: "ارهابي", termType: "word" },
    { value: "داعش", termType: "word" },
    { value: "القاعدة", termType: "word" },
    { value: "متطرف", termType: "word" },
    { value: "تطرف", termType: "word" },
    { value: "تشدد", termType: "word" },
    { value: "غلو", termType: "word" },
    { value: "جماعة محظورة", termType: "phrase" },
    { value: "عنف سياسي", termType: "phrase" },
    { value: "تكفير", termType: "word" },
  ],
  misinformation: [
    { value: "إشاعة", termType: "word" },
    { value: "اشاعة", termType: "word" },
    { value: "شائعة", termType: "word" },
    { value: "شائعات", termType: "word" },
    { value: "أكاذيب", termType: "word" },
    { value: "اكاذيب", termType: "word" },
    { value: "كذب", termType: "word" },
    { value: "مضلل", termType: "word" },
    { value: "مضللة", termType: "word" },
    { value: "مفبرك", termType: "word" },
    { value: "حسابات وهمية", termType: "phrase" },
    { value: "أوامر سرية", termType: "phrase" },
    { value: "اوامر سرية", termType: "phrase" },
    { value: "انقلاب", termType: "word" },
    { value: "بلبلة", termType: "word" },
  ],
  international_relations: [
    { value: "العلاقات الدولية", termType: "phrase" },
    { value: "علاقات دولية", termType: "phrase" },
    { value: "السياسة الخارجية", termType: "phrase" },
    { value: "اتفاقية دولية", termType: "phrase" },
    { value: "معاهدة", termType: "word" },
    { value: "دبلوماسي", termType: "word" },
    { value: "دبلوماسية", termType: "word" },
    { value: "سفارة", termType: "word" },
    { value: "سفير", termType: "word" },
    { value: "حدود", termType: "word" },
    { value: "دولة أجنبية", termType: "phrase" },
    { value: "دولة اجنبية", termType: "phrase" },
    { value: "توتر إقليمي", termType: "phrase" },
    { value: "توتر دولي", termType: "phrase" },
  ],
};

function normalizeSignalText(v: string): string {
  return canonicalArabicToken(v)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSignal(text: string, signal: SignalSpec): boolean {
  if (findStringMatches(text, signal.value, signal.termType).length > 0) {
    return true;
  }

  const normalizedNeedle = normalizeSignalText(signal.value);
  if (!normalizedNeedle) return false;

  const normalizedText = normalizeSignalText(text);
  return normalizedText.includes(normalizedNeedle);
}

export function evaluatePassGating(passName: string, chunkText: string, model?: string | null): PassGatingDecision {
  if (!config.ANALYSIS_PASS_GATING_ENABLED) {
    return { shouldRun: true, reason: "disabled", matchedSignals: [] };
  }

  const signals = PASS_SIGNAL_SPECS[passName];
  if (!signals?.length || model !== "gpt-4.1") {
    return { shouldRun: true, reason: "always_on", matchedSignals: [] };
  }

  const matchedSignals: string[] = [];
  for (const signal of signals) {
    if (!matchesSignal(chunkText, signal)) continue;
    matchedSignals.push(signal.value);
    if (matchedSignals.length >= 4) break;
  }

  if (matchedSignals.length > 0) {
    return { shouldRun: true, reason: "signals_matched", matchedSignals };
  }

  return { shouldRun: false, reason: "no_signals", matchedSignals: [] };
}
