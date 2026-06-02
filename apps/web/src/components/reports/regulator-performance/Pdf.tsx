import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { formatDateTimeValue } from "@/utils/dateFormat";
import type { RegulatorPerformancePayload } from "@/api";
import { regPerfStyles as s } from "./styles";

function safe(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return `${Math.round(v * 100)}%`;
}

function actionLabel(type: string | null | undefined, lang: "ar" | "en"): string {
  const key = String(type ?? "").trim();
  if (!key) return "-";
  const mapAr: Record<string, string> = {
    recommendation_approved: "توصية بالموافقة",
    recommendation_rejected: "توصية بالرفض",
    send_for_review: "إرجاع للمستفيد",
    final_approved: "اعتماد نهائي",
    final_rejected: "رفض نهائي",
  };
  const mapEn: Record<string, string> = {
    recommendation_approved: "Recommend approval",
    recommendation_rejected: "Recommend rejection",
    send_for_review: "Sent back for review",
    final_approved: "Final approval",
    final_rejected: "Final rejection",
  };
  return lang === "ar" ? (mapAr[key] ?? key.replaceAll("_", " ")) : (mapEn[key] ?? key.replaceAll("_", " "));
}

function statusLabel(status: string | null | undefined, lang: "ar" | "en"): string {
  const key = String(status ?? "").trim().toLowerCase();
  const mapAr: Record<string, string> = {
    draft: "مسودة",
    assigned: "مُسند",
    in_review: "قيد المراجعة",
    review_required: "يحتاج مراجعة",
    completed: "مكتمل",
    approved: "مقبول",
    rejected: "مرفوض",
  };
  const mapEn: Record<string, string> = {
    draft: "Draft",
    assigned: "Assigned",
    in_review: "In review",
    review_required: "Review required",
    completed: "Completed",
    approved: "Approved",
    rejected: "Rejected",
  };
  return lang === "ar" ? ((mapAr[key] ?? key) || "-") : ((mapEn[key] ?? key) || "-");
}

function beneficiaryName(item: RegulatorPerformancePayload["scripts"][number], lang: "ar" | "en"): string {
  return item.beneficiaryName || (lang === "ar" ? "مستفيد" : "Beneficiary");
}

