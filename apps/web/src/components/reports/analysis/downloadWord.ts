import JSZip from "jszip";
import type { AnalysisFinding } from "@/api";
import { mapAnalysisFindingsForPdf } from "./mapper";
import { displayPageForFinding, type ViewerPageSlice } from "@/utils/viewerPageFromOffset";

type ReportHint = {
  canonical_finding_id: string;
  title_ar: string;
  evidence_snippet: string;
  severity: string;
  confidence: number;
  rationale?: string | null;
  primary_article_id?: number | null;
};

type ScriptSummary = {
  synopsis_ar: string;
  key_risky_events_ar?: string;
  narrative_stance_ar?: string;
  compliance_posture_ar?: string;
  confidence: number;
};

export interface DownloadAnalysisWordParams {
  scriptTitle: string;
  clientName: string;
  createdAt: string;
  logoUrl?: string | null;
  scriptType?: string | null;
  workClassification?: string | null;
  pageCount?: number | null;
  episodeCount?: number | null;
  receivedAt?: string | null;
  deliveredAt?: string | null;
  viewerPages?: ViewerPageSlice[] | null;
  findings?: AnalysisFinding[] | null;
  findingsByArticle?: Array<{ article_id: number; top_findings?: Array<{ title_ar?: string; severity?: string; confidence?: number; evidence_snippet?: string }> }> | null;
  canonicalFindings?: Array<{
    canonical_finding_id: string;
    title_ar: string;
    evidence_snippet: string;
    severity: string;
    confidence: number;
    rationale?: string | null;
    pillar_id?: string | null;
    primary_article_id?: number | null;
    related_article_ids?: number[];
    start_line_chunk?: number | null;
    end_line_chunk?: number | null;
    page_number?: number | null;
    primary_policy_atom_id?: string | null;
    source?: string | null;
  }> | null;
  reportHints?: ReportHint[] | null;
  scriptSummary?: ScriptSummary | null;
  lang: "ar" | "en";
}

const ANALYSIS_TEMPLATE_URL = "/analysis-cover-template.docx";
const DOC_COLOR = "111827";
const LABEL_FONT = "Cairo ExtraLight";
const VALUE_FONT = "Cairo ExtraLight";
const TITLE_FONT = "Tahoma";
const TABLE_FONT = "Cairo ExtraLight";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDate(value: string, lang: "ar" | "en"): string {
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function plainText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function applyRtlMarks(text: string, rtl?: boolean): string {
  if (!rtl) return text;
  return text
    .split("\n")
    .map((line) => (line ? `\u200F${line}` : line))
    .join("\n");
}

function formatNullableDate(value: string | null | undefined, lang: "ar" | "en"): string {
  const text = plainText(value);
  return text ? formatDate(text, lang) : "—";
}

function formatNullableValue(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text || "—";
}

function normalizeScriptType(value: string | null | undefined, lang: "ar" | "en"): string {
  const raw = plainText(value).toLowerCase();
  if (!raw) return "—";
  if (lang === "ar") {
    if (raw === "film") return "فلم";
    if (raw === "series") return "مسلسل";
  } else {
    if (raw === "film") return "Film";
    if (raw === "series") return "Series";
  }
  return plainText(value);
}

function buildFindingAction(params: {
  severity: string;
  source?: string | null;
  lang: "ar" | "en";
}): string {
  const severity = (params.severity ?? "").toLowerCase();
  if (params.lang === "ar") {
    if (params.source === "manual") return "مراجعة يدوية واتخاذ الإجراء المناسب";
    if (severity === "critical" || severity === "high") return "تعديل جوهري أو حذف قبل الاعتماد";
    if (severity === "medium") return "تعديل الصياغة أو تخفيف المعالجة";
    if (severity === "low") return "مراجعة المشهد والتأكد من ملاءمته";
    return "مراجعة واتخاذ الإجراء المناسب";
  }
  if (params.source === "manual") return "Manual review and appropriate action";
  if (severity === "critical" || severity === "high") return "Major edit or removal before approval";
  if (severity === "medium") return "Adjust wording or soften treatment";
  if (severity === "low") return "Review the scene and confirm suitability";
  return "Review and take the appropriate action";
}

function buildOverallRecommendations(args: {
  findings: ReturnType<typeof mapAnalysisFindingsForPdf>;
  reportHints: ReportHint[];
  lang: "ar" | "en";
}): string[] {
  const severityCounts = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const finding of args.findings) {
    const key = (finding.severity ?? "").toLowerCase() as keyof typeof severityCounts;
    if (key in severityCounts) severityCounts[key]++;
  }

  const recommendations: string[] = [];
  if (args.lang === "ar") {
    if (severityCounts.critical > 0 || severityCounts.high > 0) {
      recommendations.push("إعادة معالجة الملاحظات عالية الأولوية قبل اعتماد النص أو رفعه بصيغته النهائية.");
    }
    if (severityCounts.medium > 0) {
      recommendations.push("مراجعة المقاطع متوسطة الخطورة وتخفيف الصياغات أو المعالجة الدرامية حيث يلزم.");
    }
    if (severityCounts.low > 0 && recommendations.length === 0) {
      recommendations.push("مراجعة الملاحظات الواردة والتأكد من ملاءمتها قبل التنفيذ أو المشاركة.");
    }
    if (args.reportHints.length > 0) {
      recommendations.push("مراعاة الملاحظات الخاصة والتنبيهات السياقية أثناء التنفيذ حتى لو لم تُصنف كمخالفة مباشرة.");
    }
    if (recommendations.length === 0) {
      recommendations.push("لا توجد توصيات إضافية بخلاف الاستمرار في المراجعة النهائية قبل الاعتماد.");
    }
  } else {
    if (severityCounts.critical > 0 || severityCounts.high > 0) {
      recommendations.push("Address high-priority findings before final approval or submission.");
    }
    if (severityCounts.medium > 0) {
      recommendations.push("Review medium-severity findings and soften wording or treatment where needed.");
    }
    if (severityCounts.low > 0 && recommendations.length === 0) {
      recommendations.push("Review the listed findings and confirm they remain suitable before execution.");
    }
    if (args.reportHints.length > 0) {
      recommendations.push("Keep the special notes in mind during production even when they are not direct violations.");
    }
    if (recommendations.length === 0) {
      recommendations.push("No additional recommendations beyond final editorial review.");
    }
  }

  return recommendations;
}

