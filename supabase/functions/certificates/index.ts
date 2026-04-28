import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { isUserAdmin } from "../_shared/roleCheck.ts";

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
  if (certificate && certificate.certificate_status === "issued") return "issued";
  if (latestPayment?.payment_status === "failed") return "payment_failed";
  return "payment_pending";
}

function mapCertificateItems(
  scripts: Array<{ id: string; title: string; type: string; status: string; created_at: string }>,
  approvedAtMap: Map<string, string>,
  latestPaymentsMap: Map<string, any>,
  certificatesMap: Map<string, any>,
) {
  return scripts.map((script) => {
    const latestPayment = latestPaymentsMap.get(script.id) ?? null;
    const certificate = certificatesMap.get(script.id) ?? null;
    const status = resolveClientCertificateStatus(latestPayment, certificate);
    return {
      scriptId: script.id,
      scriptTitle: script.title,
      scriptType: script.type,
      scriptStatus: script.status,
      approvedAt: approvedAtMap.get(script.id) ?? script.created_at,
      certificateFee: {
        baseAmount: CERTIFICATE_BASE_AMOUNT,
        taxAmount: CERTIFICATE_TAX_AMOUNT,
        totalAmount: CERTIFICATE_TOTAL_AMOUNT,
        currency: CERTIFICATE_CURRENCY,
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
    scriptTitle: string;
    paymentId: string;
    issuedBy?: string | null;
    forceRegenerate?: boolean;
  },
) {
  const existing = await supabase
    .from("script_certificates")
    .select("id, script_id, certificate_number, certificate_status, issued_at, certificate_data")
    .eq("script_id", params.scriptId)
    .maybeSingle();

  if (existing.data?.id && !params.forceRegenerate) return existing.data;

  const { data: certificateNumber, error: numberError } = await supabase.rpc("generate_script_certificate_number");
  if (numberError || !certificateNumber) throw new Error(numberError?.message || "Failed to generate certificate number");

  const certificatePayload = {
    script_id: params.scriptId,
    script_title: params.scriptTitle,
    company_id: params.companyId,
    company_name_ar: params.companyNameAr,
    company_name_en: params.companyNameEn,
    issued_at: new Date().toISOString(),
    certificate_number: certificateNumber,
    amount_paid: CERTIFICATE_TOTAL_AMOUNT,
    currency: CERTIFICATE_CURRENCY,
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
    supabase.from("clients").select("id, name_ar, name_en").eq("id", ownerCompanyId).maybeSingle(),
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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { userId, supabase } = auth;
  const rest = pathAfter("certificates", req.url);
  const method = req.method;
  const isAdmin = await isUserAdmin(supabase, userId);
  const account = await getClientAccountForUser(supabase, userId);

  if (method === "GET" && rest === "client") {
    if (!account) return json({ error: "Client portal account not found" }, 403);
    const scripts = await loadApprovedScriptsForCompany(supabase, account.company_id);
    const scriptIds = scripts.map((row) => row.id);
    const [approvedAtMap, latestPaymentsMap, certificatesMap, defaultTemplate] = await Promise.all([
      loadApprovedAtMap(supabase, scriptIds),
      loadLatestPaymentsMap(supabase, scriptIds),
      loadCertificatesMap(supabase, scriptIds),
      loadDefaultCertificateTemplate(supabase),
    ]);

    return json({
      demoCards: DEMO_CARDS.map((card) => ({
        id: card.id,
        labelAr: card.labelAr,
        labelEn: card.labelEn,
        brand: card.brand,
        maskedNumber: card.maskedNumber,
      })),
      defaultTemplate,
      items: mapCertificateItems(scripts, approvedAtMap, latestPaymentsMap, certificatesMap),
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

    const { data: script, error: scriptError } = await supabase
      .from("scripts")
      .select("id, title, type, status, company_id, client_id")
      .eq("id", scriptId)
      .maybeSingle();
    if (scriptError || !script) return json({ error: "Script not found" }, 404);

    const ownerCompanyId = ((script as any).company_id ?? (script as any).client_id ?? "").toString();
    if (ownerCompanyId !== account.company_id) return json({ error: "Forbidden" }, 403);
    if ((script as any).status !== "approved") {
      return json({ error: "Certificate payment is only available for approved scripts" }, 409);
    }

    const existingCertificate = await supabase
      .from("script_certificates")
      .select("id, script_id, certificate_number, certificate_status, issued_at, certificate_data")
      .eq("script_id", scriptId)
      .maybeSingle();
    if (existingCertificate.data?.id) {
      return json({
        ok: true,
        alreadyIssued: true,
        certificate: {
          id: existingCertificate.data.id,
          certificateNumber: existingCertificate.data.certificate_number,
          certificateStatus: existingCertificate.data.certificate_status,
          issuedAt: existingCertificate.data.issued_at,
          certificateData: existingCertificate.data.certificate_data ?? {},
        },
      });
    }

    const paymentReference = `FAKEPAY-${Date.now()}-${scriptId.slice(0, 8).toUpperCase()}`;
    const paymentStatus = selectedCard.success ? "completed" : "failed";
    const { data: payment, error: paymentError } = await supabase
      .from("script_certificate_payments")
      .insert({
        script_id: scriptId,
        payer_user_id: userId,
        amount_base: CERTIFICATE_BASE_AMOUNT,
        tax_amount: CERTIFICATE_TAX_AMOUNT,
        total_amount: CERTIFICATE_TOTAL_AMOUNT,
        currency: CERTIFICATE_CURRENCY,
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

    const { data: company } = await supabase
      .from("clients")
      .select("id, name_ar, name_en")
      .eq("id", account.company_id)
      .maybeSingle();

    const certificate = await issueCertificateForScript(supabase, {
      scriptId,
      payerUserId: userId,
      companyId: account.company_id,
      companyNameAr: (company as any)?.name_ar ?? null,
      companyNameEn: (company as any)?.name_en ?? null,
      scriptTitle: (script as any).title,
      paymentId: payment.id,
    });

    return json({
      ok: true,
      payment: payment,
      certificate: {
        id: (certificate as any).id,
        certificateNumber: (certificate as any).certificate_number,
        certificateStatus: (certificate as any).certificate_status,
        issuedAt: (certificate as any).issued_at,
        certificateData: (certificate as any).certificate_data ?? {},
      },
    });
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

    const [approvedAtMap, latestPaymentsMap, certificatesMap, companies, defaultTemplate] = await Promise.all([
      loadApprovedAtMap(supabase, scriptIds),
      loadLatestPaymentsMap(supabase, scriptIds),
      loadCertificatesMap(supabase, scriptIds),
      supabase.from("clients").select("id, name_ar, name_en"),
      loadDefaultCertificateTemplate(supabase),
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
        certificateFee: {
          baseAmount: CERTIFICATE_BASE_AMOUNT,
          taxAmount: CERTIFICATE_TAX_AMOUNT,
          totalAmount: CERTIFICATE_TOTAL_AMOUNT,
          currency: CERTIFICATE_CURRENCY,
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

      const paymentReference = `ADMINFAKE-${Date.now()}-${scriptId.slice(0, 8).toUpperCase()}`;
      const { data: payment, error: paymentError } = await supabase
        .from("script_certificate_payments")
        .insert({
          script_id: scriptId,
          payer_user_id: context.account?.user_id ?? null,
          amount_base: CERTIFICATE_BASE_AMOUNT,
          tax_amount: CERTIFICATE_TAX_AMOUNT,
          total_amount: CERTIFICATE_TOTAL_AMOUNT,
          currency: CERTIFICATE_CURRENCY,
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

    try {
      const context = await loadAdminScriptContext(supabase, scriptId);
      if (!context) return json({ error: "Script not found" }, 404);

      const payment = await loadLatestCompletedPayment(supabase, scriptId);
      if (!payment?.id) {
        return json({ error: "A completed certificate payment is required before issuing a certificate" }, 409);
      }

      const certificate = await issueCertificateForScript(supabase, {
        scriptId,
        payerUserId: payment.payer_user_id ?? context.account?.user_id ?? null,
        companyId: context.ownerCompanyId,
        companyNameAr: context.company?.name_ar ?? null,
        companyNameEn: context.company?.name_en ?? null,
        scriptTitle: context.script.title,
        paymentId: payment.id,
        issuedBy: userId,
        forceRegenerate,
      });

      return json({
        ok: true,
        certificate: {
          id: (certificate as any).id,
          certificateNumber: (certificate as any).certificate_number,
          certificateStatus: (certificate as any).certificate_status,
          issuedAt: (certificate as any).issued_at,
          certificateData: (certificate as any).certificate_data ?? {},
        },
      });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Failed to issue certificate" }, 500);
    }
  }

  return json({ error: "Not Found" }, 404);
});
