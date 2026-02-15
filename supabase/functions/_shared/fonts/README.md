# PDF Fonts (Roboto + Cairo)

Place these font files here for PDF generation (offline, no external source):

**Roboto** (English):
- Roboto-Regular.ttf
- Roboto-Medium.ttf
- Roboto-Italic.ttf

**Cairo** (Arabic):
- Cairo-Regular.ttf
- Cairo-Bold.ttf

Download from [Google Fonts](https://fonts.google.com/) (Roboto, Cairo). Use "Download family" and copy the `.ttf` files here.

Then run from project root:

```bash
node scripts/build-pdf-vfs.mjs
```

This generates `_shared/pdfVfs.ts` with base64-embedded fonts. Restart Edge Functions after rebuilding.