function makeRun(text: string, options: {
  font: string;
  size: number;
  bold?: boolean;
  rtl?: boolean;
}): string {
  const escaped = escapeXml(text);
  const xmlSpace = /^[\s]|[\s]$/.test(text) ? ' xml:space="preserve"' : "";
  return `<w:r>
    <w:rPr>
      <w:rFonts w:ascii="${options.font}" w:eastAsia="Times New Roman" w:hAnsi="${options.font}" w:cs="${options.font}"/>
      ${options.bold ? "<w:b/><w:bCs/>" : ""}
      <w:color w:val="${DOC_COLOR}"/>
      <w:sz w:val="${options.size}"/>
      <w:szCs w:val="${options.size}"/>
      ${options.rtl ? "<w:rtl/>" : ""}
    </w:rPr>
    <w:t${xmlSpace}>${escaped}</w:t>
  </w:r>`;
}

function makeParagraph(text: string, options: {
  align?: "center" | "right" | "left";
  bidi?: boolean;
  font: string;
  size: number;
  bold?: boolean;
  spacingBefore?: number;
  spacingAfter?: number;
  rtl?: boolean;
}): string {
  const paragraphText = applyRtlMarks(text, options.rtl);
  return `<w:p>
    <w:pPr>
      ${options.bidi ? "<w:bidi/>" : ""}
      ${options.align ? `<w:jc w:val="${options.align}"/>` : ""}
      ${(options.spacingBefore != null || options.spacingAfter != null)
        ? `<w:spacing${options.spacingBefore != null ? ` w:before="${options.spacingBefore}"` : ""}${options.spacingAfter != null ? ` w:after="${options.spacingAfter}"` : ""}/>`
        : ""}
      <w:rPr>
        <w:rFonts w:ascii="${options.font}" w:eastAsia="Times New Roman" w:hAnsi="${options.font}" w:cs="${options.font}"/>
        ${options.bold ? "<w:b/><w:bCs/>" : ""}
        <w:color w:val="${DOC_COLOR}"/>
        <w:sz w:val="${options.size}"/>
        <w:szCs w:val="${options.size}"/>
        ${options.rtl ? "<w:rtl/>" : ""}
      </w:rPr>
    </w:pPr>
    ${paragraphText.split("\n").map((line, index) => `${index > 0 ? '<w:r><w:br/></w:r>' : ""}${makeRun(line, {
      font: options.font,
      size: options.size,
      bold: options.bold,
      rtl: options.rtl,
    })}`).join("")}
  </w:p>`;
}

