import QRCode from "npm:qrcode@1.5.4";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "npm:pdf-lib@1.17.1";
import { getFontBytes } from "./pdfVfs.ts";

export type CertificatePageSize = "A4" | "A5" | "Letter";
export type CertificateOrientation = "portrait" | "landscape";
export type CertificateBackgroundFit = "cover" | "contain" | "tile";
export type CertificateElementType = "logo" | "title" | "paragraph" | "script_name" | "company_name" | "qr" | "image" | "date" | "footer";

export interface CertificateTemplateElement {
  id: string;
  type: CertificateElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  imageUrl?: string;
  logoSource?: "film_commission" | "client" | "uploaded";
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  opacity?: number;
}

export interface CertificateTemplate {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  pageSize: CertificatePageSize;
  orientation: CertificateOrientation;
  backgroundColor: string;
  backgroundImageUrl?: string | null;
  backgroundImageFit: CertificateBackgroundFit;
  backgroundImageOpacity: number;
  templateData: { elements: CertificateTemplateElement[] };
  createdAt: string;
  updatedAt: string;
}

export interface CertificatePdfInput {
  template?: CertificateTemplate | null;
  certificateNumber: string;
  scriptTitle: string;
  companyNameAr?: string | null;
  companyNameEn?: string | null;
  companyLogoUrl?: string | null;
  scriptType?: string | null;
  issuedAt: string;
  approvedAt?: string | null;
  amountPaid: number;
  currency: string;
  verificationUrl?: string | null;
}

type RenderFonts = {
  cairoRegular: PDFFont;
  cairoBold: PDFFont;
  helvetica: PDFFont;
  helveticaBold: PDFFont;
  times: PDFFont;
  timesBold: PDFFont;
};

type Box = { x: number; y: number; width: number; height: number };

const CANVAS_BASE_WIDTH = 1000;
const PAGE_RATIOS: Record<CertificatePageSize, number> = {
  A4: 297 / 210,
  A5: 210 / 148,
  Letter: 11 / 8.5,
};

const DEFAULT_PAGE: Record<CertificatePageSize, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
  Letter: { width: 612, height: 792 },
};

