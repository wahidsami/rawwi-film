export type SexualityExample = Readonly<{
  readonly text: string;
  readonly classification: string;
}>;

export const SEXUALITY_EXAMPLES = Object.freeze({
  positive: Object.freeze([
    Object.freeze({
      text: "مشهد عارٍ صريح في غرفة النوم.",
      classification: "Explicit nudity",
    }),
    Object.freeze({
      text: "قالت له: اقترب أكثر.",
      classification: "Suggestive dialogue",
    }),
    Object.freeze({
      text: "الكاميرا تركز على الجسد والضوء خافت.",
      classification: "Camera framing",
    }),
    Object.freeze({
      text: "المدرس يشرح التثقيف الجنسي بشكل واضح.",
      classification: "Educational sexual context",
    }),
  ]) as readonly SexualityExample[],
  negative: Object.freeze([
    Object.freeze({
      text: "القصة تتحدث عن علاج طبي في العيادة.",
      classification: "Medical non-sexual context",
    }),
    Object.freeze({
      text: "كان يرتدي قميصًا مميزًا في المشهد.",
      classification: "Wardrobe note only",
    }),
    Object.freeze({
      text: "الراوي يقتبس شكوى دون endorsement.",
      classification: "Quoted report",
    }),
  ]) as readonly SexualityExample[],
});