function makeCoverRow(label: string, value: string): string {
  return `<w:tr>
    <w:trPr><w:divId w:val="411513269"/></w:trPr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="1069" w:type="pct"/>
        <w:tcMar><w:top w:w="75" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="75" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar>
        <w:hideMark/>
      </w:tcPr>
      ${makeParagraph(label, {
        bidi: true,
        align: "right",
        font: LABEL_FONT,
        size: 18,
        bold: true,
        spacingBefore: 180,
        rtl: true,
      })}
    </w:tc>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="3931" w:type="pct"/>
        <w:tcBorders><w:bottom w:val="single" w:sz="6" w:space="0" w:color="${DOC_COLOR}"/></w:tcBorders>
        <w:tcMar><w:top w:w="75" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="75" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar>
        <w:hideMark/>
      </w:tcPr>
      ${makeParagraph(value, {
        bidi: true,
        align: "center",
        font: VALUE_FONT,
        size: 18,
        bold: false,
        spacingBefore: 180,
        rtl: /[\u0600-\u06FF]/.test(value),
      })}
    </w:tc>
  </w:tr>`;
}

function makeCoverTable(params: DownloadAnalysisWordParams): string {
  const rows = [
    ["اسم العمل:", formatNullableValue(params.scriptTitle)],
    ["نوع العمل:", normalizeScriptType(params.scriptType, params.lang)],
    ["تصنيف العمل:", formatNullableValue(params.workClassification)],
    ["عدد الصفحات:", formatNullableValue(params.pageCount)],
    ["عدد الحلقات:", formatNullableValue(params.episodeCount)],
    ["تاريخ الاستلام:", formatNullableDate(params.receivedAt, params.lang)],
    ["تاريخ التسليم:", formatNullableDate(params.deliveredAt ?? params.createdAt, params.lang)],
  ];

  return `<w:tbl>
    <w:tblPr>
      <w:bidiVisual/>
      <w:tblW w:w="4241" w:type="pct"/>
      <w:tblInd w:w="719" w:type="dxa"/>
      <w:tblCellMar><w:top w:w="15" w:type="dxa"/><w:left w:w="15" w:type="dxa"/><w:bottom w:w="15" w:type="dxa"/><w:right w:w="15" w:type="dxa"/></w:tblCellMar>
      <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
    </w:tblPr>
    <w:tblGrid><w:gridCol w:w="1697"/><w:gridCol w:w="6242"/></w:tblGrid>
    ${rows.map(([label, value]) => makeCoverRow(label, value)).join("")}
  </w:tbl>`;
}

function makeLogoParagraph(): string {
  const cx = 2400000;
  const cy = 362000;
  return `<w:p>
    <w:pPr>
      <w:bidi/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${TITLE_FONT}" w:eastAsia="Times New Roman" w:hAnsi="${TITLE_FONT}" w:cs="${TITLE_FONT}"/>
        <w:noProof/>
        <w:color w:val="${DOC_COLOR}"/>
        <w:sz w:val="21"/>
        <w:szCs w:val="21"/>
      </w:rPr>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0" wp14:anchorId="175DFEBE" wp14:editId="27DCC7E8" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
          <wp:extent cx="${cx}" cy="${cy}"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:docPr id="1" name="Picture 1" descr="Saudi Film Commission Logo"/>
          <wp:cNvGraphicFramePr>
            <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
          </wp:cNvGraphicFramePr>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr>
                  <pic:cNvPr id="0" name="Picture 1" descr="Saudi Film Commission Logo"/>
                  <pic:cNvPicPr>
                    <a:picLocks noChangeAspect="1" noChangeArrowheads="1"/>
                  </pic:cNvPicPr>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:link="rId4" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                    <a:extLst>
                      <a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}">
                        <a14:useLocalDpi xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" val="0"/>
                      </a:ext>
                    </a:extLst>
                  </a:blip>
                  <a:srcRect/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr bwMode="auto">
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  <a:noFill/>
                  <a:ln><a:noFill/></a:ln>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`;
}