export function RegulatorPerformancePdf({
  data,
  lang,
  logoUrl,
  dateFormat,
}: {
  data: RegulatorPerformancePayload;
  lang: "ar" | "en";
  logoUrl?: string;
  dateFormat?: string;
}) {
  const isAr = lang === "ar";
  const rtl = isAr ? s.rtl : {};
  const scripts = data.scripts || [];
  const cycles = data.cycles || [];
  const timeline = data.timeline || [];
  const recommendedAgree = data.summary.recommendationAgreementRate;

  const scriptRows = scripts.slice(0, 20);
  const cycleRows = cycles.slice(0, 18);
  const timelineRows = timeline.slice(0, 24);
  const hasCycles = cycleRows.length > 0;

  return (
    <Document>
      <Page size="A4" wrap={false} style={[s.cover, isAr ? s.pageAr : {}]}>
        <View style={{ width: 595.28, height: 841.89, justifyContent: "center", alignItems: "center", paddingHorizontal: 44 }}>
          <View style={{ width: "100%", alignItems: "center", textAlign: "center" }}>
            {logoUrl ? <Image src={logoUrl} style={{ width: 150, height: 48, objectFit: "contain", marginBottom: 18 }} /> : null}
            <View style={[s.coverMetaBlock, { width: "100%", alignItems: "center" }]}>
              <Text style={[s.coverTitle, rtl, { textAlign: "center" }]}>{isAr ? "تقرير النشاط المسجل للمراجع / الفريق" : "Recorded Activity Report for Regulator / Team Member"}</Text>
              <Text style={[s.coverSub, rtl, { textAlign: "center" }]}>{isAr ? "ملخص تشغيلي مبني فقط على الأحداث المسجلة في النظام خلال الفترة المحددة" : "Operational summary based only on recorded system events within the selected period"}</Text>
              <Text style={[s.coverSub, rtl, { textAlign: "center" }]}>{isAr ? `اسم المستخدم: ${safe(data.regulator.name)}` : `User: ${safe(data.regulator.name)}`}</Text>
              <Text style={[s.coverSub, rtl, { textAlign: "center" }]}>{isAr ? `البريد: ${safe(data.regulator.email)}` : `Email: ${safe(data.regulator.email)}`}</Text>
              <Text style={[s.coverSub, rtl, { textAlign: "center" }]}>
                {isAr
                  ? `الفترة: ${formatDateTimeValue(data.scope.from, { lang: "ar", format: dateFormat })} - ${formatDateTimeValue(data.scope.to, { lang: "ar", format: dateFormat })}`
                  : `Period: ${formatDateTimeValue(data.scope.from, { lang: "en", format: dateFormat })} - ${formatDateTimeValue(data.scope.to, { lang: "en", format: dateFormat })}`}
              </Text>
            </View>
          </View>
        </View>
      </Page>

      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        <Text style={[s.title, rtl]}>{isAr ? "الملخص التنفيذي" : "Executive Summary"}</Text>
        <Text style={[s.subtitle, rtl]}>
          {isAr ? `هذا التقرير يوضح النشاط المسجل لـ ${safe(data.regulator.name)} خلال الفترة المحددة.` : `This report summarizes the recorded activity of ${safe(data.regulator.name)} during the selected period.`}
        </Text>

        <View style={s.statRow}>
          <View style={s.statCard}><Text style={[s.statValue, rtl]}>{data.summary.totalAssignedScripts}</Text><Text style={[s.statLabel, rtl]}>{isAr ? "النصوص المسندة" : "Assigned scripts"}</Text></View>
          <View style={s.statCard}><Text style={[s.statValue, rtl]}>{data.summary.totalRecommendations}</Text><Text style={[s.statLabel, rtl]}>{isAr ? "التوصيات المسجلة" : "Recorded recommendations"}</Text></View>
          <View style={s.statCard}><Text style={[s.statValue, rtl]}>{data.summary.totalSendBacks}</Text><Text style={[s.statLabel, rtl]}>{isAr ? "الإرجاعات المسجلة" : "Recorded send-backs"}</Text></View>
          <View style={s.statCard}><Text style={[s.statValue, rtl]}>{data.summary.totalCyclesHandled}</Text><Text style={[s.statLabel, rtl]}>{isAr ? "الدورات المسجلة" : "Recorded cycles"}</Text></View>
        </View>

        <View style={s.statRow}>
          <View style={s.statCard}><Text style={[s.statValue, rtl]}>{data.summary.totalApprovalRecommendations}</Text><Text style={[s.statLabel, rtl]}>{isAr ? "توصيات الموافقة المسجلة" : "Recorded approval recommendations"}</Text></View>
          <View style={s.statCard}><Text style={[s.statValue, rtl]}>{data.summary.totalRejectionRecommendations}</Text><Text style={[s.statLabel, rtl]}>{isAr ? "توصيات الرفض المسجلة" : "Recorded rejection recommendations"}</Text></View>
          <View style={s.statCard}><Text style={[s.statValue, rtl]}>{pct(recommendedAgree)}</Text><Text style={[s.statLabel, rtl]}>{isAr ? "توافق مع القرار النهائي" : "Agreement with final decision"}</Text></View>
          <View style={s.statCard}><Text style={[s.statValue, rtl]}>{data.summary.averageFirstActionMinutes == null ? "-" : Math.round(data.summary.averageFirstActionMinutes)}</Text><Text style={[s.statLabel, rtl]}>{isAr ? "أول إجراء مسجل بالدقائق" : "First recorded action (min)"}</Text></View>
        </View>
      </Page>

      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        <Text style={[s.title, rtl]}>{isAr ? "بيانات المستخدم" : "User Snapshot"}</Text>
        <View style={s.sectionBox}>
          <View style={s.row}><Text style={[s.key, rtl]}>{isAr ? "الاسم" : "Name"}</Text><Text style={[s.value, rtl]}>{safe(data.regulator.name)}</Text></View>
          <View style={s.row}><Text style={[s.key, rtl]}>{isAr ? "البريد" : "Email"}</Text><Text style={[s.value, rtl]}>{safe(data.regulator.email)}</Text></View>
          <View style={s.row}><Text style={[s.key, rtl]}>{isAr ? "نوع الدور" : "Role"}</Text><Text style={[s.value, rtl]}>{safe(data.regulator.roleKey)}</Text></View>
          <View style={s.row}>
            <Text style={[s.key, rtl]}>{isAr ? "المدة الزمنية" : "Reporting window"}</Text>
            <Text style={[s.value, rtl]}>
              {formatDateTimeValue(data.scope.from, { lang: isAr ? "ar" : "en", format: dateFormat })}
              {" - "}
              {formatDateTimeValue(data.scope.to, { lang: isAr ? "ar" : "en", format: dateFormat })}
            </Text>
          </View>
        </View>
      </Page>

      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        <Text style={[s.title, rtl]}>{isAr ? "النصوص المسندة" : "Assigned Scripts"}</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, rtl]}>{isAr ? "النص" : "Script"}</Text>
            <Text style={[s.th, rtl]}>{isAr ? "المستفيد" : "Beneficiary"}</Text>
            <Text style={[s.th, rtl]}>{isAr ? "الحالة" : "Status"}</Text>
            <Text style={[s.th, rtl, { borderRightWidth: 0 }]}>{isAr ? "الوقت" : "Time"}</Text>
          </View>
          {scriptRows.length === 0 ? (
            <View style={s.tr}>
              <Text style={[s.td, rtl, { borderRightWidth: 0, flex: 4 }]}>{isAr ? "لا توجد نصوص مسندة" : "No assigned scripts"}</Text>
            </View>
          ) : (
            scriptRows.map((row, idx) => {
              const cells = [
                row.title || "-",
                beneficiaryName(row, lang),
                statusLabel(row.status, lang),
                formatDateTimeValue(row.firstActionAt ?? row.assignedAt ?? row.receivedAt, { lang, format: dateFormat }),
              ];
              const ordered = isAr ? [...cells].reverse() : cells;
              return (
                <View key={`script-${row.id}-${idx}`} style={s.tr}>
                  {ordered.map((cell, cellIdx) => (
                    <Text key={`script-cell-${idx}-${cellIdx}`} style={[s.td, rtl, cellIdx === ordered.length - 1 ? { borderRightWidth: 0 } : {}]}>
                      {cell}
                    </Text>
                  ))}
                </View>
              );
            })
          )}
        </View>
      </Page>

      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        <Text style={[s.title, rtl]}>{isAr ? "تفاصيل المسارات الزمنية" : "Cycle Timeline Details"}</Text>
        <Text style={[s.subtitle, rtl]}>
          {hasCycles
            ? (isAr ? "كل دورة تم التعامل معها داخل فترة التقرير" : "Each handled revision cycle in the reporting window")
            : (isAr ? "لا توجد دورات، لذلك نعرض الأحداث الزمنية الأحدث بدلًا منها" : "No cycles were handled, so the latest timeline events are shown instead")}
        </Text>

        <View style={s.table}>
          <View style={s.tr}>
            {hasCycles ? (
              <>
                <Text style={[s.th, rtl]}>{isAr ? "النص" : "Script"}</Text>
                <Text style={[s.th, rtl]}>{isAr ? "الدورة" : "Cycle"}</Text>
                <Text style={[s.th, rtl]}>{isAr ? "أرسل في" : "Sent at"}</Text>
                <Text style={[s.th, rtl, { borderRightWidth: 0 }]}>{isAr ? "أعاد في" : "Returned at"}</Text>
              </>
            ) : (
              <>
                <Text style={[s.th, rtl]}>{isAr ? "الوقت" : "Time"}</Text>
                <Text style={[s.th, rtl]}>{isAr ? "الإجراء" : "Action"}</Text>
                <Text style={[s.th, rtl]}>{isAr ? "المستخدم" : "Actor"}</Text>
                <Text style={[s.th, rtl, { borderRightWidth: 0 }]}>{isAr ? "ملاحظة" : "Note"}</Text>
              </>
            )}
          </View>
          {hasCycles ? (
            cycleRows.map((cycle, idx) => {
              const script = scripts.find((s) => s.id === cycle.scriptId);
              const cells = [
                script?.title || cycle.scriptId || "-",
                safe(cycle.cycleNumber),
                formatDateTimeValue(cycle.sentAt, { lang, format: dateFormat }),
                formatDateTimeValue(cycle.returnedAt ?? cycle.reanalyzedAt, { lang, format: dateFormat }),
              ];
              const ordered = isAr ? [...cells].reverse() : cells;
              return (
                <View key={`cycle-${cycle.id}-${idx}`} style={s.tr}>
                  {ordered.map((cell, cellIdx) => (
                    <Text key={`cycle-cell-${idx}-${cellIdx}`} style={[s.td, rtl, cellIdx === ordered.length - 1 ? { borderRightWidth: 0 } : {}]}>
                      {cell}
                    </Text>
                  ))}
                </View>
              );
            })
          ) : (
            timelineRows.map((event, idx) => {
              const type = String((event as Record<string, unknown>).type ?? "");
              const at = String((event as Record<string, unknown>).at ?? "");
              const actor = String((event as Record<string, unknown>).actorName ?? (event as Record<string, unknown>).actor ?? "");
              const note = String((event as Record<string, unknown>).note ?? "");
              const cells = [
                formatDateTimeValue(at, { lang, format: dateFormat }),
                actionLabel(type, lang),
                safe(actor),
                note || "-",
              ];
              const ordered = isAr ? [...cells].reverse() : cells;
              return (
                <View key={`fallback-tl-${idx}`} style={s.tr}>
                  {ordered.map((cell, cellIdx) => (
                    <Text key={`fallback-cell-${idx}-${cellIdx}`} style={[s.td, rtl, cellIdx === ordered.length - 1 ? { borderRightWidth: 0 } : {}]}>
                      {cell}
                    </Text>
                  ))}
                </View>
              );
            })
          )}
        </View>
      </Page>

      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        <Text style={[s.title, rtl]}>{isAr ? "ملاحظات تشغيلية" : "Operational Notes"}</Text>
        <View style={s.sectionBox}>
          {(data.notes || []).length === 0 ? (
            <Text style={[s.note, rtl]}>{isAr ? "لا توجد ملاحظات إضافية." : "No additional notes."}</Text>
          ) : (
            data.notes.slice(0, 8).map((note, idx) => (
              <Text key={`note-${idx}`} style={[s.note, rtl]}>• {note}</Text>
            ))
          )}
          <Text style={[s.note, rtl, { marginTop: 8 }]}>
            {isAr
              ? "القيم الظاهرة هنا مبنية على الأحداث المسجلة فقط. الصفر يعني عدم وجود حدث مسجل لهذا المؤشر، والشرطة — تعني أن المؤشر غير متاح أو لم يُسجل بعد."
              : "The values shown here are based only on recorded events. Zero means no event was recorded for that metric, and the dash — means the metric is unavailable or not yet tracked."}
          </Text>
        </View>
      </Page>

      <Page size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
        <Text style={[s.title, rtl]}>{isAr ? "الخط الزمني الكامل" : "Full Timeline"}</Text>
        <Text style={[s.subtitle, rtl]}>{isAr ? "تسلسل الأحداث الفعلية في النظام" : "Chronological action stream in the system"}</Text>
        <View style={s.sectionBox}>
          {timelineRows.length === 0 ? (
            <Text style={[s.note, rtl]}>{isAr ? "لا توجد أحداث." : "No timeline events."}</Text>
          ) : (
            timelineRows.map((event, idx) => {
              const type = String((event as Record<string, unknown>).type ?? "");
              const at = String((event as Record<string, unknown>).at ?? "");
              const actor = String((event as Record<string, unknown>).actorName ?? (event as Record<string, unknown>).actor ?? "");
              const note = String((event as Record<string, unknown>).note ?? "");
              return (
                <View key={`tl-${idx}`} style={s.timelineItem}>
                  <Text style={[s.timelineText, rtl]}>
                    {formatDateTimeValue(at, { lang, format: dateFormat })} | {actionLabel(type, lang)} | {safe(actor)}
                  </Text>
                  {note ? <Text style={[s.note, rtl]}>{note}</Text> : null}
                </View>
              );
            })
          )}
        </View>
      </Page>
    </Document>
  );
}
