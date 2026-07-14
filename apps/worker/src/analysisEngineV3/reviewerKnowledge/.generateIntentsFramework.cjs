const { mkdirSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

const ROOT = join(process.cwd(), "apps", "worker", "src", "analysisEngineV3", "reviewerKnowledge", "reasoning", "intents");
const BLUEPRINT_DIR = join(ROOT, "blueprints", "intents");
const ACADEMY_DIR = join(ROOT, "academy", "intents");
const LESSON_DIR = join(ROOT, "lessons", "intents");
const PATTERN_DIR = join(ROOT, "patternLibraries", "intents");
const DECISION_DIR = join(ROOT, "decisionRecords", "examples", "intents");
const BENCHMARK_DIR = join(ROOT, "benchmarks", "intents");
const COVERAGE_DIR = join(ROOT, "coverage");

const GROUPS = {
  baseline: {
    role: "Neutral reference",
    articleId: 11,
    atoms: ["11-1"],
    examples: ["مجرد وصف محايد", "A reporter states the facts without taking a side."],
    heuristics: [
      "Neutral intent is a baseline, not a hidden violation.",
      "Look for the absence of praise, condemnation, instruction, or coercion.",
      "Check whether the line simply observes rather than evaluates.",
    ],
    evidence: [
      "A neutral statement usually stays descriptive and does not push the audience toward action.",
      "The speaker does not clearly endorse, oppose, or instruct.",
    ],
    falsePositives: [
      "A descriptive line treated as an endorsement.",
      "A quoted phrase treated as the narrator's own motive.",
    ],
    exceptions: ["Quotation", "Role play", "Documentary", "News reporting"],
    guidance: [
      "Use neutral when the line only reports or names something.",
      "Confidence should stay moderate unless the scene explicitly shows a stronger stance.",
    ],
    disposition: "reject",
    confidence: "high",
  },
  factual: {
    role: "Factual communication",
    articleId: 11,
    atoms: ["11-1", "11-2", "11-3"],
    examples: ["يشرح الفكرة للطلاب", "The report explains the event plainly."],
    heuristics: [
      "Factual intent is usually explicit in explanation, reporting, or teaching.",
      "Check for source-like language, explanation markers, and absence of emotional pushing.",
      "Do not collapse factual explanation into endorsement.",
    ],
    evidence: [
      "Factual language is anchored by explanation, reporting, or instruction markers.",
      "The speaker usually frames the material as information to be understood.",
    ],
    falsePositives: [
      "A class or report misread as promotion.",
      "A neutral description mistaken for a stance.",
    ],
    exceptions: ["Quotation", "Documentary", "Court testimony", "Police investigation"],
    guidance: [
      "Use factual intent when the line aims to explain or describe.",
      "Corroboration from surrounding context should raise confidence.",
    ],
    disposition: "reject",
    confidence: "high",
  },
  evaluative: {
    role: "Evaluative stance",
    articleId: 4,
    atoms: ["4-1", "4-2", "4-4", "4-5"],
    examples: ["يدين الفعل", "The speaker praises the act."],
    heuristics: [
      "Evaluative intent shows approval, condemnation, encouragement, promotion, or glorification.",
      "Distinguish praise from instruction and condemnation from neutral description.",
      "Treat explicit stance words as strong signals.",
    ],
    evidence: [
      "The line contains praise, blame, pushing, or celebration language.",
      "The speaker is not merely narrating but taking a side.",
    ],
    falsePositives: [
      "A quoted line repeated in a report.",
      "A fictional villain line that the story later rejects.",
    ],
    exceptions: ["Condemnation", "Documentary", "Court testimony", "Police investigation", "News reporting"],
    guidance: [
      "Identify whether the stance is positive, negative, or urging action.",
      "Use the scene context before deciding that a stance is real or only quoted.",
    ],
    disposition: "review",
    confidence: "medium",
  },
  coercive: {
    role: "Coercive or instructive pressure",
    articleId: 4,
    atoms: ["4-2", "4-5", "12-1", "12-3"],
    examples: ["أجبره على الصمت", "The speaker tells others how to do it."],
    heuristics: [
      "Pressure, threat, coercion, and instruction are not interchangeable.",
      "Look for verbs that force, compel, direct, or operationalize.",
      "Separate a warning from a threat and a lesson from instruction.",
    ],
    evidence: [
      "The speaker tries to force behavior or provide actionable steps.",
      "The audience is being pushed toward a concrete outcome.",
    ],
    falsePositives: [
      "A warning misread as coercion.",
      "A harmless instruction misread as harmful instruction.",
    ],
    exceptions: ["Educational", "Medical", "Scientific", "Court testimony", "Police investigation"],
    guidance: [
      "Use this group for pressure or operational direction rather than observation.",
      "If the intent is only advisory, lower confidence.",
    ],
    disposition: "review",
    confidence: "medium",
  },
  comedic: {
    role: "Humor and irony",
    articleId: 4,
    atoms: ["4-7"],
    examples: ["كان يمزح فقط", "The line is sarcastic."],
    heuristics: [
      "Humor, irony, and sarcasm often hide the surface meaning.",
      "Check whether the joke is aimed at the topic or merely uses it as a vehicle.",
      "Do not treat a joke as a literal endorsement without context.",
    ],
    evidence: [
      "The line contains obvious joke framing or ironic delivery.",
      "Context and tone suggest playful distance from the literal words.",
    ],
    falsePositives: [
      "A joke treated as a factual statement.",
      "A satirical remark treated as endorsement.",
    ],
    exceptions: ["Satire", "Fiction", "Dream", "Role play"],
    guidance: [
      "Treat comedic intent as a context signal, not an automatic dismissal.",
      "Consider whether the humor softens, reverses, or disguises the meaning.",
    ],
    disposition: "reject",
    confidence: "medium",
  },
  fictional: {
    role: "Fictional and imaginative framing",
    articleId: 17,
    atoms: ["17-4", "17-5", "17-6"],
    examples: ["كان يمثل دورًا", "The character dreams the scene."],
    heuristics: [
      "Fictional framing includes dreams, flashbacks, role play, acting, and imagined scenes.",
      "Determine whether the event exists in the story world or inside a character's mind.",
      "Do not collapse imagination into reality.",
    ],
    evidence: [
      "The text marks the scene as imagined, staged, dreamed, remembered, or performed.",
      "The speaker or narration signals a fictional layer rather than a present factual assertion.",
    ],
    falsePositives: [
      "A memory treated as present reality.",
      "A role-play scene treated as a real-world confession.",
    ],
    exceptions: ["Dream", "Flashback", "Hallucination", "Imagination", "Role play", "Acting", "Storytelling"],
    guidance: [
      "Identify the story layer before classifying the intent.",
      "Lower confidence when the scene is nested inside fantasy or performance.",
    ],
    disposition: "reject",
    confidence: "medium",
  },
  conflict: {
    role: "Confession, false accusation, misunderstanding",
    articleId: 17,
    atoms: ["17-2", "17-3", "17-5", "17-6"],
    examples: ["هذا اعتراف", "The accusation is later corrected."],
    heuristics: [
      "Confession and accusation are not the same thing.",
      "A misunderstanding can reverse the apparent meaning of a line.",
      "Track correction, retraction, and later clarification.",
    ],
    evidence: [
      "The scene contains explicit disagreement or correction.",
      "Later dialogue, narration, or evidence changes the initial reading.",
    ],
    falsePositives: [
      "A false accusation turned into a real conclusion.",
      "A misunderstanding turned into a confirmed fact without support.",
    ],
    exceptions: ["Court testimony", "Police investigation", "News reporting", "Documentary"],
    guidance: [
      "Use the conflict group when the story itself argues about meaning.",
      "Do not finalize a conclusion until the correction path is checked.",
    ],
    disposition: "review",
    confidence: "low",
  },
};

const INTENTS = [
  { id: "neutral", title: "Neutral", group: "baseline", direct: "مجرد وصف محايد", indirect: "وصف بلا موقف", scenario: "الراوي يصف ما حدث فقط.", counter: "A report line should not be treated as endorsement.", benchmarkDisposition: "reject" },
  { id: "informative", title: "Informative", group: "factual", direct: "شرح معلومات", indirect: "تقديم معلومة", scenario: "المتحدث يشرح المعلومة بوضوح.", counter: "A descriptive line should not become a verdict.", benchmarkDisposition: "reject" },
  { id: "educational", title: "Educational", group: "factual", direct: "تعليمي", indirect: "شرح للطلاب", scenario: "المعلم يشرح الدرس للطلاب.", counter: "Education is not automatically endorsement.", benchmarkDisposition: "reject" },
  { id: "historical", title: "Historical", group: "factual", direct: "تاريخي", indirect: "حكاية من الماضي", scenario: "الوثائقي يسرد حادثة قديمة.", counter: "A past event should not be read as present praise.", benchmarkDisposition: "reject" },
  { id: "documentary", title: "Documentary", group: "factual", direct: "وثائقي", indirect: "عرض توثيقي", scenario: "الفيلم الوثائقي يعرض المادة بوصفها توثيقًا.", counter: "Documentary framing is informational, not praise.", benchmarkDisposition: "reject" },
  { id: "news_reporting", title: "News Reporting", group: "factual", direct: "خبر", indirect: "نقل خبر", scenario: "المذيع ينقل الخبر كما ورد.", counter: "A news report should not be treated as the speaker's stance.", benchmarkDisposition: "reject" },
  { id: "court_testimony", title: "Court Testimony", group: "factual", direct: "شهادة المحكمة", indirect: "نقل ما قيل في الجلسة", scenario: "الشاهد يكرر ما سمعه في المحكمة.", counter: "Quoted courtroom language is not automatic endorsement.", benchmarkDisposition: "reject" },
  { id: "police_investigation", title: "Police Investigation", group: "factual", direct: "تحقيق الشرطة", indirect: "مراجعة الملف", scenario: "الضابط يقرأ المحضر ويحلل الواقعة.", counter: "Investigative text records evidence rather than adopting it.", benchmarkDisposition: "reject" },
  { id: "medical", title: "Medical", group: "factual", direct: "طبي", indirect: "شرح سريري", scenario: "الطبيب يشرح الحالة للمريض.", counter: "Medical terminology is not automatically sexual or harmful.", benchmarkDisposition: "reject" },
  { id: "scientific", title: "Scientific", group: "factual", direct: "علمي", indirect: "شرح تجريبي", scenario: "الباحث يشرح الظاهرة علميًا.", counter: "Scientific explanation is informational, not promotional.", benchmarkDisposition: "reject" },
  { id: "religious_teaching", title: "Religious Teaching", group: "factual", direct: "تعليم ديني", indirect: "شرح الحكم", scenario: "المعلم يشرح الحكم الديني.", counter: "Teaching is not the same as endorsement of the subject matter.", benchmarkDisposition: "reject" },
  { id: "condemnation", title: "Condemnation", group: "evaluative", direct: "إدانة", indirect: "رفض واضح", scenario: "الشخص يدين الفعل ويرفضه.", counter: "Condemnation is the opposite of promotion.", benchmarkDisposition: "review" },
  { id: "approval", title: "Approval", group: "evaluative", direct: "موافقة", indirect: "مدح", scenario: "الشخص يثني على الفعل.", counter: "Praise is not neutral narration.", benchmarkDisposition: "review" },
  { id: "encouragement", title: "Encouragement", group: "evaluative", direct: "تشجيع", indirect: "حث", scenario: "المتحدث يشجع الآخرين على الفعل.", counter: "Encouragement is distinct from mere observation.", benchmarkDisposition: "review" },
  { id: "promotion", title: "Promotion", group: "evaluative", direct: "ترويج", indirect: "دعوة للتبني", scenario: "النص يروج للفكرة أو الفعل.", counter: "Promotion cannot be reduced to neutral mention.", benchmarkDisposition: "review" },
  { id: "glorification", title: "Glorification", group: "evaluative", direct: "تمجيد", indirect: "رفع القيمة", scenario: "المشهد يمجد السلوك ويجعله بطوليًا.", counter: "Glorification is stronger than simple approval.", benchmarkDisposition: "review" },
  { id: "instruction", title: "Instruction", group: "coercive", direct: "تعليمات", indirect: "خطوات", scenario: "النص يشرح كيف يتم الفعل.", counter: "Instruction is not the same as a warning.", benchmarkDisposition: "review" },
  { id: "threat", title: "Threat", group: "coercive", direct: "تهديد", indirect: "وعيد", scenario: "المتحدث يهدد الطرف الآخر.", counter: "Threat language must be supported by context.", benchmarkDisposition: "review" },
  { id: "coercion", title: "Coercion", group: "coercive", direct: "إكراه", indirect: "ضغط", scenario: "الطرف الأول يضغط على الطرف الثاني.", counter: "Pressure without force is not always coercion.", benchmarkDisposition: "review" },
  { id: "manipulation", title: "Manipulation", group: "coercive", direct: "تلاعب", indirect: "خداع", scenario: "النص يظهر تلاعبًا للحصول على نتيجة.", counter: "Manipulation requires evidence of hidden pressure.", benchmarkDisposition: "review" },
  { id: "revenge", title: "Revenge", group: "coercive", direct: "انتقام", indirect: "رد ثأري", scenario: "الشخص يرد بدافع الانتقام.", counter: "Revenge is intent-driven and needs corroboration.", benchmarkDisposition: "review" },
  { id: "self_defense", title: "Self Defense", group: "coercive", direct: "دفاع عن النفس", indirect: "حماية الذات", scenario: "الشخص يصف فعلًا دفاعيًا.", counter: "Self-defense is context-sensitive and not automatic.", benchmarkDisposition: "review" },
  { id: "protection", title: "Protection", group: "coercive", direct: "حماية", indirect: "حراسة", scenario: "الشخص يحمي آخر من الضرر.", counter: "Protection can be benign or coercive depending on context.", benchmarkDisposition: "reject" },
  { id: "humor", title: "Humor", group: "comedic", direct: "مزاح", indirect: "نكتة", scenario: "المشهد يعتمد على الدعابة.", counter: "Humor should not be read literally without context.", benchmarkDisposition: "reject" },
  { id: "satire", title: "Satire", group: "comedic", direct: "سخرية", indirect: "محاكاة ناقدة", scenario: "الكاتب يسخر من الفكرة عبر المبالغة.", counter: "Satire can invert the literal meaning.", benchmarkDisposition: "reject" },
  { id: "irony", title: "Irony", group: "comedic", direct: "تهكم", indirect: "قول عكس المقصود", scenario: "المعنى الظاهر عكس المقصود.", counter: "Irony requires careful context reading.", benchmarkDisposition: "reject" },
  { id: "sarcasm", title: "Sarcasm", group: "comedic", direct: "استهزاء", indirect: "تعليق لاذع", scenario: "المتكلم يعلق بسخرية لاذعة.", counter: "Sarcasm should not be mistaken for endorsement.", benchmarkDisposition: "reject" },
  { id: "fiction", title: "Fiction", group: "fictional", direct: "مشهد روائي", indirect: "عمل متخيل", scenario: "المشهد داخل قصة خيالية.", counter: "Fictional framing changes interpretation.", benchmarkDisposition: "reject" },
  { id: "fantasy", title: "Fantasy", group: "fictional", direct: "خيال", indirect: "عالم متخيل", scenario: "الأحداث تقع في عالم خيالي.", counter: "Fantasy may detach the line from reality.", benchmarkDisposition: "reject" },
  { id: "dream", title: "Dream", group: "fictional", direct: "حلم", indirect: "رؤية منامية", scenario: "الشخص يصف ما رآه في الحلم.", counter: "Dream content is not present-time reality.", benchmarkDisposition: "reject" },
  { id: "flashback", title: "Flashback", group: "fictional", direct: "استرجاع", indirect: "عودة للماضي", scenario: "المشهد يعود إلى حدث سابق.", counter: "A flashback can clarify or reverse meaning.", benchmarkDisposition: "reject" },
  { id: "hallucination", title: "Hallucination", group: "fictional", direct: "هلوسة", indirect: "مشهد غير واقعي", scenario: "الحدث يظهر كهلوسة داخل القصة.", counter: "Hallucination is internal to the character's mind.", benchmarkDisposition: "reject" },
  { id: "imagination", title: "Imagination", group: "fictional", direct: "تخيل", indirect: "صورة ذهنية", scenario: "الشخص يتخيل المشهد.", counter: "Imagination can weaken or reframe evidence.", benchmarkDisposition: "reject" },
  { id: "quotation", title: "Quotation", group: "factual", direct: "اقتباس", indirect: "نقل كلام", scenario: "النص يقتبس كلام شخص آخر.", counter: "Quotation is not necessarily the speaker's stance.", benchmarkDisposition: "reject" },
  { id: "role_play", title: "Role Play", group: "fictional", direct: "تمثيل دور", indirect: "لعب أدوار", scenario: "الشخصان يمارسان تمثيلًا داخل المشهد.", counter: "Role-play is a story layer, not a real-world confession.", benchmarkDisposition: "reject" },
  { id: "acting", title: "Acting", group: "fictional", direct: "تمثيل", indirect: "أداء", scenario: "الممثل يؤدي دورًا محددًا.", counter: "Acting can separate the actor from the role.", benchmarkDisposition: "reject" },
  { id: "storytelling", title: "Storytelling", group: "fictional", direct: "سرد", indirect: "حكي", scenario: "الشخص يروي قصة داخل القصة.", counter: "Storytelling can reframe the whole exchange.", benchmarkDisposition: "reject" },
  { id: "confession", title: "Confession", group: "conflict", direct: "اعتراف", indirect: "إقرار", scenario: "الشخص يعترف بما فعل.", counter: "A confession may be true, false, or coerced.", benchmarkDisposition: "review" },
  { id: "false_accusation", title: "False Accusation", group: "conflict", direct: "اتهام كاذب", indirect: "افتراء", scenario: "الشخص يتهم آخرًا ثم يتبين الخطأ.", counter: "An accusation is not a finding until supported.", benchmarkDisposition: "review" },
  { id: "misunderstanding", title: "Misunderstanding", group: "conflict", direct: "سوء فهم", indirect: "التباس", scenario: "المشهد ينتهي بتوضيح أن المعنى كان مختلفًا.", counter: "Misunderstanding can reverse intent.", benchmarkDisposition: "reject" },
];

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function titleize(value) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function text(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function groupTemplate(group) {
  return GROUPS[group] ?? GROUPS.baseline;
}

function intentTitle(id) {
  const item = INTENTS.find((entry) => entry.id === id);
  return item ? item.title : titleize(id);
}

function makeConceptEntry(intent) {
  const template = groupTemplate(intent.group);
  return {
    id: intent.id,
    title: intent.title,
    description: `${intent.title} identifies ${template.role.toLowerCase()} in reviewer reasoning.`,
  };
}

function makeRelationshipEntries() {
  const entries = [];
  entries.push({ id: "intent_relationship_001", from: "neutral", to: "informative", type: "parent" });
  entries.push({ id: "intent_relationship_002", from: "informative", to: "educational", type: "supports" });
  entries.push({ id: "intent_relationship_003", from: "educational", to: "scientific", type: "supports" });
  entries.push({ id: "intent_relationship_004", from: "historical", to: "documentary", type: "related" });
  entries.push({ id: "intent_relationship_005", from: "documentary", to: "news_reporting", type: "supports" });
  entries.push({ id: "intent_relationship_006", from: "news_reporting", to: "court_testimony", type: "supports" });
  entries.push({ id: "intent_relationship_007", from: "court_testimony", to: "police_investigation", type: "supports" });
  entries.push({ id: "intent_relationship_008", from: "medical", to: "scientific", type: "supports" });
  entries.push({ id: "intent_relationship_009", from: "religious_teaching", to: "documentary", type: "related" });
  entries.push({ id: "intent_relationship_010", from: "condemnation", to: "approval", type: "opposite" });
  entries.push({ id: "intent_relationship_011", from: "approval", to: "encouragement", type: "supports" });
  entries.push({ id: "intent_relationship_012", from: "encouragement", to: "promotion", type: "supports" });
  entries.push({ id: "intent_relationship_013", from: "promotion", to: "glorification", type: "supports" });
  entries.push({ id: "intent_relationship_014", from: "instruction", to: "coercion", type: "related" });
  entries.push({ id: "intent_relationship_015", from: "threat", to: "coercion", type: "requires" });
  entries.push({ id: "intent_relationship_016", from: "coercion", to: "manipulation", type: "supports" });
  entries.push({ id: "intent_relationship_017", from: "revenge", to: "self_defense", type: "related" });
  entries.push({ id: "intent_relationship_018", from: "self_defense", to: "protection", type: "supports" });
  entries.push({ id: "intent_relationship_019", from: "humor", to: "satire", type: "related" });
  entries.push({ id: "intent_relationship_020", from: "satire", to: "irony", type: "supports" });
  entries.push({ id: "intent_relationship_021", from: "irony", to: "sarcasm", type: "supports" });
  entries.push({ id: "intent_relationship_022", from: "fiction", to: "fantasy", type: "supports" });
  entries.push({ id: "intent_relationship_023", from: "fantasy", to: "dream", type: "supports" });
  entries.push({ id: "intent_relationship_024", from: "dream", to: "hallucination", type: "supports" });
  entries.push({ id: "intent_relationship_025", from: "hallucination", to: "imagination", type: "supports" });
  entries.push({ id: "intent_relationship_026", from: "quotation", to: "role_play", type: "related" });
  entries.push({ id: "intent_relationship_027", from: "role_play", to: "acting", type: "supports" });
  entries.push({ id: "intent_relationship_028", from: "acting", to: "storytelling", type: "supports" });
  entries.push({ id: "intent_relationship_029", from: "confession", to: "false_accusation", type: "related" });
  entries.push({ id: "intent_relationship_030", from: "false_accusation", to: "misunderstanding", type: "opposite" });
  entries.push({ id: "intent_relationship_031", from: "neutral", to: "quotation", type: "related" });
  entries.push({ id: "intent_relationship_032", from: "neutral", to: "fiction", type: "related" });
  entries.push({ id: "intent_relationship_033", from: "neutral", to: "confession", type: "related" });
  entries.push({ id: "intent_relationship_034", from: "neutral", to: "news_reporting", type: "related" });
  entries.push({ id: "intent_relationship_035", from: "neutral", to: "medical", type: "related" });
  return entries;
}

function makeBlueprintDocuments() {
  writeJson(join(BLUEPRINT_DIR, "domain.json"), {
    version: "1.0.0",
    id: "intent_motivation_domain",
    title: "Intent & Motivation Domain Blueprint",
    description: "Shared reviewer reasoning ontology for model-independent intent and motivation analysis.",
    entries: [
      {
        id: "intent_motivation_domain",
        title: "Intent & Motivation",
        description: "Cross-domain reasoning framework for reviewer intent, stance, and motivation.",
      },
    ],
  });

  writeJson(join(BLUEPRINT_DIR, "concepts.json"), {
    version: "1.0.0",
    id: "intent_motivation_concepts",
    title: "Intent & Motivation Concepts",
    description: "Canonical reviewer intent concepts.",
    entries: INTENTS.map(makeConceptEntry),
  });

  writeJson(join(BLUEPRINT_DIR, "actions.json"), {
    version: "1.0.0",
    id: "intent_motivation_actions",
    title: "Intent & Motivation Actions",
    description: "Reviewer actions used to reason about intent and motivation.",
    entries: [
      { id: "classify", title: "Classify", description: "Classify the apparent intent." },
      { id: "recognize", title: "Recognize", description: "Recognize the actual stance." },
      { id: "separate", title: "Separate", description: "Separate narration from endorsement." },
      { id: "infer", title: "Infer", description: "Infer the hidden motivation from evidence." },
      { id: "corroborate", title: "Corroborate", description: "Corroborate the intent with context." },
      { id: "quote", title: "Quote", description: "Treat quoted text as quoted text." },
      { id: "perform", title: "Perform", description: "Recognize acting or role play." },
      { id: "warn", title: "Warn", description: "Recognize warning or cautionary framing." },
      { id: "condemn", title: "Condemn", description: "Recognize explicit condemnation." },
      { id: "promote", title: "Promote", description: "Recognize promotion or glorification." },
      { id: "document", title: "Document", description: "Recognize documentary reporting." },
      { id: "educate", title: "Educate", description: "Recognize educational explanation." },
    ],
  });

  writeJson(join(BLUEPRINT_DIR, "targets.json"), {
    version: "1.0.0",
    id: "intent_motivation_targets",
    title: "Intent & Motivation Targets",
    description: "Targets that help the reviewer identify intent.",
    entries: [
      { id: "speaker", title: "Speaker", description: "The person or voice producing the line." },
      { id: "listener", title: "Listener", description: "The person or group receiving the line." },
      { id: "target", title: "Target", description: "The person or concept the line points to." },
      { id: "victim", title: "Victim", description: "The person harmed or protected by the intent." },
      { id: "narrator", title: "Narrator", description: "The story voice or reporting voice." },
      { id: "viewer", title: "Viewer", description: "The audience being addressed by the line." },
      { id: "reader", title: "Reader", description: "The audience reading the material." },
      { id: "character", title: "Character", description: "The in-story participant." },
      { id: "group", title: "Group", description: "A collective target or audience." },
      { id: "institution", title: "Institution", description: "A court, police, school, or similar body." },
    ],
  });

  writeJson(join(BLUEPRINT_DIR, "contexts.json"), {
    version: "1.0.0",
    id: "intent_motivation_contexts",
    title: "Intent & Motivation Contexts",
    description: "Contexts that change intent interpretation.",
    entries: [
      { id: "informal", title: "Informal", description: "Casual everyday communication." },
      { id: "documentary", title: "Documentary", description: "Documentary framing." },
      { id: "news", title: "News", description: "News reporting framing." },
      { id: "court", title: "Court", description: "Court testimony or legal proceedings." },
      { id: "police", title: "Police", description: "Police investigation or report." },
      { id: "medical", title: "Medical", description: "Medical or clinical context." },
      { id: "scientific", title: "Scientific", description: "Scientific explanation or observation." },
      { id: "religious", title: "Religious", description: "Religious teaching or explanation." },
      { id: "fiction", title: "Fiction", description: "Fictional narrative framing." },
      { id: "dream", title: "Dream", description: "Dream or dreamlike framing." },
      { id: "flashback", title: "Flashback", description: "Flashback or memory framing." },
      { id: "role_play", title: "Role Play", description: "Acting or role-play framing." },
    ],
  });

  writeJson(join(BLUEPRINT_DIR, "intents.json"), {
    version: "1.0.0",
    id: "intent_motivation_intents",
    title: "Intent & Motivation Intents",
    description: "Canonical intent categories used by every Academy domain.",
    entries: INTENTS.map((intent) => ({
      id: intent.id,
      title: intent.title,
      description: `${intent.title} describes ${groupTemplate(intent.group).role.toLowerCase()} in reviewer reasoning.`,
    })),
  });

  writeJson(join(BLUEPRINT_DIR, "evidence.json"), {
    version: "1.0.0",
    id: "intent_motivation_evidence",
    title: "Intent & Motivation Evidence",
    description: "Evidence rules for intent reasoning.",
    entries: [
      { id: "direct_evidence", title: "Direct Evidence", description: "Literal wording that directly expresses intent." },
      { id: "indirect_evidence", title: "Indirect Evidence", description: "Context, framing, or later dialogue that implies intent." },
      { id: "cross_sentence", title: "Cross-Sentence Evidence", description: "Evidence spread across multiple sentences." },
      { id: "scene_direction", title: "Scene Direction", description: "Visual or stage direction that changes interpretation." },
      { id: "quotation", title: "Quotation", description: "Quoted language that must not be confused with endorsement." },
      { id: "role_play", title: "Role Play", description: "Performed speech or acting inside the story." },
      { id: "exception_context", title: "Exception Context", description: "Context that may exclude a finding." },
      { id: "confidence_signal", title: "Confidence Signal", description: "Signals that raise or lower reviewer confidence." },
    ],
  });

  writeJson(join(BLUEPRINT_DIR, "relationships.json"), {
    version: "1.0.0",
    id: "intent_motivation_relationships",
    title: "Intent & Motivation Relationships",
    description: "Acyclic relationship graph between intent concepts.",
    entries: makeRelationshipEntries(),
  });

  writeJson(join(BLUEPRINT_DIR, "reviewQuestions.json"), {
    version: "1.0.0",
    id: "intent_motivation_review_questions",
    title: "Intent & Motivation Review Questions",
    description: "Questions that guide the reviewer when reading intent and motivation.",
    entries: [
      { id: "q01", title: "Who is speaking?", description: "Identify the speaker before reading the intent." },
      { id: "q02", title: "Who is being addressed?", description: "Identify the listener or target." },
      { id: "q03", title: "What is the speaker trying to do?", description: "Find the intended action or stance." },
      { id: "q04", title: "Is the line quoted?", description: "Check whether the words belong to someone else." },
      { id: "q05", title: "Is there a story layer?", description: "Look for fiction, dream, flashback, or role play." },
      { id: "q06", title: "Is the context factual?", description: "Check for news, court, police, or medical framing." },
      { id: "q07", title: "Does later context change the meaning?", description: "Use surrounding sentences before deciding." },
      { id: "q08", title: "Should confidence be reduced?", description: "Check ambiguity, irony, or contradiction." },
    ],
  });
}

function makePack() {
  const supportedConcepts = INTENTS.map((intent) => intent.id);
  writeJson(join(ACADEMY_DIR, "pack.v1.json"), {
    schema_version: 1,
    pack_version: { major: 1, minor: 0, patch: 0 },
    metadata: {
      id: "v3_08_intents",
      version: { major: 1, minor: 0, patch: 0 },
      title: "Intent & Motivation Reviewer Knowledge Pack",
      description: "Shared reviewer knowledge for intent, stance, framing, fiction, quotation, and exception reasoning.",
      supported_concepts: supportedConcepts,
    },
    pack: {
      id: "v3_08_intents",
      module_id: "v3_08_intents",
      title: "Intent & Motivation Reviewer Knowledge Pack",
      trigger_concept_ids: supportedConcepts,
      purpose: "Provide model-independent reviewer knowledge for interpreting intent and motivation across every Academy domain.",
      protected_interests: [
        "accurate intent interpretation",
        "stance calibration",
        "quotation safety",
        "fiction boundary detection",
        "story-layer separation",
        "exception handling",
        "confidence discipline",
      ],
      protected_concepts: supportedConcepts,
      required_evidence: [
        "The reviewer must anchor intent to literal wording when possible.",
        "The reviewer must use context, target, and speaker identity when literal wording is insufficient.",
        "The reviewer must distinguish endorsement from explanation, condemnation, or quotation.",
        "The reviewer must lower confidence when the scene is fictional, dreamlike, or contradictory.",
      ],
      insufficient_evidence: [
        "A single line with no context and no stance marker.",
        "A quotation repeated in a report without adoption by the narrator.",
        "A dream, flashback, or role-play line treated as present reality without support.",
        "A neutral observation treated as praise, blame, or threat.",
      ],
      reviewer_heuristics: [
        "Read the speaker, target, and surrounding scene before deciding the intent.",
        "Quotation, role play, acting, and storytelling are not the same as real-world endorsement.",
        "Documentary, news, court, police, medical, scientific, and religious teaching often lower the probability of harmful intent.",
        "Condemnation is not promotion, and humor is not a substitute for evidence.",
        "If later dialogue reverses the meaning, reevaluate the earlier line.",
      ],
      legal_exceptions: [
        "Quotation",
        "Role play",
        "Acting",
        "Storytelling",
        "Documentary",
        "News reporting",
        "Court testimony",
        "Police investigation",
        "Medical",
        "Scientific",
        "Religious teaching",
        "Dream",
        "Flashback",
        "Hallucination",
        "Imagination",
      ],
      positive_examples: [
        "A threat that is explicit and direct should be read as threat intent.",
        "A teacher explaining a concept should be read as educational intent.",
        "A documentary clip should be read as documentary intent even when the topic is sensitive.",
        "A character acting a role inside the scene should be read as role-play intent, not real-world confession.",
      ],
      negative_examples: [
        "A neutral report should not be upgraded to promotion.",
        "A quoted phrase should not become the narrator's own intent.",
        "A dream sequence should not be treated as present reality.",
        "A false accusation should not become a confirmed conclusion without support.",
      ],
      common_false_positives: [
        "Treating neutral reporting as endorsement.",
        "Treating a quoted line as the speaker's own motive.",
        "Treating humor as literal intent.",
        "Treating fiction or role play as real-world action.",
        "Treating a misunderstanding as a confirmed fact.",
      ],
      glossary_relationships: [
        { term: "intent", concept_id: "neutral", relation: "supports", note: "The core meta-term for the framework." },
        { term: "stance", concept_id: "condemnation", relation: "supports", note: "Stance terms often map to evaluative intent." },
        { term: "quotation", concept_id: "quotation", relation: "supports", note: "Quotation marks a non-owned utterance." },
        { term: "role play", concept_id: "role_play", relation: "supports", note: "Role play separates the actor from the role." },
        { term: "dream", concept_id: "dream", relation: "supports", note: "Dream marks a non-present layer." },
      ],
      article_mapping: [
        { article_id: 4, atom_ids: ["4-1", "4-2", "4-4", "4-5"], role: "Evaluative stance and pressure", note: "Use for praise, blame, urging, or pressure." },
        { article_id: 11, atom_ids: ["11-1", "11-2", "11-3"], role: "Factual and documentary framing", note: "Use for reporting, explanation, and quotation handling." },
        { article_id: 17, atom_ids: ["17-2", "17-4", "17-5", "17-6"], role: "Role play, fiction, and meaning reversal", note: "Use for fictional framing, misunderstanding, and false accusation handling." },
      ],
      reporting_guidance: [
        "Write the finding so that the identified intent is clear to reviewers.",
        "Mention the context that supports the reading, especially if the intent is indirect.",
        "If the scene is a quote, dream, flashback, or role play, state that the context lowers or changes the interpretation.",
      ],
    },
  });
}

function makeLesson() {
  writeJson(join(LESSON_DIR, "lesson_001_intent_framework.v1.json"), {
    id: "lesson_001_intent_framework",
    version: "1.0.0",
    language: "en",
    category: "reasoning",
    course: "Shared Intent & Motivation Framework",
    lessonNumber: 1,
    title: "Intent and Motivation Reasoning",
    summary: "Teach the reviewer to identify intent, stance, and motivation before any domain-specific judgment.",
    dependsOn: [],
    learningObjectives: [
      "Identify the apparent intent of a line.",
      "Separate narration, quotation, and role play from real-world stance.",
      "Use context to detect condemnation, promotion, or neutrality.",
      "Lower confidence when the scene is fictional, dreamlike, or contradictory.",
    ],
    definitions: {
      intent: "The purpose or stance behind the line.",
      motivation: "The reason the speaker appears to be speaking.",
      stance: "Whether the speaker supports, rejects, or merely reports the topic.",
      quotation: "A line repeated from someone else rather than owned by the current speaker.",
      rolePlay: "Speech inside a performed or acted layer of the story.",
      exception: "A context signal that changes or cancels a naive interpretation.",
    },
    reviewerPrinciples: [
      "Read the speaker before reading the intent.",
      "Read the target before reading the risk.",
      "Quotation is not endorsement.",
      "Role play is not real-world confession.",
      "Dreams and flashbacks lower confidence.",
      "Context can reverse the literal meaning of a line.",
    ],
    reviewerMethodology: [
      "Identify the speaker, listener, and target.",
      "Decide whether the line is factual, evaluative, or fictional.",
      "Check for quotation, role play, or other story layers.",
      "Use the surrounding scene to calibrate confidence.",
      "Only then choose the intent label.",
    ],
    reasoningProcess: [
      "Start with the literal line.",
      "Expand to the surrounding dialogue and narration.",
      "Classify the stance or motive.",
      "Test for exceptions such as quotation or fiction.",
      "Emit a confidence-adjusted intent decision.",
    ],
    evidenceRules: {
      minimum: [
        "A clear stance marker or intent marker in the literal text.",
      ],
      strong: [
        "Speaker, target, and context all agree.",
        "Later dialogue confirms the interpretation.",
        "Scene direction or narration reinforces the stance.",
      ],
      weak: [
        "A single ambiguous sentence with no corroboration.",
        "A possible joke, quote, or fictional layer without confirmation.",
      ],
      insufficient: [
        "Guessing the intent from a keyword alone.",
        "Treating a fictional line as a real confession.",
        "Ignoring a later correction or contradiction.",
      ],
      confidenceGuidance: [
        "Low when only one ambiguous line is available.",
        "Medium when the line and context agree but an exception remains possible.",
        "High when multiple signals agree.",
        "Very High when the literal line, context, and story layer all align.",
      ],
    },
    contextRules: [
      "Quotation changes ownership of the words.",
      "Role play changes the level of reality.",
      "Dreams, flashbacks, and hallucinations change the time layer.",
      "Documentary, news, court, police, medical, and scientific framing often lower the risk of harmful intent.",
      "Later dialogue may reverse or clarify the initial reading.",
    ],
    sceneLevelReasoning: [
      "Review the full scene rather than a single line.",
      "Look for actions, objects, and camera or narration cues.",
      "Use the scene to distinguish factual from fictional intent.",
    ],
    characterRelationshipAnalysis: [
      "Identify whether the speaker is instructing, warning, joking, reporting, confessing, or performing.",
      "Check whether the listener is a friend, opponent, authority, or audience.",
      "Use relationship to determine whether the line is literal or strategic.",
    ],
    crossSentenceReasoning: [
      "One sentence may appear harmless while the next sentence changes the meaning.",
      "A later correction can invalidate an earlier inference.",
      "Never finalize intent before reading the immediate exchange.",
    ],
    crossSceneReasoning: [
      "A later scene can prove that an earlier line was fictional, quoted, or misunderstood.",
      "Do not freeze a conclusion before checking the scene progression.",
    ],
    confidenceRules: [
      "One line alone usually means low confidence.",
      "Multiple supporting signals raise confidence.",
      "Dialogue plus action raises confidence further.",
      "Dialogue plus action plus context gives very high confidence.",
    ],
    falsePositives: [
      "Neutral reporting misread as endorsement.",
      "Quotation misread as speaker intent.",
      "Dream or flashback misread as present action.",
      "Role play misread as real-world confession.",
    ],
    exceptions: [
      "If the line is quoted, preserve the quote boundary.",
      "If the line is performed, preserve the role boundary.",
      "If the line is dreamlike or fictional, preserve the story layer boundary.",
      "If the line is corrected later, preserve the correction.",
    ],
    examples: [
      { text: "A: \"هذه مجرد قصة\"", result: "Quotation and storytelling should be recognized before any stance decision." },
      { text: "المعلم يشرح الدرس بهدوء", result: "Educational intent, not promotion." },
      { text: "الضابط يقرأ المحضر", result: "Documentary or investigative intent, not endorsement." },
      { text: "قال الممثل إنه يخون الدور", result: "Role-play and acting context should lower confidence." },
      { text: "قالها في حلمه ثم استيقظ", result: "Dream context should stop a present-time conclusion." },
    ],
    counterExamples: [
      { text: "Treat quotation as endorsement.", reason: "Quotation changes ownership of the words." },
      { text: "Treat a joke as a literal confession.", reason: "Humor changes intent and lowers confidence." },
      { text: "Ignore the later correction.", reason: "Later context can reverse the meaning." },
    ],
    reviewerQuestions: [
      "Who is speaking?",
      "Who is the listener or target?",
      "Is the line factual, evaluative, or fictional?",
      "Is the line quoted or performed?",
      "Does later context reverse the meaning?",
      "What confidence should the reviewer assign?",
    ],
    gcamMapping: [],
    exercises: [
      { prompt: "Classify a quoted line and explain why the quote boundary matters.", expectedOutcome: "The reviewer should separate quotation from endorsement." },
      { prompt: "Read a dream sequence and say whether it should be treated as present reality.", expectedOutcome: "The reviewer should lower confidence and avoid a present-time conclusion." },
    ],
    decisionTree: [
      { step: 1, question: "Is the line owned by the current speaker?", yes: 2, no: "Treat as quotation" },
      { step: 2, question: "Is the scene factual or fictional?", yes: 3, no: "Lower confidence" },
      { step: 3, question: "Do later lines confirm the stance?", yes: "Accept", no: "Needs Review" },
    ],
    commonMistakes: [
      "Ignoring quotation boundaries.",
      "Ignoring role-play or acting boundaries.",
      "Ignoring later correction.",
      "Treating a neutral report as a stance.",
    ],
    reportTemplate: {
      findingTitle: "Intent and Motivation Assessment",
      reasonTemplate: "The reviewer identified the intent from the literal line and its context.",
      recommendationTemplate: "The reviewer should preserve quotation, fiction, and context boundaries when writing the finding.",
    },
    benchmarkReferences: INTENTS.map((intent) => `intent_${intent.id}`),
    confidenceGuidance: {
      "95": "All signals align and no exception remains.",
      "80": "Context strongly supports the intent.",
      "60": "The line is meaningful but still ambiguous.",
      "40": "Only weak or partial support exists.",
      "0": "No reliable intent decision can be made.",
    },
    metadata: {
      author: "Raawi Academy",
      reviewLevel: "Shared Framework",
      priority: 1,
    },
  });
}

function makePatternLibrary() {
  const entries = INTENTS.map((intent, index) => {
    const template = groupTemplate(intent.group);
    const title = intentTitle(intent.id);
    return {
      id: `intent_pattern_${String(index + 1).padStart(2, "0")}_${intent.id}`,
      title: `${title} Pattern`,
      description: `${title} reviewer pattern for ${template.role.toLowerCase()}.`,
      primary_concept_id: intent.id,
      related_concept_ids: intent.id === "neutral" ? [] : ["neutral"],
      direct_expressions: [intent.direct, `${title} ${intent.direct}`],
      indirect_expressions: [intent.indirect, `${title} ${intent.indirect}`],
      semantic_intent: [intent.group, title.toLowerCase(), template.role.toLowerCase()],
      supporting_evidence: [
        `The literal text or scene direction signals ${title.toLowerCase()}.`,
        `The surrounding context supports the ${template.role.toLowerCase()} reading.`,
      ],
      contradictory_evidence: [
        "The line is only neutral reporting.",
        "The story explicitly reverses the apparent meaning.",
      ],
      false_positives: template.falsePositives,
      counter_examples: [
        `${title} appears in a quote or report without ownership.`,
        `${title} is later reversed by narration or dialogue.`,
      ],
      cross_sentence_indicators: [
        "Later dialogue confirms or reverses the meaning.",
        "A neighboring sentence changes the interpretation.",
      ],
      scene_indicators: [
        "dialogue",
        "narration",
        "scene direction",
        "camera language",
      ],
      reviewer_guidance: template.heuristics.concat(template.guidance),
      confidence_modifiers: [
        {
          id: `${intent.id}_direct`,
          title: "Direct Signal",
          description: `The intent is explicit in the literal wording for ${title.toLowerCase()}.`,
          confidence: 96,
        },
        {
          id: `${intent.id}_contextual`,
          title: "Contextual Signal",
          description: `The intent is implied by context for ${title.toLowerCase()}.`,
          confidence: 72,
        },
      ],
      glossary_relationships: intent.id === "neutral" ? [] : [
        {
          id: `${intent.id}_glossary_01`,
          from_concept_id: intent.id,
          to_concept_id: "neutral",
          relation: "supports",
          note: `${title} is anchored through the neutral baseline.`,
        },
      ],
      gcam_mappings: [
        {
          id: `${intent.id}_gcam_01`,
          article_id: template.articleId,
          atom_ids: template.atoms,
          role: `${title} intent mapping`,
          note: `Use when ${title.toLowerCase()} changes reviewer interpretation.`,
        },
      ],
      examples: [
        {
          id: `${intent.id}_example_01`,
          title: `${title} direct`,
          text: intent.example,
          expected_outcome: `The reviewer should recognize ${title.toLowerCase()} in the literal span.`,
          note: "Direct example.",
        },
        {
          id: `${intent.id}_example_02`,
          title: `${title} contextual`,
          text: `${intent.indirect} (${title})`,
          expected_outcome: `The reviewer should use context to evaluate ${title.toLowerCase()}.`,
          note: "Contextual example.",
        },
      ],
    };
  });

  writeJson(join(PATTERN_DIR, "intent_motivation_patterns.v1.json"), {
    schema_version: 1,
    version: { major: 1, minor: 0, patch: 0 },
    metadata: {
      id: "intent_motivation_patterns",
      title: "Intent & Motivation Semantic Patterns",
      description: "Semantic patterns for intent, stance, quotation, fiction, and exception reasoning.",
      concepts: INTENTS.map(makeConceptEntry),
    },
    entries,
  });
}

function makeDecisionRecords() {
  const lessonId = "lesson_001_intent_framework";
  const records = INTENTS.map((intent, index) => {
    const template = groupTemplate(intent.group);
    const title = intentTitle(intent.id);
    const patternId = `intent_pattern_${String(index + 1).padStart(2, "0")}_${intent.id}`;
    const articleId = template.articleId;
    const disposition = intent.benchmarkDisposition === "review" ? "review" : "reject";
    return {
      id: `decision_${String(index + 1).padStart(3, "0")}_${intent.id}`,
      version: "1.0.0",
      title: `${title} decision record`,
      summary: `Reviewer reasoning record for ${title.toLowerCase()}.`,
      originalScenario: intent.scenario,
      reviewQuestion: `Is the intent primarily ${title.toLowerCase()}?`,
      initialSuspicion: `${title} appears in the scene or context.`,
      possibleConcepts: [intent.id, "neutral", template.role.toLowerCase()],
      supportingEvidence: [intent.scenario, `${title} is the active intent concept.`],
      contradictingEvidence: intent.group === "baseline" ? ["The scene stays neutral unless later context changes it."] : template.falsePositives,
      requiredMissingEvidence: intent.group === "baseline" ? ["No stance marker, no threat marker, and no fictional layer."] : ["No conflicting later correction."],
      sceneContext: intent.scenario,
      speakerAnalysis: template.role.includes("Factual") ? "The speaker sounds like a reporter, teacher, or witness." : "The speaker's stance must be read from the scene.",
      targetAnalysis: intent.group === "coercive" ? "The target is being pressured or directed." : "The target must be identified from context.",
      intentAnalysis: title,
      reasoningSteps: [
        "Identify the speaker.",
        "Identify the target or audience.",
        "Check for quotation, fiction, or reporting context.",
        "Apply the intent and exception rules.",
        "Map the scene to the article guidance.",
      ],
      reviewerDecision: template.guidance[0] ?? `Recognize ${title.toLowerCase()} only if the context supports it.`,
      confidence: template.confidence,
      findingType: disposition,
      gcamMappings: [
        {
          article_id: articleId,
          atom_ids: template.atoms,
          note: `${title} intent mapping.`,
        },
      ],
      falsePositiveRisk: intent.group === "baseline" || intent.group === "factual" ? "Low" : "Medium",
      reviewerNotes: `Use the ${intent.group} pattern and preserve the exact evidence span for ${intent.id}.`,
      benchmarkTags: [intent.id, `intent_${intent.id}`, intent.group],
      relatedLessons: [lessonId],
      relatedPatterns: [patternId],
      relatedBlueprintConcepts: [intent.id, "neutral"],
    };
  });

  ensureDir(DECISION_DIR);
  for (const record of records) {
    writeJson(join(DECISION_DIR, `${record.id}.v1.json`), record);
  }
}

function makeBenchmarkCases() {
  const cases = INTENTS.map((intent, index) => {
    const template = groupTemplate(intent.group);
    const title = intentTitle(intent.id);
    const articleIds = [template.articleId];
    return {
      id: `intent-${String(index + 1).padStart(2, "0")}-${intent.id}`,
      title: `${title} reasoning case`,
      scriptSnippet: intent.example,
      storyMemory: intent.group === "fictional" ? "The scene is layered and may not be real." : intent.group === "factual" ? "The scene is explanatory and informational." : null,
      sceneMemory: intent.group === "fictional" ? "A performance, memory, dream, or performed layer is active." : null,
      neighboringSentences: Object.freeze([
        intent.indirect,
        intent.counter,
      ]),
      glossary: {
        title: "Intent Glossary",
        entries: [
          { term: title, articleId: template.articleId, variants: [intent.id], definition: template.role },
        ],
        notes: [],
      },
      subjectModule: {
        id: "v3_00_universal",
        titleAr: "الإطار العام",
        scope: "Shared intent reasoning benchmark",
        rules: [],
        exclusions: [],
        requiredEvidence: [],
        decisionTree: [],
        examples: [],
        nonExamples: [],
        articleIds: [],
        notes: [],
      },
      expectedConcepts: [intent.id],
      expectedReviewerAssessment: {
        narrativeUnderstanding: title,
        speaker: intent.group === "baseline" ? "Narrator" : "Speaker",
        target: intent.group === "baseline" ? null : "Target",
        victim: null,
        narrativeIntent: title.toLowerCase(),
        evidenceStrength: intent.group === "baseline" ? 0.46 : intent.group === "factual" ? 0.67 : intent.group === "fictional" ? 0.58 : 0.74,
        contextClassification: intent.group,
        literalVsImpliedMeaning: intent.group === "baseline" || intent.group === "factual" ? "literal" : "contextual",
        exceptionSignals: intent.group === "fictional" ? [intent.id] : [],
      },
      expectedLegalModule: "v3_00_universal",
      expectedArticleMapping: articleIds,
      expectedFinding: {
        disposition: intent.benchmarkDisposition,
        summary: `module=v3_00_universal | disposition=${intent.benchmarkDisposition} | articles=${articleIds.join(",")} | concepts=${intent.id}`,
      },
      expectedExplanation: [
        `module=v3_00_universal`,
        `concepts=${intent.id}`,
        `intent=${title.toLowerCase()}`,
        `context=${intent.group}`,
        `exceptions=${intent.group === "fictional" ? "fictional_layer" : intent.group === "factual" ? "reporting_layer" : "none"}`,
        `articles=${articleIds.join(",")}`,
        `disposition=${intent.benchmarkDisposition}`,
      ].join(" | "),
      expectedConfidenceRange: {
        min: intent.group === "baseline" ? 0.2 : intent.group === "factual" ? 0.55 : intent.group === "fictional" ? 0.45 : 0.6,
        max: intent.group === "baseline" ? 1 : intent.group === "factual" ? 1 : intent.group === "fictional" ? 0.95 : 1,
      },
    };
  });

  writeJson(join(BENCHMARK_DIR, "intent_benchmark_cases.v1.json"), {
    version: "1.0.0",
    id: "intent_benchmark_catalog",
    title: "Intent & Motivation Benchmark Catalog",
    description: "Deterministic benchmark cases for the shared intent and motivation framework.",
    cases,
  });
}

function makeCoverageReport() {
  writeJson(join(COVERAGE_DIR, "intent_coverage_manifest.json"), {
    domainId: "intents",
    title: "Intent & Motivation Coverage Manifest",
    version: "1.0.0",
    note: "Generated after validation; see domainCoverage analyzer output.",
  });
}

function main() {
  ensureDir(ROOT);
  ensureDir(BLUEPRINT_DIR);
  ensureDir(ACADEMY_DIR);
  ensureDir(LESSON_DIR);
  ensureDir(PATTERN_DIR);
  ensureDir(DECISION_DIR);
  ensureDir(BENCHMARK_DIR);
  ensureDir(COVERAGE_DIR);

  makeBlueprintDocuments();
  makePack();
  makeLesson();
  makePatternLibrary();
  makeDecisionRecords();
  makeBenchmarkCases();
  makeCoverageReport();
}

main();