function hexToRgb(value: string | null | undefined) {
  const fallback = rgb(1, 1, 1);
  const hex = String(value ?? "").trim().replace(/^#/, "");
  if (!hex) return fallback;
  const normalized = hex.length === 3
    ? hex.split("").map((char) => char + char).join("")
    : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return fallback;
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

function isArabicText(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function getSupabasePublicUrl() {
  return (
    Deno.env.get("SUPABASE_URL")
    || Deno.env.get("PUBLIC_SUPABASE_URL")
    || Deno.env.get("PUBLIC_SITE_URL")
    || ""
  ).replace(/\/+$/, "");
}

function resolvePublicStorageUrl(pathOrUrl: string | null | undefined, bucket = "company-logos") {
  const value = String(pathOrUrl ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  const base = getSupabasePublicUrl();
  if (!base) return null;
  const cleanPath = value.replace(/^\/+/, "");
  if (cleanPath.startsWith("storage/v1/object/public/")) {
    return `${base}/${cleanPath}`;
  }
  const objectPath = cleanPath.startsWith(`${bucket}/`) ? cleanPath : `${bucket}/${cleanPath}`;
  return `${base}/storage/v1/object/public/${objectPath}`;
}

function hasArabicTemplateText(template: CertificateTemplate | null | undefined) {
  if (!template) return false;
  const elements = Array.isArray(template.templateData?.elements) ? template.templateData.elements : [];
  return elements.some((element) => {
    if (typeof element.text === "string" && isArabicText(element.text)) return true;
    if (typeof element.fontFamily === "string" && isArabicText(element.fontFamily)) return true;
    return false;
  });
}

function pageDimensions(template?: CertificateTemplate | null) {
  const base = DEFAULT_PAGE[template?.pageSize ?? "A4"] ?? DEFAULT_PAGE.A4;
  const orientation = template?.orientation ?? "landscape";
  return orientation === "landscape"
    ? { width: Math.max(base.width, base.height), height: Math.min(base.width, base.height) }
    : { width: Math.min(base.width, base.height), height: Math.max(base.width, base.height) };
}

function templateBaseHeight(template?: CertificateTemplate | null) {
  const ratio = template
    ? (template.orientation === "portrait"
      ? 1 / (PAGE_RATIOS[template.pageSize] ?? PAGE_RATIOS.A4)
      : (PAGE_RATIOS[template.pageSize] ?? PAGE_RATIOS.A4))
    : 16 / 9;
  return CANVAS_BASE_WIDTH / ratio;
}

function sanitizeTemplateElements(template?: CertificateTemplate | null): CertificateTemplateElement[] {
  const raw = template?.templateData?.elements;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((element) => {
      if (!element || typeof element.id !== "string" || typeof element.type !== "string") return null;
      const x = Number((element as any).x);
      const y = Number((element as any).y);
      const width = Number((element as any).width);
      const height = Number((element as any).height);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
      if (width <= 0 || height <= 0) return null;
      return { ...element, x, y, width, height } as CertificateTemplateElement;
    })
    .filter((element): element is CertificateTemplateElement => Boolean(element));
}

function parseDataUrl(input: string): { mime: string; bytes: Uint8Array } | null {
  const match = input.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(?:;base64)?,(.*)$/s);
  if (!match) return null;
  const mime = (match[1] ?? "application/octet-stream").trim().toLowerCase();
  const payload = match[2] ?? "";
  if (input.includes(";base64,")) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { mime, bytes };
  }
  const decoded = decodeURIComponent(payload);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return { mime, bytes };
}

async function loadImageSource(src: string | null | undefined): Promise<{ mime: string; bytes: Uint8Array } | null> {
  const value = String(src ?? "").trim();
  if (!value) return null;
  if (value.startsWith("data:")) return parseDataUrl(value);
  const resolved = /^https?:\/\//i.test(value) ? value : resolvePublicStorageUrl(value) ?? value;
  if (!/^https?:\/\//i.test(resolved)) return null;
  const response = await fetch(resolved);
  if (!response.ok) return null;
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return { mime, bytes: new Uint8Array(await response.arrayBuffer()) };
}

function isSvgSource(src: string | null | undefined) {
  const value = String(src ?? "").trim().toLowerCase();
  if (!value) return false;
  return value.startsWith("data:image/svg+xml") || value.endsWith(".svg");
}

function normalizePdfTextForRtl(text: string) {
  const value = String(text ?? "");
  if (!isArabicText(value)) return value;
  return value.replace(/([0-9]+)/g, "\u200E$1\u200E");
}

async function embedImage(
  pdfDoc: PDFDocument,
  source: { mime: string; bytes: Uint8Array },
) {
  if (source.mime.includes("png")) return await pdfDoc.embedPng(source.bytes);
  if (source.mime.includes("jpeg") || source.mime.includes("jpg")) return await pdfDoc.embedJpg(source.bytes);
  if (source.mime.includes("webp")) return null;
  if (source.mime.includes("svg")) return null;
  const bytes = source.bytes;
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return await pdfDoc.embedPng(bytes);
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return await pdfDoc.embedJpg(bytes);
  }
  return null;
}

function resolveFormattedValues(input: CertificatePdfInput, hasArabic: boolean) {
  const locale = hasArabic ? "ar-SA" : "en-US";
  const issuedAt = new Date(input.issuedAt);
  const approvedAt = input.approvedAt ? new Date(input.approvedAt) : null;
  const amountPaid = Number.isFinite(input.amountPaid) ? Number(input.amountPaid) : 0;
  return {
    certificateNumber: input.certificateNumber,
    scriptTitle: input.scriptTitle,
    scriptType: input.scriptType ?? "",
    companyName: String(input.companyNameAr ?? "").trim() || String(input.companyNameEn ?? "").trim() || "",
    companyNameAr: String(input.companyNameAr ?? "").trim(),
    companyNameEn: String(input.companyNameEn ?? "").trim(),
    companyLogoUrl: input.companyLogoUrl ?? null,
    issuedAt: Number.isFinite(issuedAt.getTime()) ? issuedAt.toLocaleDateString(locale) : "",
    approvedAt: approvedAt && Number.isFinite(approvedAt.getTime()) ? approvedAt.toLocaleDateString(locale) : "",
    amountPaidFormatted: new Intl.NumberFormat(locale, {
      style: "currency",
      currency: input.currency || "SAR",
      maximumFractionDigits: 2,
    }).format(amountPaid),
    amountPaid,
    currency: input.currency || "SAR",
    verificationUrl: input.verificationUrl ?? input.certificateNumber,
  };
}

function resolveTemplateText(text: string, values: ReturnType<typeof resolveFormattedValues>) {
  return String(text ?? "")
    .replaceAll("{{certificate_number}}", values.certificateNumber)
    .replaceAll("{{script_title}}", values.scriptTitle)
    .replaceAll("{{script_type}}", values.scriptType)
    .replaceAll("{{company_name}}", values.companyName)
    .replaceAll("{{company_name_ar}}", values.companyNameAr || values.companyName)
    .replaceAll("{{company_name_en}}", values.companyNameEn || values.companyName)
    .replaceAll("{{issued_at}}", values.issuedAt)
    .replaceAll("{{approved_at}}", values.approvedAt)
    .replaceAll("{{amount_paid}}", values.amountPaidFormatted)
    .replaceAll("{{amount_paid_en}}", values.amountPaidFormatted)
    .replaceAll("{{verification_url}}", values.verificationUrl);
}

function resolveFontSet(fonts: RenderFonts, fontFamily: string | undefined, text: string, bold = false) {
  const normalized = String(fontFamily ?? "").toLowerCase();
  const forceArabic = isArabicText(text) || normalized.includes("cairo") || normalized.includes("hacen") || normalized.includes("arabic") || normalized.includes("tahoma");
  if (forceArabic) return bold ? fonts.cairoBold : fonts.cairoRegular;
  if (normalized.includes("times")) return bold ? fonts.timesBold : fonts.times;
  return bold ? fonts.helveticaBold : fonts.helvetica;
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const paragraphs = String(text ?? "").split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push("");
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
        current = candidate;
        continue;
      }
      lines.push(current);
      current = word;
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawTextBox(
  page: any,
  font: PDFFont,
  text: string,
  box: Box,
  options: {
    fontSize: number;
    color: ReturnType<typeof rgb>;
    align?: "left" | "center" | "right";
    opacity?: number;
    minLineHeight?: number;
  },
) {
  const size = options.fontSize;
  const lineHeight = Math.max(size * 1.25, options.minLineHeight ?? size * 1.25);
  const lines = wrapText(font, text, size, box.width);
  const rtl = isArabicText(text);
  let cursorY = box.y + box.height - size;
  for (const line of lines) {
    const tokens = String(line ?? "").trim().split(/\s+/).filter(Boolean);
    const renderedTokens = rtl ? tokens.map((token) => normalizePdfTextForRtl(token)) : tokens;
    const lineWidth = renderedTokens.reduce((sum, token, index) => {
      const tokenWidth = font.widthOfTextAtSize(token, size);
      const spaceWidth = index < renderedTokens.length - 1 ? font.widthOfTextAtSize(" ", size) : 0;
      return sum + tokenWidth + spaceWidth;
    }, 0);
    let x = box.x;
    if (options.align === "center") x = box.x + Math.max(0, (box.width - lineWidth) / 2);
    if (options.align === "right") x = box.x + Math.max(0, box.width - lineWidth);
    if (cursorY < box.y - size) break;
    if (!rtl) {
      page.drawText(line, {
        x,
        y: cursorY,
        size,
        font,
        color: options.color,
        opacity: options.opacity ?? 1,
      });
    } else {
      let cursorX = x + lineWidth;
      for (let i = 0; i < renderedTokens.length; i++) {
        const token = renderedTokens[i] ?? "";
        const tokenWidth = font.widthOfTextAtSize(token, size);
        cursorX -= tokenWidth;
        page.drawText(token, {
          x: cursorX,
          y: cursorY,
          size,
          font,
          color: options.color,
          opacity: options.opacity ?? 1,
        });
        if (i < renderedTokens.length - 1) cursorX -= font.widthOfTextAtSize(" ", size);
      }
    }
    cursorY -= lineHeight;
  }
}

function drawPlaceholderBox(page: any, box: Box, font: PDFFont, label: string) {
  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    borderColor: rgb(0.75, 0.75, 0.8),
    borderWidth: 1,
    opacity: 0.9,
  });
  const size = Math.max(9, Math.min(12, box.height / 6));
  const lineWidth = font.widthOfTextAtSize(label, size);
  page.drawText(label, {
    x: box.x + Math.max(0, (box.width - lineWidth) / 2),
    y: box.y + Math.max(0, (box.height - size) / 2),
    size,
    font,
    color: rgb(0.45, 0.45, 0.5),
  });
}

