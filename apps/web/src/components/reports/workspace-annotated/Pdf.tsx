import React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { workspaceAnnotatedStyles as s } from "./styles";

export interface AnnotatedWorkspaceSegment {
  text: string;
  highlighted?: boolean;
}

export interface AnnotatedWorkspaceNote {
  marker: number;
  title: string;
  articleLabel: string;
  evidenceSnippet: string;
  anchorMethod?: string | null;
}

export interface AnnotatedWorkspacePage {
  pageNumber: number;
  segments: AnnotatedWorkspaceSegment[];
  notes: AnnotatedWorkspaceNote[];
}

export interface AnnotatedWorkspaceUnresolved {
  title: string;
  evidenceSnippet: string;
}

export interface AnnotatedWorkspacePdfProps {
  scriptTitle: string;
  reportLabel?: string;
  lang: "ar" | "en";
  pages: AnnotatedWorkspacePage[];
  unresolved?: AnnotatedWorkspaceUnresolved[];
}

export const AnnotatedWorkspacePdf: React.FC<AnnotatedWorkspacePdfProps> = ({
  scriptTitle,
  reportLabel,
  lang,
  pages,
  unresolved = [],
}) => {
  const isAr = lang === "ar";
  const rtl = isAr ? s.pageBodyRtl : {};
  return (
    <Document>
      {pages.map((page) => (
        <Page key={`annotated-page-${page.pageNumber}`} size="A4" style={[s.page, isAr ? s.pageAr : {}]}>
          <View style={s.header}>
            <Text style={[s.title, rtl]}>
              {isAr ? "نسخة عمل مع الملاحظات" : "Annotated Working Copy"}
            </Text>
            <Text style={[s.subtitle, rtl]}>{scriptTitle}</Text>
            <Text style={[s.subtitle, rtl]}>
              {isAr ? `الصفحة ${page.pageNumber}` : `Page ${page.pageNumber}`}
              {reportLabel ? ` • ${reportLabel}` : ""}
            </Text>
          </View>

          <View style={[s.layoutRow, isAr ? s.layoutRowRtl : {}]}>
            <View style={s.contentColumn}>
              <Text style={[s.pageBody, rtl]}>
                {page.segments.map((segment, index) => (
                  <Text key={`segment-${page.pageNumber}-${index}`} style={segment.highlighted ? s.highlighted : undefined}>
                    {segment.text}
                  </Text>
                ))}
              </Text>
            </View>

            <View style={s.notesColumn}>
              <Text style={[s.noteColumnTitle, rtl]}>
                {isAr ? "ملاحظات الصفحة" : "Page notes"}
              </Text>
              {page.notes.length === 0 ? (
                <Text style={[s.emptyNotes, rtl]}>
                  {isAr
                    ? "لا توجد ملاحظات مؤكدة التمركز بصريًا على هذه الصفحة."
                    : "No visually confirmed anchored findings on this page."}
                </Text>
              ) : (
                page.notes.map((note) => (
                  <View key={`note-${page.pageNumber}-${note.marker}`} style={s.noteCard}>
                    <Text style={[s.noteBadge, rtl]}>
                      {isAr ? `ملاحظة ${note.marker}` : `Finding ${note.marker}`}
                    </Text>
                    <Text style={[s.noteTitle, rtl]}>{note.title}</Text>
                    <Text style={[s.noteMeta, rtl]}>
                      {note.articleLabel}
                      {note.anchorMethod ? ` • ${note.anchorMethod}` : ""}
                    </Text>
                    <Text style={[s.noteSnippet, rtl]}>{note.evidenceSnippet}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          {unresolved.length > 0 && page.pageNumber === pages[pages.length - 1]?.pageNumber ? (
            <View style={s.unresolvedBlock}>
              <Text style={[s.unresolvedTitle, rtl]}>
                {isAr
                  ? `ملاحظات تحتاج تحققًا يدويًا (${unresolved.length})`
                  : `Findings requiring manual verification (${unresolved.length})`}
              </Text>
              {unresolved.map((item, index) => (
                <Text key={`unresolved-${index}`} style={[s.unresolvedItem, rtl]}>
                  {`${index + 1}. ${item.title} — ${item.evidenceSnippet}`}
                </Text>
              ))}
            </View>
          ) : null}
        </Page>
      ))}
    </Document>
  );
};
