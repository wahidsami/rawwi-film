export type DrugsExample = Readonly<{
  readonly text: string;
  readonly classification: string;
}>;

export const DRUGS_EXAMPLES = Object.freeze({
  positive: Object.freeze([
    Object.freeze({
      text: "يبيع المخدرات للزبائن.",
      classification: "Drug trafficking",
    }),
    Object.freeze({
      text: "يصنع الحبوب في المختبر.",
      classification: "Drug manufacturing",
    }),
    Object.freeze({
      text: "جربها وستحبها.",
      classification: "Drug promotion",
    }),
    Object.freeze({
      text: "يتعاطى المخدر الآن.",
      classification: "Drug use",
    }),
  ]) as readonly DrugsExample[],
  negative: Object.freeze([
    Object.freeze({
      text: "الطبيب وصف الدواء بجرعة دقيقة.",
      classification: "Medical exception",
    }),
    Object.freeze({
      text: "المدرس يشرح مخاطر الجرعة الزائدة.",
      classification: "Educational exception",
    }),
    Object.freeze({
      text: "الخبر يذكر تجارة المخدرات قبل سنوات.",
      classification: "Historical reporting",
    }),
  ]) as readonly DrugsExample[],
});