function drawFilmCommissionLogo(page: any, box: Box, fonts: RenderFonts) {
  const dark = rgb(0.08, 0.2, 0.28);
  const barColors = [
    rgb(0.95, 0.54, 0.29),
    rgb(0.96, 0.38, 0.27),
    rgb(0.98, 0.64, 0.27),
    rgb(0.55, 0.2, 0.33),
    rgb(0.78, 0.3, 0.33),
  ];
  const barCount = barColors.length;
  const barWidth = Math.max(5, Math.min(10, box.width * 0.06));
  const barHeight = Math.max(22, Math.min(box.height * 0.54, 46));
  const gap = Math.max(1.5, barWidth * 0.25);
  const totalBarsWidth = barCount * barWidth + (barCount - 1) * gap;
  const barsX = box.x + box.width - totalBarsWidth;
  const barsY = box.y + (box.height - barHeight) / 2;

  page.drawRectangle({
    x: barsX - 4,
    y: barsY - 2,
    width: totalBarsWidth + 8,
    height: barHeight + 4,
    color: dark,
  });

  for (let i = 0; i < barCount; i++) {
    page.drawRectangle({
      x: barsX + i * (barWidth + gap),
      y: barsY,
      width: barWidth,
      height: barHeight,
      color: barColors[i],
    });
  }

  const arabicSize = Math.max(8, Math.min(16, box.height * 0.24));
  const englishSize = Math.max(7, Math.min(14, box.height * 0.22));
  page.drawText("هيئة الأفلام", {
    x: box.x,
    y: box.y + box.height * 0.53,
    size: arabicSize,
    font: fonts.cairoBold,
    color: dark,
  });
  page.drawText("Film Commission", {
    x: box.x,
    y: box.y + box.height * 0.2,
    size: englishSize,
    font: fonts.helveticaBold,
    color: dark,
  });
}

