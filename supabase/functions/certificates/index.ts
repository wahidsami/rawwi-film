import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { isUserAdmin } from "../_shared/roleCheck.ts";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import { getFontBytes } from "../_shared/pdfVfs.ts";

type ClientAccountRow = {
  user_id: string;
  company_id: string;
  subscription_plan: "free";
  subscription_status: "active" | "inactive";
};

type DemoCard = {
  id: string;
  labelAr: string;
  labelEn: string;
  brand: string;
  maskedNumber: string;
  success: boolean;
};

type CertificateTemplateRow = {
  id: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  page_size: string;
  orientation: "portrait" | "landscape";
  background_color: string;
  background_image_url?: string | null;
  background_image_fit: "cover" | "contain" | "tile";
  background_image_opacity: number;
  template_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const CERTIFICATE_BASE_AMOUNT = 3500;
const CERTIFICATE_TAX_RATE = 0.15;
const CERTIFICATE_TAX_AMOUNT = Number((CERTIFICATE_BASE_AMOUNT * CERTIFICATE_TAX_RATE).toFixed(2));
const CERTIFICATE_TOTAL_AMOUNT = Number((CERTIFICATE_BASE_AMOUNT + CERTIFICATE_TAX_AMOUNT).toFixed(2));
const CERTIFICATE_CURRENCY = "SAR";
const CERTIFICATE_FEE_SETTINGS_KEY = "certificate_fee_settings";
const CERTIFICATE_FILES_BUCKET = "script-certificates";

type CertificateFeeConfig = {
  baseAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
};

const DEMO_CARDS: DemoCard[] = [
  {
    id: "visa_success",
    labelAr: "بطاقة فيزا تجريبية",
    labelEn: "Demo Visa Card",
    brand: "visa",
    maskedNumber: "4242 4242 4242 4242",
    success: true,
  },
  {
    id: "mada_success",
    labelAr: "بطاقة مدى تجريبية",
    labelEn: "Demo Mada Card",
    brand: "mada",
    maskedNumber: "4400 4400 4400 4400",
    success: true,
  },
  {
    id: "declined_card",
    labelAr: "بطاقة مرفوضة تجريبياً",
    labelEn: "Demo Declined Card",
    brand: "visa",
    maskedNumber: "4000 0000 0000 0002",
    success: false,
  },
];

function pathAfter(base: string, url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(new RegExp(`/${base}/?(.*)$`));
  return (match?.[1] ?? "").replace(/^\/+/, "").trim();
}

function mapTemplate(row: CertificateTemplateRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    isDefault: row.is_default,
    pageSize: row.page_size,
    orientation: row.orientation,
    backgroundColor: row.background_color,
    backgroundImageUrl: row.background_image_url ?? null,
    backgroundImageFit: row.background_image_fit,
    backgroundImageOpacity: Number(row.background_image_opacity ?? 1),
    templateData: row.template_data ?? { elements: [] },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadAdminUserIds(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<string[]> {
  const [{ data: roles }, { data: userRoles }] = await Promise.all([
    supabase.from("roles").select("id, key").in("key", ["super_admin", "admin", "regulator"]),
    supabase.from("user_roles").select("user_id, role_id"),
  ]);
  const roleIds = new Set((roles ?? []).map((r: { id: string }) => r.id));
  return [...new Set((userRoles ?? [])
    .filter((row: { user_id: string; role_id: string }) => roleIds.has(row.role_id))
    .map((row: { user_id: string }) => row.user_id))];
}

async function notifyAdmins(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  payload: {
    type: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const adminUserIds = await loadAdminUserIds(supabase);
  if (adminUserIds.length === 0) return;
  const rows = adminUserIds.map((userId) => ({
    user_id: userId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    metadata: payload.metadata ?? {},
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) console.error("[certificates] notify admins:", error.message);
}

function templatePayloadFromBody(body: Record<string, unknown>) {
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name.trim();
  if (typeof body.description === "string") update.description = body.description.trim();
  if (typeof body.isDefault === "boolean") update.is_default = body.isDefault;
  if (typeof body.pageSize === "string") update.page_size = body.pageSize;
  if (body.orientation === "portrait" || body.orientation === "landscape") update.orientation = body.orientation;
  if (typeof body.backgroundColor === "string") update.background_color = body.backgroundColor;
  if (typeof body.backgroundImageUrl === "string" || body.backgroundImageUrl === null) update.background_image_url = body.backgroundImageUrl;
  if (body.backgroundImageFit === "cover" || body.backgroundImageFit === "contain" || body.backgroundImageFit === "tile") {
    update.background_image_fit = body.backgroundImageFit;
  }
  if (typeof body.backgroundImageOpacity === "number") update.background_image_opacity = body.backgroundImageOpacity;
  if (body.templateData && typeof body.templateData === "object") update.template_data = body.templateData;
  return update;
}

async function getClientAccountForUser(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
): Promise<ClientAccountRow | null> {
  const { data } = await supabase
    .from("client_portal_accounts")
    .select("user_id, company_id, subscription_plan, subscription_status")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ClientAccountRow | null) ?? null;
}

async function loadApprovedScriptsForCompany(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  companyId: string,
) {
  const { data, error } = await supabase
    .from("scripts")
    .select("id, title, type, status, company_id, client_id, created_at")
    .or(`company_id.eq.${companyId},client_id.eq.${companyId}`)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    company_id?: string | null;
    client_id?: string | null;
    created_at: string;
  }>;
}

async function loadApprovedAtMap(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  scriptIds: string[],
): Promise<Map<string, string>> {
  if (scriptIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("script_status_history")
    .select("script_id, changed_at")
    .eq("to_status", "approved")
    .in("script_id", scriptIds)
    .order("changed_at", { ascending: false });
  if (error) throw new Error(error.message);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ script_id: string; changed_at: string }>) {
    if (!map.has(row.script_id)) map.set(row.script_id, row.changed_at);
  }
  return map;
}

async function loadLatestPaymentsMap(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  scriptIds: string[],
) {
  if (scriptIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("script_certificate_payments")
    .select("id, script_id, total_amount, currency, payment_status, payment_method, payment_reference, demo_card_id, card_brand, card_last4, completed_at, created_at")
    .in("script_id", scriptIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const map = new Map<string, any>();
  for (const row of data ?? []) {
    if (!map.has((row as any).script_id)) map.set((row as any).script_id, row);
  }
  return map;
}

async function loadCertificatesMap(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  scriptIds: string[],
) {
  if (scriptIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("script_certificates")
    .select("id, script_id, certificate_number, certificate_status, issued_at, certificate_data")
    .in("script_id", scriptIds)
    .order("issued_at", { ascending: false });
  if (error) throw new Error(error.message);
  const map = new Map<string, any>();
  for (const row of data ?? []) {
    if (!map.has((row as any).script_id)) map.set((row as any).script_id, row);
  }
  return map;
}

async function loadDefaultCertificateTemplate(
  supabase: ReturnType<typeof createSupabaseAdmin>,
) {
  const { data, error } = await supabase
    .from("certificate_templates")
    .select("id, name, description, is_default, page_size, orientation, background_color, background_image_url, background_image_fit, background_image_opacity, template_data, created_at, updated_at")
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapTemplate(data as CertificateTemplateRow) : null;
}

function resolveClientCertificateStatus(latestPayment: any | null, certificate: any | null): "payment_pending" | "payment_failed" | "issued" {
  if (latestPayment?.payment_status === "completed" && certificate && certificate.certificate_status === "issued") return "issued";
  if (latestPayment?.payment_status === "failed") return "payment_failed";
  return "payment_pending";
}

function normalizeFeeConfig(raw: Record<string, unknown> | null | undefined): CertificateFeeConfig {
  const baseAmount = typeof raw?.baseAmount === "number" && Number.isFinite(raw.baseAmount) && raw.baseAmount >= 0
    ? raw.baseAmount
    : CERTIFICATE_BASE_AMOUNT;
  const taxRate = typeof raw?.taxRate === "number" && Number.isFinite(raw.taxRate) && raw.taxRate >= 0
    ? raw.taxRate
    : CERTIFICATE_TAX_RATE;
  const currency = typeof raw?.currency === "string" && raw.currency.trim()
    ? raw.currency.trim().toUpperCase()
    : CERTIFICATE_CURRENCY;
  const taxAmount = Number((baseAmount * taxRate).toFixed(2));
  const totalAmount = Number((baseAmount + taxAmount).toFixed(2));
  return { baseAmount, taxRate, taxAmount, totalAmount, currency };
}

async function loadCertificateFeeConfig(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<CertificateFeeConfig> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", CERTIFICATE_FEE_SETTINGS_KEY)
    .maybeSingle();
  return normalizeFeeConfig(((data as any)?.value ?? null) as Record<string, unknown> | null);
}

async function loadLatestReportStatusMap(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  scriptIds: string[],
): Promise<Map<string, string>> {
  if (scriptIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("analysis_reports")
    .select("script_id, review_status, created_at")
    .in("script_id", scriptIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ script_id: string; review_status?: string | null }>) {
    if (!map.has(row.script_id)) map.set(row.script_id, (row.review_status ?? "").toLowerCase());
  }
  return map;
}

function mapCertificateItems(
  scripts: Array<{ id: string; title: string; type: string; status: string; created_at: string }>,
  approvedAtMap: Map<string, string>,
  latestPaymentsMap: Map<string, any>,
  certificatesMap: Map<string, any>,
  feeConfig: CertificateFeeConfig,
  companyMap?: Map<string, { logo_url?: string | null }>,
) {
  return scripts.map((script) => {
    const latestPayment = latestPaymentsMap.get(script.id) ?? null;
    const certificate = certificatesMap.get(script.id) ?? null;
    const status = resolveClientCertificateStatus(latestPayment, certificate);
    const ownerCompanyId = ((script as any).company_id ?? (script as any).client_id ?? "").toString();
    const company = ownerCompanyId && companyMap ? companyMap.get(ownerCompanyId) : null;
    return {
      scriptId: script.id,
      scriptTitle: script.title,
      scriptType: script.type,
      scriptStatus: script.status,
      approvedAt: approvedAtMap.get(script.id) ?? script.created_at,
      companyLogoUrl: company?.logo_url ?? null,
      certificateFee: {
        baseAmount: feeConfig.baseAmount,
        taxAmount: feeConfig.taxAmount,
        totalAmount: feeConfig.totalAmount,
        currency: feeConfig.currency,
      },
      certificateStatus: status,
      latestPayment: latestPayment
        ? {
            id: latestPayment.id,
            paymentStatus: latestPayment.payment_status,
            paymentMethod: latestPayment.payment_method,
            paymentReference: latestPayment.payment_reference,
            demoCardId: latestPayment.demo_card_id,
            cardBrand: latestPayment.card_brand,
            cardLast4: latestPayment.card_last4,
            completedAt: latestPayment.completed_at,
            createdAt: latestPayment.created_at,
          }
        : null,
      certificate: certificate
        ? {
            id: certificate.id,
            certificateNumber: certificate.certificate_number,
            certificateStatus: certificate.certificate_status,
            issuedAt: certificate.issued_at,
            certificateData: certificate.certificate_data ?? {},
          }
        : null,
    };
  });
}

async function issueCertificateForScript(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  params: {
    scriptId: string;
    payerUserId: string | null;
    companyId: string;
    companyNameAr: string | null;
    companyNameEn: string | null;
    companyLogoUrl: string | null;
    scriptTitle: string;
    paymentId: string;
    amountPaid: number;
    currency: string;
    issuedBy?: string | null;
    forceRegenerate?: boolean;
  },
) {
  const existing = await supabase
    .from("script_certificates")
    .select("id, script_id, payment_id, certificate_number, certificate_status, issued_at, certificate_data")
    .eq("script_id", params.scriptId)
    .maybeSingle();

  if (existing.data?.id && !params.forceRegenerate) {
    if (!existing.data.payment_id && params.paymentId) {
      const { data: linked, error: linkError } = await supabase
        .from("script_certificates")
        .update({
          payment_id: params.paymentId,
          owner_user_id: params.payerUserId,
          issued_by: params.issuedBy ?? null,
          certificate_data: {
            ...((existing.data.certificate_data ?? {}) as Record<string, unknown>),
            amount_paid: params.amountPaid,
            currency: params.currency,
          },
        })
        .eq("id", existing.data.id)
        .select("id, script_id, certificate_number, certificate_status, issued_at, certificate_data")
        .single();
      if (linkError || !linked) throw new Error(linkError?.message || "Failed to link payment to certificate");
      return linked;
    }
    return existing.data;
  }

  const { data: certificateNumber, error: numberError } = await supabase.rpc("generate_script_certificate_number");
  if (numberError || !certificateNumber) throw new Error(numberError?.message || "Failed to generate certificate number");

  const certificatePayload = {
    script_id: params.scriptId,
    script_title: params.scriptTitle,
    company_id: params.companyId,
    company_name_ar: params.companyNameAr,
    company_name_en: params.companyNameEn,
    company_logo_url: params.companyLogoUrl,
    issued_at: new Date().toISOString(),
    certificate_number: certificateNumber,
    amount_paid: params.amountPaid,
    currency: params.currency,
    regenerated_from_certificate_id: params.forceRegenerate ? existing.data?.id ?? null : null,
  };

  if (existing.data?.id && params.forceRegenerate) {
    const { data, error } = await supabase
      .from("script_certificates")
      .update({
        payment_id: params.paymentId,
        owner_user_id: params.payerUserId,
        certificate_number: certificateNumber,
        issued_by: params.issuedBy ?? null,
        certificate_status: "issued",
        issued_at: new Date().toISOString(),
        certificate_data: certificatePayload,
      })
      .eq("id", existing.data.id)
      .select("id, script_id, certificate_number, certificate_status, issued_at, certificate_data")
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to regenerate certificate");
    return data;
  }

  const { data, error } = await supabase
    .from("script_certificates")
    .insert({
      script_id: params.scriptId,
      payment_id: params.paymentId,
      owner_user_id: params.payerUserId,
      certificate_number: certificateNumber,
      issued_by: params.issuedBy ?? null,
      certificate_status: "issued",
      certificate_data: certificatePayload,
    })
    .select("id, script_id, certificate_number, certificate_status, issued_at, certificate_data")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to issue certificate");
  return data;
}

async function loadAdminScriptContext(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  scriptId: string,
) {
  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .select("id, title, type, status, company_id, client_id")
    .eq("id", scriptId)
    .maybeSingle();
  if (scriptError) throw new Error(scriptError.message);
  if (!script) return null;
  if ((script as any).status !== "approved") throw new Error("Certificate actions are only available for approved scripts");

  const ownerCompanyId = ((script as any).company_id ?? (script as any).client_id ?? "").toString();
  const [{ data: company }, { data: account }] = await Promise.all([
    supabase.from("clients").select("id, name_ar, name_en, logo_url").eq("id", ownerCompanyId).maybeSingle(),
    supabase.from("client_portal_accounts").select("user_id, company_id").eq("company_id", ownerCompanyId).maybeSingle(),
  ]);

  return {
    script: script as any,
    company: company as any | null,
    account: account as { user_id?: string | null; company_id?: string | null } | null,
    ownerCompanyId,
  };
}

async function loadLatestCompletedPayment(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  scriptId: string,
) {
  const { data, error } = await supabase
    .from("script_certificate_payments")
    .select("id, payer_user_id, script_id, total_amount, currency, payment_status, payment_method, payment_reference, demo_card_id, card_brand, card_last4, completed_at, created_at")
    .eq("script_id", scriptId)
    .eq("payment_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as any | null;
}

async function loadCertificateVerification(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  certificateNumber: string,
) {
  const { data: certificate, error: certificateError } = await supabase
    .from("script_certificates")
    .select("id, script_id, payment_id, certificate_number, certificate_status, issued_at, certificate_data")
    .eq("certificate_number", certificateNumber)
    .maybeSingle();
  if (certificateError) throw new Error(certificateError.message);
  if (!certificate) return null;

  const scriptId = (certificate as any).script_id;
  const [{ data: script, error: scriptError }, { data: approvedHistory }, { data: payment }] = await Promise.all([
    supabase
      .from("scripts")
      .select("id, title, type, status, company_id, client_id, created_at")
      .eq("id", scriptId)
      .maybeSingle(),
    supabase
      .from("script_status_history")
      .select("changed_at")
      .eq("script_id", scriptId)
      .eq("to_status", "approved")
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (certificate as any).payment_id
      ? supabase
          .from("script_certificate_payments")
          .select("id, payment_status, total_amount, currency, completed_at")
          .eq("id", (certificate as any).payment_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (scriptError) throw new Error(scriptError.message);

  const certificateData = ((certificate as any).certificate_data ?? {}) as Record<string, unknown>;
  const ownerCompanyId = (((script as any)?.company_id ?? (script as any)?.client_id) ?? certificateData.company_id ?? "").toString();
  const { data: company } = ownerCompanyId
    ? await supabase.from("clients").select("id, name_ar, name_en").eq("id", ownerCompanyId).maybeSingle()
    : { data: null };

  return {
    certificateNumber: (certificate as any).certificate_number,
    certificateStatus: (certificate as any).certificate_status,
    issuedAt: (certificate as any).issued_at,
    scriptTitle: ((script as any)?.title ?? certificateData.script_title ?? "").toString(),
    scriptType: ((script as any)?.type ?? "").toString(),
    scriptStatus: ((script as any)?.status ?? "").toString(),
    submittedAt: ((script as any)?.created_at ?? null) as string | null,
    approvedAt: ((approvedHistory as any)?.changed_at ?? certificateData.approved_at ?? null) as string | null,
    companyNameAr: ((company as any)?.name_ar ?? certificateData.company_name_ar ?? null) as string | null,
    companyNameEn: ((company as any)?.name_en ?? certificateData.company_name_en ?? null) as string | null,
    payment: payment
      ? {
          status: (payment as any).payment_status,
          totalAmount: (payment as any).total_amount,
          currency: (payment as any).currency,
          completedAt: (payment as any).completed_at,
        }
      : null,
    verification: {
      verified: (certificate as any).certificate_status === "issued",
      contentSnapshotAvailable: false,
      contentHash: null,
    },
  };
}

async function ensureCertificateGeneratedForApprovedScript(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  params: { scriptId: string; fallbackIssuedBy?: string | null },
) {
  const { data: existing, error: existingError } = await supabase
    .from("script_certificates")
    .select("id, certificate_number, certificate_data")
    .eq("script_id", params.scriptId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing;

  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .select("id, title, status, company_id, client_id")
    .eq("id", params.scriptId)
    .maybeSingle();
  if (scriptError) throw new Error(scriptError.message);
  if (!script) throw new Error("Script not found");

  const { data: latestReport, error: reportError } = await supabase
    .from("analysis_reports")
    .select("review_status, created_at")
    .eq("script_id", params.scriptId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reportError) throw new Error(reportError.message);

  const isApprovedByScript = ((script as any).status ?? "").toLowerCase() === "approved";
  const isApprovedByReview = (((latestReport as any)?.review_status ?? "").toLowerCase() === "approved");
  if (!isApprovedByScript && !isApprovedByReview) {
    throw new Error("Certificate generation is only allowed for approved scripts");
  }

  const ownerCompanyId = (((script as any).company_id ?? (script as any).client_id) ?? "").toString();
  const { data: company } = ownerCompanyId
    ? await supabase.from("clients").select("id, name_ar, name_en, logo_url").eq("id", ownerCompanyId).maybeSingle()
    : { data: null };

  const { data: certificateNumber, error: numberError } = await supabase.rpc("generate_script_certificate_number");
  if (numberError || !certificateNumber) throw new Error(numberError?.message || "Failed to generate certificate number");

  const issuedAt = new Date().toISOString();
  const storagePath = `${params.scriptId}/${String(certificateNumber)}.pdf`;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage([841.89, 595.28]);
  const cairoRegular = getFontBytes("Cairo-Regular.ttf");
  const cairoBold = getFontBytes("Cairo-Bold.ttf");
  if (!cairoRegular || !cairoBold) {
    throw new Error("Arabic certificate fonts are missing");
  }
  const font = await pdfDoc.embedFont(cairoRegular);
  const boldFont = await pdfDoc.embedFont(cairoBold);
  page.drawRectangle({ x: 20, y: 20, width: 801.89, height: 555.28, borderColor: rgb(0.46, 0.2, 0.4), borderWidth: 2 });
  page.drawText("Script Approval Certificate", { x: 230, y: 520, size: 28, font: boldFont, color: rgb(0.12, 0.12, 0.2) });
  page.drawText(`Certificate Number: ${String(certificateNumber)}`, { x: 60, y: 470, size: 14, font });
  page.drawText(`Script Title: ${String((script as any).title ?? "-")}`, { x: 60, y: 440, size: 14, font });
  page.drawText(`Company: ${((company as any)?.name_en ?? (company as any)?.name_ar ?? "-").toString()}`, { x: 60, y: 410, size: 14, font });
  page.drawText(`Script ID: ${params.scriptId}`, { x: 60, y: 380, size: 11, font, color: rgb(0.35, 0.35, 0.45) });
  page.drawText(`Approved At: ${issuedAt}`, { x: 60, y: 355, size: 11, font, color: rgb(0.35, 0.35, 0.45) });
  const pdfBytes = await pdfDoc.save();

  const { error: uploadError } = await supabase.storage.from(CERTIFICATE_FILES_BUCKET).upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploadError) throw new Error(`Failed to upload certificate PDF: ${uploadError.message}`);

  const certificateData = {
    script_id: params.scriptId,
    script_title: String((script as any).title ?? ""),
    company_id: ownerCompanyId,
    company_name_ar: (company as any)?.name_ar ?? null,
    company_name_en: (company as any)?.name_en ?? null,
    company_logo_url: (company as any)?.logo_url ?? null,
    approved_at: issuedAt,
    issued_at: issuedAt,
    certificate_number: String(certificateNumber),
    amount_paid: 0,
    currency: "SAR",
    generated_on_approval: true,
    file_bucket: CERTIFICATE_FILES_BUCKET,
    file_path: storagePath,
    generated_at: issuedAt,
  };

  const { data: created, error: createError } = await supabase
    .from("script_certificates")
    .insert({
      script_id: params.scriptId,
      payment_id: null,
      owner_user_id: null,
      certificate_number: String(certificateNumber),
      issued_by: params.fallbackIssuedBy ?? null,
      certificate_status: "issued",
      certificate_data: certificateData,
    })
    .select("id, certificate_number, certificate_status, issued_at, certificate_data")
    .single();
  if (createError || !created) throw new Error(createError?.message || "Failed to create certificate record");
  return created;
}

async function createCertificateFileSignedUrl(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  params: {
    scriptId: string;
    userId: string;
    isAdmin: boolean;
    requireCompletedPayment: boolean;
    download?: boolean;
  },
) {
  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .select("id, company_id, client_id")
    .eq("id", params.scriptId)
    .maybeSingle();
  if (scriptError) throw new Error(scriptError.message);
  if (!script) throw new Error("Script not found");

  if (!params.isAdmin) {
    const account = await getClientAccountForUser(supabase, params.userId);
    if (!account) throw new Error("Client portal account not found");
    const ownerCompanyId = ((script as any).company_id ?? (script as any).client_id ?? "").toString();
    if (ownerCompanyId !== account.company_id) throw new Error("Forbidden");
  }

  const { data: certificate, error: certificateError } = await supabase
    .from("script_certificates")
    .select("id, script_id, certificate_data")
    .eq("script_id", params.scriptId)
    .maybeSingle();
  if (certificateError) throw new Error(certificateError.message);
  if (!certificate) throw new Error("Certificate not found");

  if (params.requireCompletedPayment) {
    const payment = await loadLatestCompletedPayment(supabase, params.scriptId);
    if (!payment?.id) throw new Error("Certificate is locked until payment is completed");
  }

  const certificateData = ((certificate as any).certificate_data ?? {}) as Record<string, unknown>;
  const filePath = typeof certificateData.file_path === "string" ? certificateData.file_path.trim() : "";
  if (!filePath) throw new Error("Certificate file is not available");

  const signed = await supabase.storage
    .from(CERTIFICATE_FILES_BUCKET)
    .createSignedUrl(filePath, 60 * 10, params.download ? { download: true } : undefined);
  if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || "Failed to sign certificate file URL");

  return {
    signedUrl: signed.data.signedUrl,
    filePath,
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  const rest = pathAfter("certificates", req.url);
  const method = req.method;

  if (method === "GET" && rest.startsWith("verify/")) {
    const certificateNumber = decodeURIComponent(rest.slice("verify/".length)).trim();
    if (!certificateNumber) return json({ error: "certificateNumber is required" }, 400);
    try {
      const supabase = createSupabaseAdmin();
      const verification = await loadCertificateVerification(supabase, certificateNumber);
      if (!verification) return json({ error: "Certificate not found" }, 404);
      return json({ certificate: verification });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Unable to verify certificate" }, 500);
    }
  }

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { userId, supabase } = auth;
  const isAdmin = await isUserAdmin(supabase, userId);
  const account = await getClientAccountForUser(supabase, userId);

  if (method === "GET" && rest === "client") {
    if (!account) return json({ error: "Client portal account not found" }, 403);
    const { data: scriptsData, error: scriptsError } = await supabase
      .from("scripts")
      .select("id, title, type, status, company_id, client_id, created_at")
      .or(`company_id.eq.${account.company_id},client_id.eq.${account.company_id}`)
      .order("created_at", { ascending: false });
    if (scriptsError) return json({ error: scriptsError.message }, 500);
    const allScripts = (scriptsData ?? []) as Array<{
      id: string;
      title: string;
      type: string;
      status: string;
      company_id?: string | null;
      client_id?: string | null;
      created_at: string;
    }>;
    const reportStatusMap = await loadLatestReportStatusMap(supabase, allScripts.map((s) => s.id));
    const scripts = allScripts.filter((row) => {
      const status = (row.status ?? "").toLowerCase();
      const reviewStatus = reportStatusMap.get(row.id) ?? "";
      return status === "approved" || reviewStatus === "approved";
    });
    const scriptIds = scripts.map((row) => row.id);
    const [approvedAtMap, latestPaymentsMap, certificatesMap, defaultTemplate, feeConfig, companies] = await Promise.all([
      loadApprovedAtMap(supabase, scriptIds),
      loadLatestPaymentsMap(supabase, scriptIds),
      loadCertificatesMap(supabase, scriptIds),
      loadDefaultCertificateTemplate(supabase),
      loadCertificateFeeConfig(supabase),
      supabase.from("clients").select("id, logo_url"),
    ]);
    const companyMap = new Map<string, { logo_url?: string | null }>();
    for (const row of (companies.data ?? []) as Array<{ id: string; logo_url?: string | null }>) {
      companyMap.set(row.id, row);
    }

    return json({
      demoCards: DEMO_CARDS.map((card) => ({
        id: card.id,
        labelAr: card.labelAr,
        labelEn: card.labelEn,
        brand: card.brand,
        maskedNumber: card.maskedNumber,
      })),
      defaultTemplate,
      feeConfig,
      items: mapCertificateItems(scripts, approvedAtMap, latestPaymentsMap, certificatesMap, feeConfig, companyMap),
    });
  }

  if (method === "POST" && rest === "pay") {
    if (!account) return json({ error: "Client portal account not found" }, 403);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const scriptId = typeof body.scriptId === "string" ? body.scriptId.trim() : "";
    const demoCardId = typeof body.demoCardId === "string" ? body.demoCardId.trim() : "";
    if (!scriptId) return json({ error: "scriptId is required" }, 400);
    if (!demoCardId) return json({ error: "demoCardId is required" }, 400);

    const selectedCard = DEMO_CARDS.find((card) => card.id === demoCardId);
    if (!selectedCard) return json({ error: "Unknown demo card" }, 400);

    try {
      const { data: script, error: scriptError } = await supabase
        .from("scripts")
        .select("id, title, type, status, company_id, client_id")
        .eq("id", scriptId)
        .maybeSingle();
      if (scriptError || !script) return json({ error: "Script not found" }, 404);

      const ownerCompanyId = ((script as any).company_id ?? (script as any).client_id ?? "").toString();
      if (ownerCompanyId !== account.company_id) return json({ error: "Forbidden" }, 403);
      const { data: latestReport } = await supabase
        .from("analysis_reports")
        .select("review_status, created_at")
        .eq("script_id", scriptId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const isApprovedByScript = ((script as any).status ?? "").toLowerCase() === "approved";
      const isApprovedByReview = (((latestReport as any)?.review_status ?? "").toLowerCase() === "approved");
      if (!isApprovedByScript && !isApprovedByReview) {
        return json({ error: "Certificate payment is only available for approved scripts" }, 409);
      }

      const feeConfig = await loadCertificateFeeConfig(supabase);

      const paymentReference = `FAKEPAY-${Date.now()}-${scriptId.slice(0, 8).toUpperCase()}`;
      const paymentStatus = selectedCard.success ? "completed" : "failed";
      const { data: payment, error: paymentError } = await supabase
        .from("script_certificate_payments")
        .insert({
          script_id: scriptId,
          payer_user_id: userId,
          amount_base: feeConfig.baseAmount,
          tax_amount: feeConfig.taxAmount,
          total_amount: feeConfig.totalAmount,
          currency: feeConfig.currency,
          payment_status: paymentStatus,
          payment_method: "fake_card",
          payment_reference: paymentReference,
          demo_card_id: selectedCard.id,
          card_brand: selectedCard.brand,
          card_last4: selectedCard.maskedNumber.replace(/\s+/g, "").slice(-4),
          metadata: { demo: true },
          completed_at: selectedCard.success ? new Date().toISOString() : null,
        })
        .select("id, script_id, total_amount, currency, payment_status, payment_method, payment_reference, demo_card_id, card_brand, card_last4, completed_at, created_at")
        .single();
      if (paymentError || !payment) return json({ error: paymentError?.message || "Payment failed" }, 500);

      if (!selectedCard.success) {
        return json({
          ok: false,
          payment: payment,
          error: "Demo payment was declined",
        }, 402);
      }

      const { data: existingCertificate, error: existingCertificateError } = await supabase
        .from("script_certificates")
        .select("id, certificate_number, certificate_status, issued_at, certificate_data")
        .eq("script_id", scriptId)
        .maybeSingle();
      if (existingCertificateError) return json({ error: existingCertificateError.message }, 500);
      const ensuredCertificate = existingCertificate?.id
        ? existingCertificate
        : await ensureCertificateGeneratedForApprovedScript(supabase, {
          scriptId,
          fallbackIssuedBy: userId,
        });

      const mergedCertificateData = {
        ...(((ensuredCertificate as any).certificate_data ?? {}) as Record<string, unknown>),
        amount_paid: Number((payment as any).total_amount ?? feeConfig.totalAmount),
        currency: String((payment as any).currency ?? feeConfig.currency),
        payment_completed_at: (payment as any).completed_at ?? new Date().toISOString(),
        payment_reference: (payment as any).payment_reference ?? paymentReference,
      };

      const { data: linkedCertificate, error: linkCertificateError } = await supabase
        .from("script_certificates")
        .update({
          payment_id: payment.id,
          owner_user_id: userId,
          certificate_data: mergedCertificateData,
        })
        .eq("id", (ensuredCertificate as any).id)
        .select("id, certificate_number, certificate_status, issued_at, certificate_data")
        .single();
      if (linkCertificateError || !linkedCertificate) {
        return json({ error: linkCertificateError?.message || "Failed to link payment to certificate" }, 500);
      }

      await notifyAdmins(supabase, {
        type: "certificate_payment_completed",
        title: `Certificate payment completed: ${(script as any).title}`,
        body: `Client payment was completed for script "${(script as any).title}".`,
        metadata: {
          script_id: scriptId,
          script_title: (script as any).title,
          company_id: account.company_id,
          payment_id: payment.id,
          payment_reference: payment.payment_reference,
          total_amount: payment.total_amount,
          currency: payment.currency,
        },
      });

      return json({
        ok: true,
        payment: payment,
        certificate: {
          id: (linkedCertificate as any).id,
          certificateNumber: (linkedCertificate as any).certificate_number,
          certificateStatus: (linkedCertificate as any).certificate_status,
          issuedAt: (linkedCertificate as any).issued_at,
          certificateData: (linkedCertificate as any).certificate_data ?? {},
        },
      });
    } catch (err) {
      console.error("[certificates/pay] unhandled:", err);
      return json({ error: err instanceof Error ? err.message : "Failed to process certificate payment" }, 500);
    }
  }

  if (rest === "admin/fee-settings") {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    if (method === "GET") {
      const feeConfig = await loadCertificateFeeConfig(supabase);
      return json({ feeConfig });
    }
    if (method === "PUT") {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }
      const feeConfig = normalizeFeeConfig(body);
      if (feeConfig.baseAmount < 0) return json({ error: "baseAmount must be >= 0" }, 400);
      if (feeConfig.taxRate < 0 || feeConfig.taxRate > 1) return json({ error: "taxRate must be between 0 and 1" }, 400);
      const { error } = await supabase
        .from("app_settings")
        .upsert({
          key: CERTIFICATE_FEE_SETTINGS_KEY,
          value: {
            baseAmount: feeConfig.baseAmount,
            taxRate: feeConfig.taxRate,
            currency: feeConfig.currency,
          },
          updated_at: new Date().toISOString(),
          updated_by: userId,
        }, { onConflict: "key" });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, feeConfig });
    }
  }

  if (method === "GET" && rest === "admin") {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const { data: scripts, error: scriptsError } = await supabase
      .from("scripts")
      .select("id, title, type, status, company_id, client_id, created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (scriptsError) return json({ error: scriptsError.message }, 500);
    const scriptIds = ((scripts ?? []) as Array<{ id: string }>).map((row) => row.id);

    const [approvedAtMap, latestPaymentsMap, certificatesMap, companies, defaultTemplate, feeConfig] = await Promise.all([
      loadApprovedAtMap(supabase, scriptIds),
      loadLatestPaymentsMap(supabase, scriptIds),
      loadCertificatesMap(supabase, scriptIds),
      supabase.from("clients").select("id, name_ar, name_en, logo_url"),
      loadDefaultCertificateTemplate(supabase),
      loadCertificateFeeConfig(supabase),
    ]);

    const companyMap = new Map<string, { name_ar?: string | null; name_en?: string | null }>();
    for (const row of (companies.data ?? []) as Array<{ id: string; name_ar?: string | null; name_en?: string | null }>) {
      companyMap.set(row.id, row);
    }

    const items = ((scripts ?? []) as Array<any>).map((script) => {
      const latestPayment = latestPaymentsMap.get(script.id) ?? null;
      const certificate = certificatesMap.get(script.id) ?? null;
      const status = resolveClientCertificateStatus(latestPayment, certificate);
      const ownerCompanyId = (script.company_id ?? script.client_id ?? "").toString();
      const company = companyMap.get(ownerCompanyId);
      return {
        scriptId: script.id,
        scriptTitle: script.title,
        scriptType: script.type,
        approvedAt: approvedAtMap.get(script.id) ?? script.created_at,
        companyId: ownerCompanyId || null,
        companyNameAr: company?.name_ar ?? null,
        companyNameEn: company?.name_en ?? null,
        companyLogoUrl: company?.logo_url ?? null,
        certificateFee: {
          baseAmount: feeConfig.baseAmount,
          taxAmount: feeConfig.taxAmount,
          totalAmount: feeConfig.totalAmount,
          currency: feeConfig.currency,
        },
        certificateStatus: status,
        latestPayment: latestPayment
          ? {
              id: latestPayment.id,
              paymentStatus: latestPayment.payment_status,
              paymentMethod: latestPayment.payment_method,
              paymentReference: latestPayment.payment_reference,
              demoCardId: latestPayment.demo_card_id,
              cardBrand: latestPayment.card_brand,
              cardLast4: latestPayment.card_last4,
              completedAt: latestPayment.completed_at,
              createdAt: latestPayment.created_at,
            }
          : null,
        certificate: certificate
          ? {
              id: certificate.id,
              certificateNumber: certificate.certificate_number,
              certificateStatus: certificate.certificate_status,
              issuedAt: certificate.issued_at,
              certificateData: certificate.certificate_data ?? {},
            }
          : null,
      };
    });

    const paymentsCount = items.filter((item) => item.latestPayment?.paymentStatus === "completed").length;
    const issuedCount = items.filter((item) => item.certificateStatus === "issued").length;

    return json({
      summary: {
        approvedScripts: items.length,
        completedPayments: paymentsCount,
        issuedCertificates: issuedCount,
        pendingPayments: items.filter((item) => item.certificateStatus === "payment_pending").length,
      },
      defaultTemplate,
      items,
    });
  }

  if (rest === "templates" && method === "GET") {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    const { data, error } = await supabase
      .from("certificate_templates")
      .select("id, name, description, is_default, page_size, orientation, background_color, background_image_url, background_image_fit, background_image_opacity, template_data, created_at, updated_at")
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ templates: ((data ?? []) as CertificateTemplateRow[]).map(mapTemplate) });
  }

  if (rest === "templates" && method === "POST") {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!name) return json({ error: "Template name is required" }, 400);

    const { data, error } = await supabase
      .from("certificate_templates")
      .insert({
        name,
        description: description || null,
        created_by: userId,
        template_data: { elements: [] },
      })
      .select("id, name, description, is_default, page_size, orientation, background_color, background_image_url, background_image_fit, background_image_opacity, template_data, created_at, updated_at")
      .single();
    if (error || !data) return json({ error: error?.message || "Failed to create template" }, 500);
    return json({ ok: true, template: mapTemplate(data as CertificateTemplateRow) }, 201);
  }

  const templateMatch = rest.match(/^templates\/([0-9a-f-]{36})(?:\/(default))?$/i);
  if (templateMatch) {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    const templateId = templateMatch[1];
    const action = templateMatch[2] ?? "";

    if (method === "GET" && !action) {
      const { data, error } = await supabase
        .from("certificate_templates")
        .select("id, name, description, is_default, page_size, orientation, background_color, background_image_url, background_image_fit, background_image_opacity, template_data, created_at, updated_at")
        .eq("id", templateId)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "Template not found" }, 404);
      return json({ template: mapTemplate(data as CertificateTemplateRow) });
    }

    if (method === "PUT" && !action) {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      const update = templatePayloadFromBody(body);
      if (typeof update.name === "string" && !update.name) return json({ error: "Template name is required" }, 400);

      const { data, error } = await supabase
        .from("certificate_templates")
        .update(update)
        .eq("id", templateId)
        .select("id, name, description, is_default, page_size, orientation, background_color, background_image_url, background_image_fit, background_image_opacity, template_data, created_at, updated_at")
        .single();
      if (error || !data) return json({ error: error?.message || "Failed to update template" }, 500);
      return json({ ok: true, template: mapTemplate(data as CertificateTemplateRow) });
    }

    if (method === "POST" && action === "default") {
      const existing = await supabase
        .from("certificate_templates")
        .select("id")
        .eq("id", templateId)
        .maybeSingle();
      if (existing.error) return json({ error: existing.error.message }, 500);
      if (!existing.data) return json({ error: "Template not found" }, 404);

      const clearDefault = await supabase
        .from("certificate_templates")
        .update({ is_default: false })
        .eq("is_default", true);
      if (clearDefault.error) return json({ error: clearDefault.error.message }, 500);

      const { data, error } = await supabase
        .from("certificate_templates")
        .update({ is_default: true })
        .eq("id", templateId)
        .select("id, name, description, is_default, page_size, orientation, background_color, background_image_url, background_image_fit, background_image_opacity, template_data, created_at, updated_at")
        .single();
      if (error || !data) return json({ error: error?.message || "Failed to set default template" }, 500);
      return json({ ok: true, template: mapTemplate(data as CertificateTemplateRow) });
    }
  }

  if (method === "POST" && rest === "admin/confirm-payment") {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const scriptId = typeof body.scriptId === "string" ? body.scriptId.trim() : "";
    if (!scriptId) return json({ error: "scriptId is required" }, 400);

    try {
      const context = await loadAdminScriptContext(supabase, scriptId);
      if (!context) return json({ error: "Script not found" }, 404);

      const existingCompletedPayment = await loadLatestCompletedPayment(supabase, scriptId);
      if (existingCompletedPayment?.id) {
        return json({ ok: true, alreadyCompleted: true, payment: existingCompletedPayment });
      }

      const feeConfig = await loadCertificateFeeConfig(supabase);
      const paymentReference = `ADMINFAKE-${Date.now()}-${scriptId.slice(0, 8).toUpperCase()}`;
      const { data: payment, error: paymentError } = await supabase
        .from("script_certificate_payments")
        .insert({
          script_id: scriptId,
          payer_user_id: context.account?.user_id ?? null,
          amount_base: feeConfig.baseAmount,
          tax_amount: feeConfig.taxAmount,
          total_amount: feeConfig.totalAmount,
          currency: feeConfig.currency,
          payment_status: "completed",
          payment_method: "admin_confirmed_fake",
          payment_reference: paymentReference,
          demo_card_id: "admin_confirmed",
          card_brand: "admin",
          card_last4: "0000",
          metadata: { demo: true, admin_confirmed: true, confirmed_by: userId },
          completed_at: new Date().toISOString(),
        })
        .select("id, payer_user_id, script_id, total_amount, currency, payment_status, payment_method, payment_reference, demo_card_id, card_brand, card_last4, completed_at, created_at")
        .single();
      if (paymentError || !payment) return json({ error: paymentError?.message || "Failed to confirm payment" }, 500);

      return json({ ok: true, payment });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Failed to confirm payment" }, 500);
    }
  }

  if (method === "POST" && rest === "admin/issue") {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const scriptId = typeof body.scriptId === "string" ? body.scriptId.trim() : "";
    const forceRegenerate = body.forceRegenerate === true;
    if (!scriptId) return json({ error: "scriptId is required" }, 400);

    const reason = forceRegenerate
      ? "Manual regenerate is disabled. Certificates are generated automatically only at admin approval."
      : "Manual issue is disabled. Certificates are generated automatically only at admin approval.";
    return json({ error: reason }, 409);
  }

  const clientFileMatch = rest.match(/^client\/file\/([0-9a-f-]{36})$/i);
  if (method === "GET" && clientFileMatch) {
    if (!account) return json({ error: "Client portal account not found" }, 403);
    const scriptId = clientFileMatch[1];
    try {
      const payload = await createCertificateFileSignedUrl(supabase, {
        scriptId,
        userId,
        isAdmin: false,
        requireCompletedPayment: true,
        download: new URL(req.url).searchParams.get("download") === "1",
      });
      return json({ ok: true, ...payload });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Unable to open certificate file" }, 400);
    }
  }

  const adminFileMatch = rest.match(/^admin\/file\/([0-9a-f-]{36})$/i);
  if (method === "GET" && adminFileMatch) {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    const scriptId = adminFileMatch[1];
    try {
      const payload = await createCertificateFileSignedUrl(supabase, {
        scriptId,
        userId,
        isAdmin: true,
        requireCompletedPayment: false,
        download: new URL(req.url).searchParams.get("download") === "1",
      });
      return json({ ok: true, ...payload });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Unable to open certificate file" }, 400);
    }
  }

  return json({ error: "Not Found" }, 404);
});
