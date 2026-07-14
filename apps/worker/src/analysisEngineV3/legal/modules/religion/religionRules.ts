export type ReligionRuleSet = Readonly<{
  directTerms: readonly string[];
  directPhrases: readonly string[];
  religionAnchors: readonly string[];
  prophetAnchors: readonly string[];
  sacredPlaceAnchors: readonly string[];
  holyBookAnchors: readonly string[];
  companionAnchors: readonly string[];
  scholarAnchors: readonly string[];
  ritualAnchors: readonly string[];
  symbolAnchors: readonly string[];
  unityAnchors: readonly string[];
  sectarianAnchors: readonly string[];
  hateSpeechAnchors: readonly string[];
  quotationSignals: readonly string[];
  educationalSignals: readonly string[];
  historicalSignals: readonly string[];
  documentarySignals: readonly string[];
  newsSignals: readonly string[];
  courtSignals: readonly string[];
  condemnationSignals: readonly string[];
  fictionSignals: readonly string[];
  rolePlaySignals: readonly string[];
  dreamSignals: readonly string[];
  flashbackSignals: readonly string[];
  satireSignals: readonly string[];
}>;

export const RELIGION_RULES: ReligionRuleSet = Object.freeze({
  directTerms: Object.freeze([
    "كافر",
    "كفار",
    "كفر",
    "مرتد",
    "مرتدين",
    "زنديق",
    "زنادقة",
    "نجس",
    "دنس",
    "قذر",
    "حقير",
    "سخيف",
    "خرافة",
    "مهزلة",
    "باطل",
    "مزيف",
    "كذاب",
    "مخرف",
    "عديم القيمة",
    "لا قيمة له",
    "مجرد ورق",
  ]),
  directPhrases: Object.freeze([
    "يا كافر",
    "دينك باطل",
    "الإسلام باطل",
    "القرآن مزيف",
    "المصحف مجرد ورق",
    "النبي كذاب",
    "الرسول كذاب",
    "المسجد مكان وسخ",
    "المقدسات لا قيمة لها",
    "الصحابة أوباش",
    "العلماء جهلة",
    "الفتنة الطائفية هي الحل",
    "اكسروا الرموز الدينية",
    "اكرهوا المسلمين",
    "لا احترام للدين",
  ]),
  religionAnchors: Object.freeze([
    "الدين",
    "الإسلام",
    "مسلم",
    "مسلمة",
    "المسجد",
    "المساجد",
    "القرآن",
    "المصحف",
    "الصلاة",
    "الشعائر",
    "المقدسات",
  ]),
  prophetAnchors: Object.freeze([
    "النبي",
    "الرسول",
    "الرسول الكريم",
    "الأنبياء",
    "messenger",
    "prophet",
  ]),
  sacredPlaceAnchors: Object.freeze([
    "المسجد",
    "المساجد",
    "الكعبة",
    "الحرم",
    "البيت الحرام",
    "holy place",
  ]),
  holyBookAnchors: Object.freeze([
    "القرآن",
    "المصحف",
    "الكتب المقدسة",
    "holy book",
    "scripture",
  ]),
  companionAnchors: Object.freeze([
    "الصحابة",
    "الصحابي",
    "companions",
  ]),
  scholarAnchors: Object.freeze([
    "العلماء",
    "الشيخ",
    "المشايخ",
    "scholar",
    "scholars",
  ]),
  ritualAnchors: Object.freeze([
    "الشعائر",
    "الصلاة",
    "الصيام",
    "الزكاة",
    "الحج",
    "ritual",
  ]),
  symbolAnchors: Object.freeze([
    "الرموز الدينية",
    "الحجاب",
    "الهلال",
    "الصليب",
    "symbol",
  ]),
  unityAnchors: Object.freeze([
    "الوحدة الدينية",
    "الوحدة",
    "التآلف",
    "religious unity",
  ]),
  sectarianAnchors: Object.freeze([
    "الفتنة الطائفية",
    "الطائفية",
    "طائفي",
    "التكفير",
    "division",
  ]),
  hateSpeechAnchors: Object.freeze([
    "خطاب الكراهية الديني",
    "الكراهية الدينية",
    "اكرهوا المسلمين",
    "تحريض ديني",
  ]),
  quotationSignals: Object.freeze([
    "اقتباس",
    "اقتبس",
    "quoted",
    "quote",
    "نصًا",
    "حرفيًا",
    "«",
    "»",
    "\"",
  ]),
  educationalSignals: Object.freeze([
    "تعليمي",
    "تعليم",
    "شرح",
    "يشرح",
    "مثال",
    "أمثلة",
    "درس",
    "محاضرة",
    "أكاديمي",
    "مناقشة",
    "تحليل",
    "توضيح",
  ]),
  historicalSignals: Object.freeze([
    "تاريخي",
    "تاريخيًا",
    "تاريخيا",
    "historical",
    "الماضي",
    "واقعة قديمة",
  ]),
  documentarySignals: Object.freeze([
    "وثائقي",
    "documentary",
    "تقرير وثائقي",
  ]),
  newsSignals: Object.freeze([
    "خبر",
    "تقرير",
    "صحفي",
    "news",
  ]),
  courtSignals: Object.freeze([
    "المحكمة",
    "القاضي",
    "الشاهد",
    "جلسة",
    "النيابة",
    "court",
  ]),
  condemnationSignals: Object.freeze([
    "يستنكر",
    "ينتقد",
    "يدين",
    "إدانة",
    "يُدين",
    "رفض",
    "يرفض",
    "مرفوض",
    "لا يجوز",
    "مذموم",
    "مستنكر",
    "خطأ",
    "غير مقبول",
  ]),
  fictionSignals: Object.freeze([
    "رواية",
    "فيلم",
    "مشهد",
    "fiction",
    "خيال",
    "قصة",
  ]),
  rolePlaySignals: Object.freeze([
    "يلعب دور",
    "تمثيل دور",
    "role play",
    "يتقمص دور",
  ]),
  dreamSignals: Object.freeze([
    "حلم",
    "dream",
  ]),
  flashbackSignals: Object.freeze([
    "فلاشباك",
    "flashback",
    "استرجاع",
  ]),
  satireSignals: Object.freeze([
    "سخرية",
    "تهكم",
    "satire",
    "parody",
  ]),
});