function getVerificationUrl(input: CertificatePdfInput) {
  const fromEnv = Deno.env.get("PUBLIC_SITE_URL")
    || Deno.env.get("SITE_URL")
    || Deno.env.get("PUBLIC_APP_URL")
    || Deno.env.get("APP_URL")
    || Deno.env.get("WEB_APP_URL")
    || "";
  if (fromEnv) return `${fromEnv.replace(/\/+$/, "")}/verify-certificate/${encodeURIComponent(input.certificateNumber)}`;
  return input.verificationUrl ?? input.certificateNumber;
}

async function resolveQrDataUrl(input: CertificatePdfInput) {
  return await QRCode.toDataURL(getVerificationUrl(input), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#111827", light: "#ffffff" },
  });
}

async function drawTemplateElement(
  page: any,
  pdfDoc: PDFDocument,
  fonts: RenderFonts,
  element: CertificateTemplateElement,
  values: ReturnType<typeof resolveFormattedValues>,
  qrDataUrl: string | null,
  template: CertificateTemplate | null,
) {
  const pageDims = page.getSize();
  const baseHeight = templateBaseHeight(template);
  const box: Box = {
    x: (element.x / CANVAS_BASE_WIDTH) * pageDims.width,
    y: pageDims.height - ((element.y / baseHeight) * pageDims.height) - ((element.height / baseHeight) * pageDims.height),
    width: (element.width / CANVAS_BASE_WIDTH) * pageDims.width,
    height: (element.height / baseHeight) * pageDims.height,
  };

  const opacity = typeof element.opacity === "number" ? Math.max(0, Math.min(1, element.opacity)) : 1;
  const color = hexToRgb(element.color ?? "#111827");
  const fontSize = Math.max(8, Number(element.fontSize ?? (element.type === "title" ? 28 : element.type === "script_name" ? 26 : element.type === "company_name" ? 22 : 18)));
  const bold = Boolean(element.bold);
  const resolvedText = resolveTemplateText(
    element.type === "script_name"
      ? values.scriptTitle
      : element.type === "company_name"
        ? values.companyName
        : (element.text ?? ""),
    values,
  );

  if (element.type === "qr") {
    if (qrDataUrl) {
      const parsed = parseDataUrl(qrDataUrl);
      const embedded = parsed ? await embedImage(pdfDoc, parsed) : null;
      if (embedded) {
        const scaled = embedded.scaleToFit(box.width, box.height);
        page.drawImage(embedded, {
          x: box.x + (box.width - scaled.width) / 2,
          y: box.y + (box.height - scaled.height) / 2,
          width: scaled.width,
          height: scaled.height,
          opacity,
        });
        return;
      }
    }
    drawPlaceholderBox(page, box, fonts.cairoRegular, "QR");
    return;
  }

  if (element.type === "logo" && element.logoSource === "film_commission") {
    drawFilmCommissionLogo(page, box, fonts);
    return;
  }

  if (element.type === "logo" && element.logoSource === "client") {
    const source = await loadImageSource(values.companyLogoUrl);
    const embedded = source && !isSvgSource(values.companyLogoUrl) ? await embedImage(pdfDoc, source) : null;
    if (embedded) {
      const scaled = embedded.scaleToFit(box.width, box.height);
      page.drawImage(embedded, {
        x: box.x + (box.width - scaled.width) / 2,
        y: box.y + (box.height - scaled.height) / 2,
        width: scaled.width,
        height: scaled.height,
        opacity,
      });
      return;
    }
    drawPlaceholderBox(page, box, fonts.cairoRegular, "Client Logo");
    return;
  }

  if ((element.type === "image" || element.type === "logo") && element.imageUrl) {
    const source = await loadImageSource(element.imageUrl);
    const embedded = source && !isSvgSource(element.imageUrl) ? await embedImage(pdfDoc, source) : null;
    if (embedded) {
      const scaled = embedded.scaleToFit(box.width, box.height);
      page.drawImage(embedded, {
        x: box.x + (box.width - scaled.width) / 2,
        y: box.y + (box.height - scaled.height) / 2,
        width: scaled.width,
        height: scaled.height,
        opacity,
      });
      return;
    }
    drawPlaceholderBox(page, box, fonts.cairoRegular, element.type === "logo" ? "Logo" : "Image");
    return;
  }

  const font = resolveFontSet(fonts, element.fontFamily, resolvedText, bold);
  drawTextBox(page, font, resolvedText || (element.type === "title" ? "Certificate" : ""), box, {
    fontSize,
    color,
    opacity,
    align: element.align ?? "center",
  });
}

