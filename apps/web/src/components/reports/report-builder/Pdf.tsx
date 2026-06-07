import React from 'react';
import { Document, Image, Page, Text, View } from '@react-pdf/renderer';
import { formatDate } from '@/utils/dateFormat';
import { builderPdfStyles as s } from './styles';

type BuilderPdfColumn = {
  label: string;
};

type BuilderPdfRow = {
  values: string[];
};

export interface ReportBuilderPdfData {
  sourceLabel: string;
  generatedAt: string;
  totalRows: number;
  filteredRows: number;
  selectedColumns: number;
  summaryCards: Array<{
    label: string;
    value: string;
    hint: string;
  }>;
  filters: Array<{
    label: string;
    value: string;
  }>;
  columns: BuilderPdfColumn[];
  rows: BuilderPdfRow[];
}

export interface ReportBuilderPdfProps {
  data: ReportBuilderPdfData;
  lang: 'ar' | 'en';
  dateFormat?: string;
  logoUrl?: string;
}

export const ReportBuilderPdf: React.FC<ReportBuilderPdfProps> = ({ data, lang, dateFormat, logoUrl }) => {
  const isAr = lang === 'ar';
  const rtl = isAr ? s.rtl : {};
  const visibleRows = data.rows.slice(0, 18);
  const selectedColumnsText = data.columns.map((col) => col.label).join(' • ');

  return (
    <Document>
      <Page size="A4" style={[s.cover, isAr ? s.rtl : {}]}>
        <View style={s.coverFrame}>
          <View style={s.coverInner}>
            <View style={s.coverBadge}>
              <Text style={s.coverBadgeText}>{isAr ? 'تقرير تنفيذي' : 'Executive Report'}</Text>
            </View>
            {logoUrl ? <Image src={logoUrl} style={{ width: 160, height: 50, objectFit: "contain", marginBottom: 16 }} /> : null}
            <Text style={[s.brand, rtl]}>{isAr ? 'راوي - منشئ التقارير' : 'Raawi - Report Builder'}</Text>
            <Text style={[s.title, rtl]}>{isAr ? 'تقرير مخصص من بيانات النظام' : 'Custom report from system data'}</Text>
            <Text style={[s.subtitle, rtl]}>
              {isAr
                ? 'هذا الملف يقدّم لقطة تنفيذية للبيانات التي تم تصفيتها وتصديرها من منشئ التقارير، مع ملخص للحالة والفلاتر والأعمدة المختارة.'
                : 'This file provides an executive snapshot of the filtered data exported from the report builder, including the applied filters and selected columns.'}
            </Text>
            <View style={s.coverRule} />
            <View style={s.coverPanel}>
              <Text style={s.coverPanelTitle}>{isAr ? 'لقطة التقرير' : 'Report snapshot'}</Text>
              <View style={s.coverGrid}>
                <View style={s.coverStat}>
                  <Text style={s.coverStatLabel}>{isAr ? 'المصدر' : 'Source'}</Text>
                  <Text style={s.coverStatValue}>{data.sourceLabel}</Text>
                </View>
                <View style={s.coverStat}>
                  <Text style={s.coverStatLabel}>{isAr ? 'تاريخ الإنشاء' : 'Generated at'}</Text>
                  <Text style={s.coverStatValue}>{formatDate(new Date(data.generatedAt), { lang, format: dateFormat })}</Text>
                </View>
                <View style={s.coverStat}>
                  <Text style={s.coverStatLabel}>{isAr ? 'الصفوف الظاهرة' : 'Visible rows'}</Text>
                  <Text style={s.coverStatValue}>{data.filteredRows}</Text>
                </View>
                <View style={s.coverStat}>
                  <Text style={s.coverStatLabel}>{isAr ? 'الأعمدة المختارة' : 'Selected columns'}</Text>
                  <Text style={s.coverStatValue}>{data.selectedColumns}</Text>
                </View>
              </View>
            </View>
            <Text style={[s.coverNote, rtl]}>
              {isAr
                ? 'يعرض الغلاف هنا ملخصًا تنفيذيًا واضحًا قبل تفاصيل الملخص والجداول، حتى يشعر التقرير بأنه وثيقة مكتملة وليست مجرد تصدير بيانات.'
                : 'The cover now gives a concise executive summary before the detail pages, so the report feels like a finished document rather than a raw data export.'}
            </Text>
            <Text style={[s.coverNote, rtl]}>
              {isAr
                ? 'سيتبع ذلك ملخص تنفيذي، ثم معاينة الجدول، مع ترقيم صفحات واضح.'
                : 'The following pages provide the summary and table preview, with clear page numbering.'}
            </Text>
          </View>
        </View>
      </Page>

      <Page size="A4" style={[s.page, isAr ? s.rtl : {}]}>
        <View style={s.pageHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTag, rtl]}>{isAr ? 'الملخص التنفيذي' : 'Executive overview'}</Text>
            <Text style={[s.sectionTitle, rtl, { marginTop: 0 }]}>
              {isAr ? 'ملخص تنفيذي وتوزيع الفلاتر' : 'Executive summary and applied filters'}
            </Text>
            <Text style={[s.sectionNote, rtl]}>
              {isAr
                ? 'يعرض هذا القسم قراءة سريعة لما تم تضمينه في التقرير قبل الانتقال إلى معاينة الجدول.'
                : 'This section provides a quick read before moving into the table preview.'}
            </Text>
          </View>
          <View style={s.statPill}>
            <Text style={s.statPillText}>{data.sourceLabel}</Text>
          </View>
        </View>

        <View style={s.overviewLayout}>
          <View style={s.overviewLeft}>
            <View style={s.cardsRow}>
              {data.summaryCards.slice(0, 5).map((card) => (
                <View key={card.label} style={s.statCard}>
                  <Text style={s.statValue}>{card.value}</Text>
                  <Text style={s.statLabel}>{card.label}</Text>
                  <Text style={[s.footer, { marginTop: 4 }]}>{card.hint}</Text>
                </View>
              ))}
            </View>

            <View style={[s.panel, { marginTop: 10 }]}>
              <Text style={s.panelTitle}>{isAr ? 'الأعمدة المختارة' : 'Selected columns'}</Text>
              <View style={s.chipWrap}>
                {data.columns.map((col, idx) => (
                  <View key={`${col.label}-${idx}`} style={s.chip}>
                    <Text style={s.chipText}>{col.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.panelSubtle}>
                {isAr
                  ? 'الأعمدة الظاهرة هنا هي التي ستظهر في التصدير النهائي.'
                  : 'The columns shown here are the ones that appear in the final export.'}
              </Text>
            </View>
          </View>

          <View style={s.overviewRight}>
            <View style={s.panel}>
              <Text style={s.panelTitle}>{isAr ? 'الفلاتر المطبقة' : 'Applied filters'}</Text>
              {data.filters.map((filter, idx) => (
                <View key={`${filter.label}-${idx}`} style={s.kvRow}>
                  <Text style={[s.kvLabel, rtl]}>{filter.label}</Text>
                  <Text style={[s.kvValue, rtl]}>{filter.value}</Text>
                </View>
              ))}
              <Text style={s.panelSubtle}>
                {isAr
                  ? 'هذه القراءة مرتبطة فقط ببيانات المصدر المختار والفلاتر الحالية.'
                  : 'This snapshot reflects only the selected source and its current filters.'}
              </Text>
            </View>
          </View>
        </View>

        <Text
          fixed
          style={[s.footer, { textAlign: 'center', marginTop: 8 }]}
          render={({ pageNumber, totalPages }) => `${isAr ? 'صفحة' : 'Page'} ${pageNumber} / ${totalPages}`}
        />
      </Page>

      <Page size="A4" style={[s.page, isAr ? s.rtl : {}]}>
        <View style={s.pageHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTag, rtl]}>{isAr ? 'معاينة الجدول' : 'Table preview'}</Text>
            <Text style={[s.sectionTitle, rtl, { marginTop: 0 }]}>
              {isAr ? 'البيانات النهائية قبل التصدير' : 'Final data preview before export'}
            </Text>
            <Text style={[s.sectionNote, rtl]}>
              {isAr
                ? 'هذا ما سيصدر في النسخة النهائية، مع عرض أول دفعة من الصفوف فقط.'
                : 'This is what will be exported in the final file, with only the first batch of rows shown below.'}
            </Text>
          </View>
          <View style={s.statPill}>
            <Text style={s.statPillText}>
              {isAr ? `الأعمدة: ${data.columns.length}` : `Columns: ${data.columns.length}`}
            </Text>
          </View>
        </View>

        <View style={[s.tableHeaderBand, { marginBottom: 8, borderRadius: 10 }]}>
          <View style={s.tableHeaderMeta}>
            <View style={s.statPill}><Text style={s.statPillText}>{isAr ? `الصفوف الظاهرة: ${visibleRows.length}` : `Visible rows: ${visibleRows.length}`}</Text></View>
            <View style={s.statPill}><Text style={s.statPillText}>{isAr ? `إجمالي الصفوف: ${data.rows.length}` : `Total rows: ${data.rows.length}`}</Text></View>
            <View style={s.statPill}><Text style={s.statPillText}>{isAr ? `الأعمدة المختارة: ${data.columns.length}` : `Selected columns: ${data.columns.length}`}</Text></View>
          </View>
          <Text style={[s.panelSubtle, rtl, { marginTop: 6 }]}>
            {selectedColumnsText}
          </Text>
        </View>
        <View style={s.table}>
          <View style={s.tr}>
            {data.columns.map((col, idx) => (
              <Text key={`${col.label}-${idx}`} style={[s.th, rtl, idx === data.columns.length - 1 ? { borderRightWidth: 0 } : {}]}>
                {col.label}
              </Text>
            ))}
          </View>
          {visibleRows.length === 0 ? (
            <View style={s.tr}>
              <Text style={[s.td, rtl, { borderRightWidth: 0, flex: 1 }]}>
                {isAr ? 'لا توجد نتائج مطابقة' : 'No matching results'}
              </Text>
            </View>
          ) : (
            visibleRows.map((row, rowIndex) => (
              <View key={`${rowIndex}-${row.values.join('|')}`} style={[s.tr, rowIndex % 2 === 1 ? { backgroundColor: '#fcfbfd' } : {}]}>
                {row.values.map((cell, cellIndex) => (
                  <Text key={`${rowIndex}-${cellIndex}`} style={[s.td, rtl, cellIndex === row.values.length - 1 ? { borderRightWidth: 0 } : {}]}>
                    {cell}
                  </Text>
                ))}
              </View>
            ))
          )}
        </View>
        {data.rows.length > visibleRows.length ? (
          <Text style={s.footer}>
            {isAr
              ? `تم عرض أول ${visibleRows.length} سجل فقط من أصل ${data.rows.length}.`
              : `Showing only the first ${visibleRows.length} rows out of ${data.rows.length}.`}
          </Text>
        ) : null}
        <Text
          fixed
          style={[s.footer, { textAlign: 'center', marginTop: 10 }]}
          render={({ pageNumber, totalPages }) => `${isAr ? 'صفحة' : 'Page'} ${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
};
