import assert from "node:assert/strict";
import { normalizeFindingTitleAgainstRationale } from "./findingTitleNormalize.js";

function normalize(input: {
  titleAr: string;
  rationaleAr: string;
  evidenceSnippet?: string;
}) {
  return normalizeFindingTitleAgainstRationale({
    titleAr: input.titleAr,
    rationaleAr: input.rationaleAr,
    evidenceSnippet: input.evidenceSnippet ?? "",
    source: "ai",
  });
}

assert.equal(
  normalize({
    titleAr: "المساس بالثوابت الدينية",
    evidenceSnippet: "إذا جبت درجة ناقصة مرة ثانية، العن والديك انت فاهم",
    rationaleAr: "العبارة تتضمن إساءة صريحة للوالدين وتحريض الطفل على عقوق والديه، ما يندرج تحت مخالفة الإساءة إلى الوالدين.",
  }),
  "الإساءة إلى الوالدين",
);

assert.equal(
  normalize({
    titleAr: "المشاهد الجنسية الصريحة",
    evidenceSnippet: "أنت كذّاب… دايمًا تتأخر.",
    rationaleAr: "المعلم يهدد الطفل سامي بالعنف إذا اشتكى، وهو تهديد مباشر بالإيذاء الجسدي لطفل.",
  }),
  "إيذاء الطفل وذوي الإعاقة",
);

assert.equal(
  normalize({
    titleAr: "المساس بالثوابت الدينية",
    evidenceSnippet: "يلعن امها",
    rationaleAr: "يستخدم فهد لفظًا نابيًا كشتيمة عامة، وهو لفظ سب مباشر وخادش للحياء، ويعد من الألفاظ النابية.",
  }),
  "الألفاظ النابية",
);

assert.equal(
  normalize({
    titleAr: "مخالفة محتوى",
    evidenceSnippet: "الدنيا لازم تنقلب عليهم",
    rationaleAr: "هناك تحريض صريح على قلب نظام الحكم والدعوة إلى الفوضى.",
  }),
  "المساس بالقيادة السياسية",
);

console.log("All finding title normalization tests passed.");