async function buildRenderFonts(pdfDoc: PDFDocument): Promise<RenderFonts> {
  pdfDoc.registerFontkit(fontkit);
  const cairoRegularBytes = getFontBytes("Cairo-Regular.ttf");
  const cairoBoldBytes = getFontBytes("Cairo-Bold.ttf");
  if (!cairoRegularBytes || !cairoBoldBytes) {
    throw new Error("Arabic certificate fonts are missing");
  }
  const [cairoRegular, cairoBold, helvetica, helveticaBold, times, timesBold] = await Promise.all([
    pdfDoc.embedFont(cairoRegularBytes),
    pdfDoc.embedFont(cairoBoldBytes),
    pdfDoc.embedFont(StandardFonts.Helvetica),
    pdfDoc.embedFont(StandardFonts.HelveticaBold),
    pdfDoc.embedFont(StandardFonts.TimesRoman),
    pdfDoc.embedFont(StandardFonts.TimesRomanBold),
  ]);
  return { cairoRegular, cairoBold, helvetica, helveticaBold, times, timesBold };
}

async function drawBackground(page: any, pdfDoc: PDFDocument, template: CertificateTemplate | null, fonts: RenderFonts) {
  const pageDims = page.getSize();
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageDims.width,
    height: pageDims.height,
    color: hexToRgb(template?.backgroundColor ?? "#ffffff"),
  });

  const backgroundUrl = template?.backgroundImageUrl ?? null;
  if (!backgroundUrl) return;
  const source = await loadImageSource(backgroundUrl);
  const embedded = source && !isSvgSource(backgroundUrl) ? await embedImage(pdfDoc, source) : null;
  if (!embedded) return;

  const opacity = Math.max(0, Math.min(1, Number(template?.backgroundImageOpacity ?? 1)));
  if (template?.backgroundImageFit === "tile") {
    const scaled = embedded.scaleToFit(160, 160);
    for (let x = 0; x < pageDims.width; x += scaled.width) {
      for (let y = 0; y < pageDims.height; y += scaled.height) {
        page.drawImage(embedded, {
          x,
          y,
          width: scaled.width,
          height: scaled.height,
          opacity,
        });
      }
    }
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageDims.width,
      height: pageDims.height,
      color: rgb(1, 1, 1),
      opacity: Math.max(0, 1 - opacity),
    });
    return;
  }

  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: pageDims.width,
    height: pageDims.height,
    opacity,
  });
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageDims.width,
    height: pageDims.height,
    color: rgb(1, 1, 1),
    opacity: Math.max(0, 1 - opacity),
  });
}

