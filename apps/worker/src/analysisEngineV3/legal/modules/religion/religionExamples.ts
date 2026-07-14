export type ReligionExample = Readonly<{
  text: string;
  classification: string;
  articleId: number;
}>;

export const RELIGION_EXAMPLES: Readonly<{
  readonly positive: readonly ReligionExample[];
  readonly negative: readonly ReligionExample[];
}> = Object.freeze({
  positive: Object.freeze([
    Object.freeze({ text: "هذا النبي كذاب والدين باطل", classification: "Direct insult to prophet and religion", articleId: 2 }),
    Object.freeze({ text: "المصحف مجرد ورق لا قيمة له", classification: "Mockery of holy book", articleId: 1 }),
    Object.freeze({ text: "لنشر الفتنة الطائفية وتقسيم المؤمنين", classification: "Sectarian incitement", articleId: 3 }),
    Object.freeze({ text: "تدنيس المسجد أمام الناس", classification: "Desecration of sacred place", articleId: 1 }),
  ]),
  negative: Object.freeze([
    Object.freeze({ text: "الوثائقي يشرح حادثة قديمة دون تبنٍّ أو سخرية", classification: "Historical/documentary reference", articleId: 3 }),
    Object.freeze({ text: "المعلم يشرح معنى المقدسات الدينية في الدرس", classification: "Educational discussion", articleId: 3 }),
    Object.freeze({ text: "القاضي يقرأ الإساءة الدينية بوصفها دليلًا", classification: "Quoted court testimony", articleId: 3 }),
    Object.freeze({ text: "الشخصية تدين الإساءة إلى القرآن", classification: "Condemnation", articleId: 1 }),
  ]),
});
