import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
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
}

export const ReportBuilderPdf: React.FC<ReportBuilderPdfProps> = ({ data, lang, dateFormat }) => {
  const isAr = lang === 'ar';
  const rtl = isAr ? s.rtl : {};
  const visibleRows = data.rows.slice(0, 18);

  return (
    <Document>
      <Page size="A4" style={[s.cover, isAr ? s.rtl : {}]}>
        <View style={s.coverFrame}>
          <Text style={[s.brand, rtl]}>{isAr ? 'راوي - منشئ التقارير' : 'Raawi - Report Builder'}</Text>
          <Text style={[s.title, rtl]}>{isAr ? 'تقرير مخصص من بيانات النظام' : 'Custom report from system data'}</Text>
          <Text style={[s.subtitle, rtl]}>
            {isAr
              ? 'هذا الملف يقدّم لقطة تنفيذية للبيانات التي تم تصفيتها وتصديرها من منشئ التقارير، مع ملخص للحالة والفلاتر والأعمدة المختارة.'
              : 'This file provides an executive snapshot of the filtered data exported from the report builder, including the applied filters and selected columns.'}
          </Text>
          <View style={s.metaRow}>
            <View style={s.metaChip}>
              <Text style={s.metaLabel}>{isAr ? 'المصدر' : 'Source'}</Text>
              <Text style={s.metaValue}>{data.sourceLabel}</Text>
            </View>
            <View style={s.metaChip}>
              <Text style={s.metaLabel}>{isAr ? 'تاريخ الإنشاء' : 'Generated at'}</Text>
              <Text style={s.metaValue}>{formatDate(new Date(data.generatedAt), { lang, format: dateFormat })}</Text>
            </View>
            <View style={s.metaChip}>
              <Text style={s.metaLabel}>{isAr ? 'السجلات الظاهرة' : 'Visible rows'}</Text>
              <Text style={s.metaValue}>{data.filteredRows}</Text>
            </View>
          </View>
        </View>
      </Page>

      <Page size="A4" style={[s.page, isAr ? s.rtl : {}]}>
        <Text style={[s.sectionTitle, rtl]}>{isAr ? 'ملخص تنفيذي' : 'Executive Summary'}</Text>
        <View style={s.cardsRow}>
          {data.summaryCards.slice(0, 5).map((card) => (
            <View key={card.label} style={s.statCard}>
              <Text style={s.statValue}>{card.value}</Text>
              <Text style={s.statLabel}>{card.label}</Text>
              <Text style={[s.footer, { marginTop: 4 }]}>{card.hint}</Text>
            </View>
          ))}
        </View>

        <Text style={[s.sectionTitle, rtl]}>{isAr ? 'الفلاتر المطبقة' : 'Applied Filters'}</Text>
        <View style={s.table}>
          {data.filters.map((filter, idx) => (
            <View key={`${filter.label}-${idx}`} style={s.tr}>
              <Text style={[s.td, rtl, { flex: 0.9, borderRightWidth: 1 }]}>{filter.label}</Text>
              <Text style={[s.td, rtl, { flex: 2.1, borderRightWidth: 0 }]}>{filter.value}</Text>
            </View>
          ))}
        </View>

        <Text style={[s.sectionTitle, rtl]}>{isAr ? 'معاينة الجدول' : 'Table Preview'}</Text>
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
              <View key={`${rowIndex}-${row.values.join('|')}`} style={s.tr}>
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
      </Page>
    </Document>
  );
};