function renderFallbackCertificate(
  page: any,
  fonts: RenderFonts,
  values: ReturnType<typeof resolveFormattedValues>,
) {
  const pageDims = page.getSize();
  page.drawRectangle({
    x: 20,
    y: 20,
    width: pageDims.width - 40,
    height: pageDims.height - 40,
    borderColor: rgb(0.46, 0.2, 0.4),
    borderWidth: 2,
  });
  page.drawText("Script Approval Certificate", {
    x: 230,
    y: pageDims.height - 75,
    size: 28,
    font: fonts.cairoBold,
    color: rgb(0.12, 0.12, 0.2),
  });
  page.drawText(`Certificate Number: ${values.certificateNumber}`, { x: 60, y: pageDims.height - 125, size: 14, font: fonts.cairoRegular });
  page.drawText(`Script Title: ${normalizePdfTextForRtl(values.scriptTitle)}`, { x: 60, y: pageDims.height - 155, size: 14, font: fonts.cairoRegular });
  page.drawText(`Company: ${values.companyName || "-"}`, { x: 60, y: pageDims.height - 185, size: 14, font: fonts.cairoRegular });
  page.drawText(`Approved At: ${values.approvedAt || values.issuedAt}`, { x: 60, y: pageDims.height - 215, size: 11, font: fonts.cairoRegular, color: rgb(0.35, 0.35, 0.45) });
}

export async function renderCertificatePdfBytes(input: CertificatePdfInput): Promise<Uint8Array> {
  const template = input.template ?? null;
  const hasArabic = hasArabicTemplateText(template) || isArabicText(input.scriptTitle) || isArabicText(String(input.companyNameAr ?? "")) || isArabicText(String(input.companyNameEn ?? ""));
  const values = resolveFormattedValues(input, hasArabic);
  const pdfDoc = await PDFDocument.create();
  const fonts = await buildRenderFonts(pdfDoc);
  const page = pdfDoc.addPage([pageDimensions(template).width, pageDimensions(template).height]);

  if (template && Array.isArray(template.templateData?.elements) && template.templateData.elements.length > 0) {
    await drawBackground(page, pdfDoc, template, fonts);
    const qrDataUrl = template.templateData.elements.some((element) => element.type === "qr")
      ? await resolveQrDataUrl(input)
      : null;
    for (const element of sanitizeTemplateElements(template)) {
      await drawTemplateElement(page, pdfDoc, fonts, element, values, qrDataUrl, template);
    }
  } else {
    renderFallbackCertificate(page, fonts, values);
  }

  return await pdfDoc.save();
}

export async function loadDefaultCertificateTemplate(supabase: any): Promise<CertificateTemplate | null> {
  const { data, error } = await supabase
    .from("certificate_templates")
    .select("id, name, description, is_default, page_size, orientation, background_color, background_image_url, background_image_fit, background_image_opacity, template_data, created_at, updated_at")
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    description: data.description ?? null,
    isDefault: data.is_default,
    pageSize: data.page_size,
    orientation: data.orientation,
    backgroundColor: data.background_color,
    backgroundImageUrl: data.background_image_url ?? null,
    backgroundImageFit: data.background_image_fit,
    backgroundImageOpacity: Number(data.background_image_opacity ?? 1),
    templateData: data.template_data ?? { elements: [] },
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  } as CertificateTemplate;
}
