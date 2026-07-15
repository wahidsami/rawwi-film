export type SocietyExample = Readonly<{
  readonly text: string;
  readonly classification: string;
}>;

export const SOCIETY_EXAMPLES = Object.freeze({
  positive: Object.freeze([
    Object.freeze({
      text: "هذا تنمر على الطالب أمام الجميع.",
      classification: "Bullying",
    }),
    Object.freeze({
      text: "هذه عنصرية واضحة ضد الجار.",
      classification: "Racism",
    }),
    Object.freeze({
      text: "أهانوهم بسبب القبيلة.",
      classification: "Tribal attack",
    }),
    Object.freeze({
      text: "خطاب كراهية ضد النساء.",
      classification: "Hate speech",
    }),
  ]) as readonly SocietyExample[],
  negative: Object.freeze([
    Object.freeze({
      text: "المدرس يشرح لماذا التنمر خطأ.",
      classification: "Educational exception",
    }),
    Object.freeze({
      text: "الوثائقي يناقش التمييز تاريخيًا.",
      classification: "Documentary exception",
    }),
    Object.freeze({
      text: "النص يقتبس إهانة من شاهد.",
      classification: "Quoted report",
    }),
  ]) as readonly SocietyExample[],
});