function makeTableCell(text: string, widthPct: number, options?: {
  header?: boolean;
  align?: "center" | "right" | "left";
  rtl?: boolean;
}): string {
  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${widthPct}" w:type="pct"/>
      <w:tcBorders>
        <w:top w:val="single" w:sz="8" w:color="${DOC_COLOR}"/>
        <w:left w:val="single" w:sz="8" w:color="${DOC_COLOR}"/>
        <w:bottom w:val="single" w:sz="8" w:color="${DOC_COLOR}"/>
        <w:right w:val="single" w:sz="8" w:color="${DOC_COLOR}"/>
      </w:tcBorders>
      <w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar>
      <w:vAlign w:val="top"/>
    </w:tcPr>
    ${makeParagraph(text, {
      bidi: options?.rtl ?? true,
      align: options?.align ?? "right",
      font: TABLE_FONT,
      size: options?.header ? 20 : 18,
      bold: options?.header ?? false,
      rtl: options?.rtl ?? true,
    })}
  </w:tc>`;
}

function buildFindingsTable(params: DownloadAnalysisWordParams): string {
  const findings = mapAnalysisFindingsForPdf(
    params.findings,
    params.findingsByArticle,
    params.findings && params.findings.length > 0 ? undefined : params.canonicalFindings
  );
  const rows = findings.length === 0
    ? [`
      <w:tr>
        ${makeTableCell("—", 800, { align: "center", rtl: false })}
        ${makeTableCell(params.lang === "ar" ? "لا توجد ملاحظات نهائية في هذا التقرير." : "There are no final findings in this report.", 2800)}
        ${makeTableCell(params.lang === "ar" ? "لا يوجد إجراء مطلوب حالياً." : "No action is required at this time.", 1400)}
      </w:tr>
    `]
    : findings.map((finding) => {
        const page = displayPageForFinding(
          finding.startOffsetGlobal ?? null,
          params.viewerPages ?? null,
          finding.pageNumber ?? null
        );
        const findingText = [
          plainText(finding.titleAr) || "ملاحظة",
          plainText(finding.evidenceSnippet) || "—",
        ].filter(Boolean).join("\n");
        return `<w:tr>
          ${makeTableCell(formatNullableValue(page), 800, { align: "center", rtl: false })}
          ${makeTableCell(findingText, 2800)}
          ${makeTableCell(buildFindingAction({
            severity: finding.severity,
            source: finding.source ?? null,
            lang: params.lang,
          }), 1400)}
        </w:tr>`;
      });

  return `<w:tbl>
    <w:tblPr>
      <w:bidiVisual/>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblLayout w:type="fixed"/>
      <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
    </w:tblPr>
    <w:tblGrid><w:gridCol w:w="1800"/><w:gridCol w:w="6300"/><w:gridCol w:w="3150"/></w:tblGrid>
    <w:tr>
      ${makeTableCell(params.lang === "ar" ? "الصفحة" : "Page", 800, { header: true, align: "center" })}
      ${makeTableCell(params.lang === "ar" ? "النص" : "Text", 2800, { header: true, align: "center" })}
      ${makeTableCell(params.lang === "ar" ? "الإجراء" : "Action", 1400, { header: true, align: "center" })}
    </w:tr>
    ${rows.join("")}
  </w:tbl>`;
}

function buildRecommendationsBlock(params: DownloadAnalysisWordParams): string {
  const findings = mapAnalysisFindingsForPdf(
    params.findings,
    params.findingsByArticle,
    params.findings && params.findings.length > 0 ? undefined : params.canonicalFindings
  );
  const reportHints = params.reportHints ?? [];
  const recommendations = buildOverallRecommendations({ findings, reportHints, lang: params.lang });
  const recTitle = params.lang === "ar" ? "التوصيات والتوجيهات/" : "Recommendations / Guidance";
  const recParagraphs = recommendations.map((item, index) =>
    makeParagraph(`${index + 1}- ${item}`, {
      bidi: params.lang === "ar",
      align: "right",
      font: TABLE_FONT,
      size: 18,
      bold: false,
      spacingAfter: 60,
      rtl: params.lang === "ar",
    })
  ).join("");

  const notes = reportHints.map((hint, index) =>
    makeParagraph(`${index + 1}. ${plainText(hint.evidence_snippet) || hint.title_ar}${hint.rationale ? ` - ${plainText(hint.rationale)}` : ""}`, {
      bidi: params.lang === "ar",
      align: "right",
      font: TABLE_FONT,
      size: 18,
      bold: false,
      spacingAfter: 40,
      rtl: params.lang === "ar",
    })
  ).join("");

  return [
    makeParagraph(recTitle, {
      bidi: params.lang === "ar",
      align: "right",
      font: TITLE_FONT,
      size: 22,
      bold: true,
      spacingBefore: 220,
      spacingAfter: 140,
      rtl: params.lang === "ar",
    }),
    recParagraphs,
    notes
      ? makeParagraph(params.lang === "ar" ? "ملاحظات خاصة:" : "Special Notes:", {
          bidi: params.lang === "ar",
          align: "right",
          font: TITLE_FONT,
          size: 20,
          bold: true,
          spacingBefore: 140,
          spacingAfter: 80,
          rtl: params.lang === "ar",
        }) + notes
      : "",
  ].join("");
}

function buildDocumentXml(templateXml: string, params: DownloadAnalysisWordParams): string {
  const bodyOpenMatch = templateXml.match(/^[\s\S]*?<w:body>/);
  const sectPrMatch = templateXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
  if (!bodyOpenMatch || !sectPrMatch) {
    throw new Error("Template DOCX body shell is invalid.");
  }

  const bodyOpen = bodyOpenMatch[0];
  const sectPr = sectPrMatch[0];
  const bodyContent = [
    makeParagraph("", { bidi: true, align: "center", font: TITLE_FONT, size: 21 }),
    makeParagraph("", { bidi: true, align: "center", font: TITLE_FONT, size: 21 }),
    makeLogoParagraph(),
    makeParagraph("تقرير الملاحظات", {
      bidi: true,
      align: "center",
      font: TITLE_FONT,
      size: 30,
      bold: true,
      spacingBefore: 80,
      spacingAfter: 260,
      rtl: true,
    }),
    makeCoverTable(params),
    makeParagraph("", { bidi: true, align: "right", font: TITLE_FONT, size: 20, spacingAfter: 60, rtl: true }),
    `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`,
    makeParagraph(params.lang === "ar" ? "جدول الملاحظات" : "Findings Table", {
      bidi: params.lang === "ar",
      align: "center",
      font: TITLE_FONT,
      size: 24,
      bold: true,
      spacingAfter: 180,
      rtl: params.lang === "ar",
    }),
    buildFindingsTable(params),
    buildRecommendationsBlock(params),
  ].join("");

  return `${bodyOpen}${bodyContent}${sectPr}</w:body></w:document>`;
}

function updateLogoRelationship(relsXml: string): string {
  const target = `${window.location.origin}/fclogo.png`;
  if (relsXml.includes('Id="rId4"')) {
    return relsXml.replace(
      /<Relationship Id="rId4" [^>]*Target="[^"]*"[^>]*\/>/,
      `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${escapeXml(target)}" TargetMode="External"/>`
    );
  }
  return relsXml.replace(
    "</Relationships>",
    `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${escapeXml(target)}" TargetMode="External"/></Relationships>`
  );
}

export async function downloadAnalysisWord(params: DownloadAnalysisWordParams): Promise<void> {
  const response = await fetch(ANALYSIS_TEMPLATE_URL);
  if (!response.ok) {
    throw new Error("Unable to load DOCX template.");
  }

  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("string");
  const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");

  if (!documentXml || !relsXml) {
    throw new Error("DOCX template is missing required Word XML files.");
  }

  zip.file("word/document.xml", buildDocumentXml(documentXml, params));
  zip.file("word/_rels/document.xml.rels", updateLogoRelationship(relsXml));

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const objectUrl = URL.createObjectURL(blob);
  const safeTitle = (params.scriptTitle || (params.lang === "ar" ? "تقرير" : "report"))
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const datePart = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `raawi_report_${safeTitle}_${datePart}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
