import { StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'NotoSans',
  src: 'https://fonts.gstatic.com/s/notosans/v39/o-0IIpQlx3QUlC5A4PNr5TRA.woff2',
});

export const builderPdfStyles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingHorizontal: 32,
    paddingBottom: 32,
    fontFamily: 'NotoSans',
    fontSize: 9.5,
    color: '#1f1630',
    backgroundColor: '#ffffff',
  },
  rtl: {
    direction: 'rtl',
  },
  cover: {
    padding: 0,
    backgroundColor: '#f7f4f8',
  },
  coverFrame: {
    position: 'relative',
    width: '100%',
    height: '100%',
    padding: 48,
    justifyContent: 'flex-end',
  },
  brand: {
    fontSize: 11,
    color: '#7a2f63',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 8,
    color: '#1f1630',
  },
  subtitle: {
    fontSize: 11.5,
    lineHeight: 1.4,
    color: '#5d5470',
    marginBottom: 14,
    maxWidth: 440,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 12,
  },
  metaChip: {
    borderWidth: 1,
    borderColor: '#e4d7e1',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 110,
  },
  metaLabel: {
    fontSize: 8,
    color: '#7e6f88',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    fontWeight: 700,
    color: '#1f1630',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
    marginTop: 12,
    color: '#1f1630',
  },
  sectionNote: {
    fontSize: 9,
    color: '#6a5f76',
    marginBottom: 12,
  },
  cardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  statCard: {
    width: '24%',
    borderWidth: 1,
    borderColor: '#eaddea',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fcfbfd',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 700,
    color: '#7a2f63',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 8.5,
    color: '#665a73',
  },
  table: {
    borderWidth: 1,
    borderColor: '#e6dce4',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 8,
  },
  tr: {
    flexDirection: 'row',
  },
  th: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 6,
    fontSize: 8,
    fontWeight: 700,
    backgroundColor: '#f8f4f7',
    borderRightWidth: 1,
    borderRightColor: '#eaddea',
    color: '#392b45',
  },
  td: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 6,
    fontSize: 8,
    borderRightWidth: 1,
    borderRightColor: '#f0e7ee',
    color: '#2c2140',
  },
  muted: {
    color: '#7b7385',
  },
  footer: {
    marginTop: 10,
    fontSize: 8,
    color: '#7b7385',
  },
});
