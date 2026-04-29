import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { isUserAdmin } from "../_shared/roleCheck.ts";

const LOGO_BUCKET = "company-logos";
const LEGAL_DOC_BUCKET = "company-legal-documents";
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_MIMES = new Set(["image/png", "image/jpeg"]);
const DOC_MAX_BYTES = 10 * 1024 * 1024;
const DOC_MIMES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const RESEND_API = "https://api.resend.com/emails";
const FROM_EMAIL = "Raawi Film <no-reply@unifinitylab.com>";

function pathAfter(base: string, url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(new RegExp(`/${base}/?(.*)$`));
  return (match?.[1] ?? "").replace(/^\/+/, "").trim();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function field(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendClientEmail(params: { to: string; subject: string; html: string }) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("[client-portal] RESEND_API_KEY not set; skipping email:", params.subject, params.to);
    return;
  }
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });
  if (!res.ok) {
    console.error("[client-portal] email failed:", res.status, await res.text());
  }
}

function buildBilingualClientEmail(params: {
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  ctaLabelEn?: string;
  ctaLabelAr?: string;
  ctaUrl?: string;
}): string {
  const ctaHtml = params.ctaUrl
    ? `
      <p style="margin:20px 0 0;">
        <a href="${htmlEscape(params.ctaUrl)}" style="background:#5b4bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block;font-weight:600;">
          ${htmlEscape(params.ctaLabelEn ?? "Open Portal")}
        </a>
      </p>
      <p dir="rtl" style="margin:10px 0 0;">
        <a href="${htmlEscape(params.ctaUrl)}" style="background:#5b4bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block;font-weight:600;font-family:Cairo,'Noto Kufi Arabic',Tahoma,Arial,sans-serif;">
          ${htmlEscape(params.ctaLabelAr ?? "فتح البوابة")}
        </a>
      </p>
    `
    : "";

  return `
    <div style="max-width:680px;margin:0 auto;padding:20px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;color:#111827;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
      <div style="text-align:center;margin-bottom:16px;">
        <img src="https://raawifilm.com/fclogo.png" alt="Film Commission" style="height:56px;object-fit:contain;" />
      </div>
      <h2 style="margin:0 0 10px;font-size:20px;">${htmlEscape(params.titleEn)}</h2>
      <p style="margin:0 0 14px;white-space:pre-wrap;">${params.bodyEn}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0;" />
      <h2 dir="rtl" style="margin:0 0 10px;font-size:20px;font-family:Cairo,'Noto Kufi Arabic',Tahoma,Arial,sans-serif;">${htmlEscape(params.titleAr)}</h2>
      <p dir="rtl" style="margin:0 0 14px;white-space:pre-wrap;font-family:Cairo,'Noto Kufi Arabic',Tahoma,Arial,sans-serif;">${params.bodyAr}</p>
      ${ctaHtml}
    </div>
  `.trim();
}

async function loadClientTerms(supabase: ReturnType<typeof createSupabaseAdmin>): Promise<{ ar: string; en: string }> {
  const fallback = {
    ar: "أقر بأن جميع البيانات والمستندات المقدمة صحيحة، وأوافق على شروط استخدام منصة راوي فيلم وسياسة معالجة الطلبات.",
    en: "I confirm that all submitted information and documents are accurate, and I agree to the Raawi Film platform terms and request review policy.",
  };
  const { data } = await supabase.from("app_settings").select("value").eq("key", "client_terms").maybeSingle();
  const value = ((data as any)?.value ?? {}) as Record<string, unknown>;
  return {
    ar: typeof value.ar === "string" && value.ar.trim() ? value.ar : fallback.ar,
    en: typeof value.en === "string" && value.en.trim() ? value.en : fallback.en,
  };
}

function resolveClientSubmissionStatus(
  scriptStatus: unknown,
  latestReportReviewStatus: unknown,
): string {
  const script = typeof scriptStatus === "string" ? scriptStatus.trim().toLowerCase() : "";
  const review = typeof latestReportReviewStatus === "string" ? latestReportReviewStatus.trim().toLowerCase() : "";

  // Client-facing status should reflect final admin decision from the latest review,
  // even if scripts.status was not synced by the caller.
  if (review === "approved") return "approved";
  if (review === "rejected") return "rejected";

  return script || "draft";
}

type ClientAccountRow = {
  user_id: string;
  company_id: string;
  subscription_plan: "free";
  subscription_status: "active" | "inactive";
};

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

async function ensureClientRole(
  supabase: ReturnType<typeof createSupabaseAdmin>,
): Promise<string> {
  const { data: role } = await supabase.from("roles").select("id").eq("key", "client").maybeSingle();
  if (role?.id) return role.id as string;

  const { data: created, error: createErr } = await supabase
    .from("roles")
    .insert({ key: "client", name: "Client" })
    .select("id")
    .single();
  if (createErr || !created?.id) {
    throw new Error(createErr?.message || "Failed to ensure client role");
  }
  return created.id as string;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  const supabase = createSupabaseAdmin();
  const rest = pathAfter("client-portal", req.url);
  const method = req.method;

  if (method === "GET" && rest === "terms") {
    return json(await loadClientTerms(supabase));
  }

  // POST /client-portal/register (public, free registration)
  if (method === "POST" && rest === "register") {
    const contentType = req.headers.get("content-type") ?? "";
    let body: Record<string, unknown> = {};
    let companyLogoFile: File | null = null;
    const legalFiles: Array<{ key: string; type: string; file: File }> = [];

    if (contentType.includes("multipart/form-data")) {
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return json({ error: "Invalid form data" }, 400);
      }
      body = {
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
        companyNameAr: formData.get("companyNameAr"),
        companyNameEn: formData.get("companyNameEn"),
        representativeName: formData.get("representativeName"),
        representativeTitle: formData.get("representativeTitle"),
        mobile: formData.get("mobile"),
        website: formData.get("website"),
        phone: formData.get("phone"),
        addressLine1: formData.get("addressLine1"),
        addressLine2: formData.get("addressLine2"),
        city: formData.get("city"),
        postalCode: formData.get("postalCode"),
        contactEmail: formData.get("contactEmail"),
        contactMobile: formData.get("contactMobile"),
        about: formData.get("about"),
        yearsOfExperience: formData.get("yearsOfExperience"),
        acceptedTerms: formData.get("acceptedTerms"),
      };
      const logoCandidate = formData.get("companyLogoFile") ?? formData.get("companyLogo") ?? formData.get("logo");
      if (logoCandidate instanceof File && logoCandidate.size > 0) {
        companyLogoFile = logoCandidate;
      }
      for (const item of [
        { key: "crDocument", type: "cr" },
        { key: "licenseDocument", type: "license" },
        { key: "nationalAddressDocument", type: "national_address" },
      ]) {
        const candidate = formData.get(item.key);
        if (candidate instanceof File && candidate.size > 0) {
          legalFiles.push({ ...item, file: candidate });
        }
      }
    } else {
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const companyNameAr = typeof body.companyNameAr === "string" ? body.companyNameAr.trim() : "";
    const companyNameEn = typeof body.companyNameEn === "string" ? body.companyNameEn.trim() : "";
    const representativeName = typeof body.representativeName === "string" ? body.representativeName.trim() : null;
    const representativeTitle = typeof body.representativeTitle === "string" ? body.representativeTitle.trim() : null;
    const mobile = normalizePhone(body.mobile);
    const website = field(body, "website");
    const phone = normalizePhone(body.phone);
    const addressLine1 = field(body, "addressLine1");
    const addressLine2 = field(body, "addressLine2");
    const city = field(body, "city");
    const postalCode = field(body, "postalCode");
    const contactEmail = field(body, "contactEmail");
    const contactMobile = normalizePhone(body.contactMobile);
    const about = field(body, "about");
    const yearsOfExperience = Number.parseInt(field(body, "yearsOfExperience") ?? "0", 10);
    const acceptedTerms = body.acceptedTerms === true || body.acceptedTerms === "true";

    if (!email || !isValidEmail(email)) return json({ error: "Valid email is required" }, 400);
    if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
    if (!name) return json({ error: "Name is required" }, 400);
    if (!companyNameAr || !companyNameEn) return json({ error: "companyNameAr and companyNameEn are required" }, 400);
    if (!mobile) return json({ error: "Company phone/mobile is required" }, 400);
    if (!addressLine1 || !city || !postalCode) return json({ error: "Saudi address fields are required" }, 400);
    if (contactEmail && !isValidEmail(contactEmail)) return json({ error: "Valid contact email is required" }, 400);
    if (!acceptedTerms) return json({ error: "Terms must be accepted" }, 400);
    if (legalFiles.length < 3) return json({ error: "CR, license, and national address documents are required" }, 400);
    if (companyLogoFile) {
      if (!LOGO_MIMES.has(companyLogoFile.type)) {
        return json({ error: "Company logo must be PNG or JPG" }, 400);
      }
      if (companyLogoFile.size > LOGO_MAX_BYTES) {
        return json({ error: "Company logo max size is 2MB" }, 400);
      }
    }
    for (const doc of legalFiles) {
      if (!DOC_MIMES.has(doc.file.type)) {
        return json({ error: "Legal documents must be PDF, PNG, or JPG" }, 400);
      }
      if (doc.file.size > DOC_MAX_BYTES) {
        return json({ error: "Legal document max size is 10MB" }, 400);
      }
    }

    const { data: usersList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailTaken = (usersList?.users ?? []).some((u) => (u.email ?? "").toLowerCase() === email);
    if (emailTaken) return json({ error: "Email already registered" }, 409);

    const [{ data: duplicateAr }, { data: duplicateEn }] = await Promise.all([
      supabase
        .from("clients")
        .select("id")
        .ilike("name_ar", companyNameAr)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("clients")
        .select("id")
        .ilike("name_en", companyNameEn)
        .limit(1)
        .maybeSingle(),
    ]);
    if (duplicateAr?.id || duplicateEn?.id) {
      return json({ error: "Company name already exists" }, 409);
    }

    let createdUserId: string | null = null;
    let createdCompanyId: string | null = null;
    let uploadedLogoObjectPath: string | null = null;
    try {
      const { data: userData, error: createUserErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          role: "Client",
          allowedSections: ["client_portal"],
          approvalStatus: "pending",
        },
      });
      if (createUserErr || !userData.user?.id) {
        return json({ error: createUserErr?.message || "Failed to create account" }, 400);
      }
      createdUserId = userData.user.id;

      const roleId = await ensureClientRole(supabase);
      const { error: roleErr } = await supabase
        .from("user_roles")
        .upsert({ user_id: createdUserId, role_id: roleId }, { onConflict: "user_id,role_id" });
      if (roleErr) throw new Error(roleErr.message);

      const { data: company, error: companyErr } = await supabase
        .from("clients")
        .insert({
          name_ar: companyNameAr,
          name_en: companyNameEn,
          representative_name: representativeName,
          representative_title: representativeTitle,
          mobile,
          phone,
          email,
          website,
          address_line1: addressLine1,
          address_line2: addressLine2,
          city,
          postal_code: postalCode,
          country: "Saudi Arabia",
          contact_email: contactEmail ?? email,
          contact_mobile: contactMobile,
          about,
          years_of_experience: Number.isFinite(yearsOfExperience) ? yearsOfExperience : null,
          source: "portal",
          approval_status: "pending",
          terms_accepted_at: new Date().toISOString(),
          created_by: createdUserId,
        })
        .select("id, created_at")
        .single();
      if (companyErr || !company?.id) throw new Error(companyErr?.message || "Failed to create company profile");
      createdCompanyId = company.id;

      if (companyLogoFile) {
        const ext = companyLogoFile.type === "image/png" ? "png" : "jpg";
        const objectName = `${company.id}/${crypto.randomUUID()}.${ext}`;
        uploadedLogoObjectPath = objectName;
        const { error: uploadErr } = await supabase.storage
          .from(LOGO_BUCKET)
          .upload(objectName, companyLogoFile, { contentType: companyLogoFile.type, upsert: true });
        if (uploadErr) throw new Error(uploadErr.message || "Failed to upload company logo");

        const logoUrl = `${LOGO_BUCKET}/${objectName}`;
        const { error: updateLogoErr } = await supabase
          .from("clients")
          .update({ logo_url: logoUrl, logo_updated_at: new Date().toISOString() })
          .eq("id", company.id);
        if (updateLogoErr) throw new Error(updateLogoErr.message || "Failed to save company logo");
      }

      const legalDocuments: Array<{ type: string; name: string; path: string; size: number; mimeType: string }> = [];
      for (const doc of legalFiles) {
        const rawExt = doc.file.name.split(".").pop()?.toLowerCase();
        const ext = rawExt && /^[a-z0-9]+$/.test(rawExt) ? rawExt : (doc.file.type === "application/pdf" ? "pdf" : "bin");
        const objectName = `${company.id}/${doc.type}-${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from(LEGAL_DOC_BUCKET)
          .upload(objectName, doc.file, { contentType: doc.file.type, upsert: true });
        if (uploadErr) throw new Error(uploadErr.message || "Failed to upload legal document");
        legalDocuments.push({ type: doc.type, name: doc.file.name, path: `${LEGAL_DOC_BUCKET}/${objectName}`, size: doc.file.size, mimeType: doc.file.type });
      }
      const { error: docsErr } = await supabase
        .from("clients")
        .update({ legal_documents: legalDocuments })
        .eq("id", company.id);
      if (docsErr) throw new Error(docsErr.message || "Failed to save legal documents");

      const { error: accountErr } = await supabase
        .from("client_portal_accounts")
        .insert({
          user_id: createdUserId,
          company_id: company.id,
          subscription_plan: "free",
          subscription_status: "inactive",
        });
      if (accountErr) throw new Error(accountErr.message);

      await supabase
        .from("profiles")
        .upsert(
          { user_id: createdUserId, name, email, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );

      const { error: metaErr } = await supabase.auth.admin.updateUserById(createdUserId, {
        user_metadata: {
          ...(userData.user.user_metadata ?? {}),
          name,
          role: "Client",
          companyId: company.id,
          allowedSections: ["client_portal"],
          subscriptionPlan: "free",
          subscriptionStatus: "inactive",
          approvalStatus: "pending",
        },
      });
      if (metaErr) throw new Error(metaErr.message);

      await supabase.auth.admin.updateUserById(createdUserId, {
        ban_duration: "876000h",
      });

      await sendClientEmail({
        to: email,
        subject: "Registration received | تم استلام طلب التسجيل",
        html: buildBilingualClientEmail({
          titleEn: "Registration Received",
          titleAr: "تم استلام طلب التسجيل",
          bodyEn: `Dear ${htmlEscape(name)},\nThank you for registering ${htmlEscape(companyNameEn)} with Raawi Film.\nYour request is now under review. We will email you once the admin team approves or rejects it.`,
          bodyAr: `عزيزي/عزيزتي ${htmlEscape(name)}،\nشكرًا لتسجيل شركة ${htmlEscape(companyNameAr)} في منصة راوي فيلم.\nطلبكم الآن قيد المراجعة، وسيصلكم بريد إلكتروني بعد قرار الاعتماد أو الرفض.`,
        }),
      });

      return json({
        ok: true,
        registration: "pending_review",
        userId: createdUserId,
        companyId: company.id,
      }, 201);
    } catch (error) {
      if (uploadedLogoObjectPath) {
        await supabase.storage.from(LOGO_BUCKET).remove([uploadedLogoObjectPath]).catch(() => {});
      }
      if (createdCompanyId) {
        try {
          await supabase.from("clients").delete().eq("id", createdCompanyId);
        } catch (_) {
          // best-effort cleanup
        }
      }
      if (createdUserId) {
        await supabase.auth.admin.deleteUser(createdUserId).catch(() => {});
      }
      return json({ error: error instanceof Error ? error.message : "Registration failed" }, 500);
    }
  }

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const account = await getClientAccountForUser(supabase, userId);
  const isAdmin = await isUserAdmin(supabase, userId);

  if (method === "PUT" && rest === "admin/terms") {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    let body: { ar?: string; en?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const ar = (body.ar ?? "").trim();
    const en = (body.en ?? "").trim();
    if (!ar || !en) return json({ error: "Arabic and English terms are required" }, 400);
    const value = { ar, en };
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "client_terms", value, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "key" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, terms: value });
  }

  // GET /client-portal/me
  if (method === "GET" && rest === "me") {
    if (!account) return json({ error: "Client portal account not found" }, 403);
    if (account.subscription_status !== "active") return json({ error: "Client portal account is not active" }, 403);
    const [{ data: userResult }, { data: company }] = await Promise.all([
      supabase.auth.admin.getUserById(userId),
      supabase
        .from("clients")
        .select("id, name_ar, name_en, representative_name, representative_title, email, mobile, created_at")
        .eq("id", account.company_id)
        .maybeSingle(),
    ]);

    const appUser = userResult.user;
    return json({
      user: {
        id: userId,
        email: appUser?.email ?? "",
        name: (appUser?.user_metadata?.name as string) ?? appUser?.email?.split("@")[0] ?? "Client",
        role: "Client",
      },
      subscription: {
        plan: account.subscription_plan,
        status: account.subscription_status,
        price: 0,
      },
      company: company
        ? {
            companyId: (company as any).id,
            nameAr: (company as any).name_ar,
            nameEn: (company as any).name_en,
            representativeName: (company as any).representative_name,
            representativeTitle: (company as any).representative_title,
            email: (company as any).email,
            mobile: (company as any).mobile,
            createdAt: (company as any).created_at,
          }
        : null,
    });
  }

  // GET /client-portal/submissions
  if (method === "GET" && rest === "submissions") {
    if (!account) return json({ error: "Client portal account not found" }, 403);
    const { data: scripts, error: scriptsErr } = await supabase
      .from("scripts")
      .select("id, title, type, status, created_at, received_at, current_version_id, company_id, client_id")
      .or(`company_id.eq.${account.company_id},client_id.eq.${account.company_id}`)
      .eq("is_quick_analysis", false)
      .order("created_at", { ascending: false });
    if (scriptsErr) return json({ error: scriptsErr.message }, 500);

    const scriptIds = (scripts ?? []).map((s: any) => s.id);
    const { data: reports } = scriptIds.length > 0
      ? await supabase
          .from("analysis_reports")
          .select("id, script_id, review_status, created_at")
          .in("script_id", scriptIds)
          .order("created_at", { ascending: false })
      : { data: [] as any[] };

    const latestReportByScript = new Map<string, any>();
    for (const report of reports ?? []) {
      if (!latestReportByScript.has(report.script_id)) {
        latestReportByScript.set(report.script_id, report);
      }
    }

    const items = (scripts ?? []).map((row: any) => {
      const latestReport = latestReportByScript.get(row.id) ?? null;
      const effectiveStatus = resolveClientSubmissionStatus(row.status, latestReport?.review_status);
      return {
        scriptId: row.id,
        title: row.title,
        type: row.type,
        status: effectiveStatus,
        createdAt: row.created_at,
        receivedAt: row.received_at,
        currentVersionId: row.current_version_id,
        latestReportId: latestReport?.id ?? null,
        latestReportReviewStatus: latestReport?.review_status ?? null,
        latestReportCreatedAt: latestReport?.created_at ?? null,
      };
    });

    return json(items);
  }

  // GET /client-portal/admin/submissions
  if (method === "GET" && rest === "admin/submissions") {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const { data: accounts } = await supabase
      .from("client_portal_accounts")
      .select("user_id, company_id, subscription_plan, subscription_status");

    if (!accounts || accounts.length === 0) return json([]);

    const clientUserIds = new Set((accounts as Array<{ user_id: string }>).map((a) => a.user_id));
    const companyIds = new Set((accounts as Array<{ company_id: string }>).map((a) => a.company_id));
    const planByCompany = new Map<string, { plan: string; status: string }>();
    for (const row of accounts as Array<{ company_id: string; subscription_plan: string; subscription_status: string }>) {
      if (!planByCompany.has(row.company_id)) {
        planByCompany.set(row.company_id, { plan: row.subscription_plan, status: row.subscription_status });
      }
    }

    const { data: scriptRows, error: scriptErr } = await supabase
      .from("scripts")
      .select("id, title, type, status, created_at, received_at, current_version_id, created_by, assignee_id, company_id, client_id, synopsis")
      .eq("is_quick_analysis", false)
      .order("created_at", { ascending: false })
      .limit(500);
    if (scriptErr) return json({ error: scriptErr.message }, 500);

    const submissions = (scriptRows ?? []).filter((row: any) => {
      const scriptCompanyId = (row.company_id ?? row.client_id ?? "").toString();
      return clientUserIds.has(row.created_by) || companyIds.has(scriptCompanyId);
    });
    if (submissions.length === 0) return json([]);

    const submissionScriptIds = submissions.map((row: any) => row.id);
    const submissionCompanyIds = [...new Set(submissions.map((row: any) => (row.company_id ?? row.client_id ?? "").toString()).filter(Boolean))];
    const submitterIds = [...new Set(submissions.map((row: any) => row.created_by).filter(Boolean))];
    const assigneeIds = [...new Set(submissions.map((row: any) => row.assignee_id).filter(Boolean))];
    const userIds = [...new Set([...submitterIds, ...assigneeIds])];

    const [{ data: companies }, { data: profiles }, { data: jobs }, { data: reports }] = await Promise.all([
      submissionCompanyIds.length > 0
        ? supabase.from("clients").select("id, name_ar, name_en").in("id", submissionCompanyIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length > 0
        ? supabase.from("profiles").select("user_id, name, email").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      submissionScriptIds.length > 0
        ? supabase
            .from("analysis_jobs")
            .select("id, script_id, status, created_at, completed_at, progress_percent")
            .in("script_id", submissionScriptIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      submissionScriptIds.length > 0
        ? supabase
            .from("analysis_reports")
            .select("id, script_id, job_id, review_status, created_at")
            .in("script_id", submissionScriptIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const companyById = new Map((companies ?? []).map((row: any) => [row.id, row]));
    const profileById = new Map((profiles ?? []).map((row: any) => [row.user_id, row]));
    const latestJobByScript = new Map<string, any>();
    const latestReportByScript = new Map<string, any>();
    for (const job of jobs ?? []) {
      if (!latestJobByScript.has(job.script_id)) latestJobByScript.set(job.script_id, job);
    }
    for (const report of reports ?? []) {
      if (!latestReportByScript.has(report.script_id)) latestReportByScript.set(report.script_id, report);
    }

    return json(submissions.map((row: any) => {
      const scriptCompanyId = (row.company_id ?? row.client_id ?? "").toString();
      const company = companyById.get(scriptCompanyId);
      const submitter = row.created_by ? profileById.get(row.created_by) : null;
      const assignee = row.assignee_id ? profileById.get(row.assignee_id) : null;
      const latestJob = latestJobByScript.get(row.id) ?? null;
      const latestReport = latestReportByScript.get(row.id) ?? null;
      const plan = planByCompany.get(scriptCompanyId) ?? { plan: "free", status: "active" };
      const effectiveStatus = resolveClientSubmissionStatus(row.status, latestReport?.review_status);

      return {
        scriptId: row.id,
        title: row.title,
        type: row.type,
        status: effectiveStatus,
        synopsis: row.synopsis ?? null,
        submittedAt: row.created_at,
        receivedAt: row.received_at ?? null,
        currentVersionId: row.current_version_id ?? null,
        companyId: scriptCompanyId,
        companyNameAr: company?.name_ar ?? null,
        companyNameEn: company?.name_en ?? null,
        submittedByUserId: row.created_by ?? null,
        submittedByName: submitter?.name ?? null,
        submittedByEmail: submitter?.email ?? null,
        assigneeId: row.assignee_id ?? null,
        assigneeName: assignee?.name ?? null,
        latestJobId: latestJob?.id ?? null,
        latestJobStatus: latestJob?.status ?? null,
        latestJobProgressPercent: latestJob?.progress_percent ?? null,
        latestJobCompletedAt: latestJob?.completed_at ?? null,
        latestReportId: latestReport?.id ?? null,
        latestReportReviewStatus: latestReport?.review_status ?? null,
        latestReportCreatedAt: latestReport?.created_at ?? null,
        subscriptionPlan: plan.plan,
        subscriptionStatus: plan.status,
      };
    }));
  }

  // GET /client-portal/rejections/:scriptId
  const rejectionMatch = rest.match(/^rejections\/([^/]+)$/);
  if (method === "GET" && rejectionMatch) {
    if (!account) return json({ error: "Client portal account not found" }, 403);
    const scriptId = rejectionMatch[1].trim();
    if (!scriptId) return json({ error: "scriptId is required" }, 400);

    const { data: scriptRow } = await supabase
      .from("scripts")
      .select("id, company_id, client_id, title, status")
      .eq("id", scriptId)
      .maybeSingle();
    if (!scriptRow) return json({ error: "Script not found" }, 404);
    const scriptCompanyId = ((scriptRow as any).company_id ?? (scriptRow as any).client_id ?? "").toString();
    if (scriptCompanyId !== account.company_id) {
      return json({ error: "Forbidden" }, 403);
    }

    const { data: latestDecision } = await supabase
      .from("script_status_history")
      .select("id, changed_at, reason, related_report_id, metadata")
      .eq("script_id", scriptId)
      .eq("to_status", "rejected")
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const decisionMetadata = ((latestDecision as any)?.metadata ?? {}) as Record<string, unknown>;
    const hasExplicitShareChoice = typeof decisionMetadata.share_reports_to_client === "boolean";
    const shareReportsToClient = hasExplicitShareChoice
      ? decisionMetadata.share_reports_to_client === true
      : true; // Legacy fallback: older rejections implicitly shared latest report

    const sharedReportIdsFromMeta = Array.isArray(decisionMetadata.shared_report_ids)
      ? [...new Set((decisionMetadata.shared_report_ids as unknown[])
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean))]
      : [];

    const reportIdsToShare = shareReportsToClient
      ? [...new Set([
          ...sharedReportIdsFromMeta,
          ...(typeof (latestDecision as any)?.related_report_id === "string" && (latestDecision as any).related_report_id
            ? [(latestDecision as any).related_report_id as string]
            : []),
        ])]
      : [];

    let reportRows: any[] = [];
    if (reportIdsToShare.length > 0) {
      const { data: explicitRows } = await supabase
        .from("analysis_reports")
        .select("id, job_id, script_id, review_status, review_notes, findings_count, severity_counts, summary_json, created_at")
        .eq("script_id", scriptId)
        .in("id", reportIdsToShare)
        .order("created_at", { ascending: false });
      reportRows = explicitRows ?? [];
    } else if (!hasExplicitShareChoice) {
      const { data: legacyRow } = await supabase
        .from("analysis_reports")
        .select("id, job_id, script_id, review_status, review_notes, findings_count, severity_counts, summary_json, created_at")
        .eq("script_id", scriptId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      reportRows = legacyRow ? [legacyRow] : [];
    }

    const loadReportPayload = async (reportRow: any) => {
      const { data: reviewFindings } = await supabase
        .from("analysis_review_findings")
        .select("id, source_kind, primary_article_id, primary_atom_id, severity, title_ar, description_ar, rationale_ar, evidence_snippet, review_status, include_in_report, page_number, created_at")
        .eq("report_id", reportRow.id)
        .eq("is_hidden", false)
        .eq("include_in_report", true)
        .eq("review_status", "violation")
        .order("created_at", { ascending: true });

      const fallbackFindings =
        (reviewFindings ?? []).length > 0
          ? []
          : (await supabase
              .from("analysis_findings")
              .select("id, source, article_id, atom_id, severity, title_ar, description_ar, rationale_ar, evidence_snippet, review_status, page_number, created_at")
              .eq("job_id", reportRow.job_id)
              .neq("review_status", "approved")
              .order("created_at", { ascending: true })).data ?? [];

      const findings = (reviewFindings ?? []).length > 0
        ? (reviewFindings ?? []).map((f: any) => ({
            id: f.id,
            source: f.source_kind,
            articleId: f.primary_article_id,
            atomId: f.primary_atom_id,
            severity: f.severity,
            titleAr: f.title_ar,
            descriptionAr: f.description_ar,
            rationaleAr: f.rationale_ar,
            evidenceSnippet: f.evidence_snippet,
            pageNumber: f.page_number,
            createdAt: f.created_at,
          }))
        : (fallbackFindings as any[]).map((f: any) => ({
            id: f.id,
            source: f.source,
            articleId: f.article_id,
            atomId: f.atom_id,
            severity: f.severity,
            titleAr: f.title_ar,
            descriptionAr: f.description_ar,
            rationaleAr: f.rationale_ar,
            evidenceSnippet: f.evidence_snippet,
            pageNumber: f.page_number,
            createdAt: f.created_at,
          }));

      return {
        report: {
          id: reportRow.id,
          jobId: reportRow.job_id,
          reviewStatus: reportRow.review_status,
          reviewNotes: reportRow.review_notes,
          findingsCount: reportRow.findings_count,
          severityCounts: reportRow.severity_counts,
          summaryJson: reportRow.summary_json,
          createdAt: reportRow.created_at,
        },
        findings,
      };
    };

    const sharedReports = await Promise.all(reportRows.map((row) => loadReportPayload(row)));
    const primaryShared = sharedReports[0] ?? null;
    const adminComment = typeof decisionMetadata.client_comment === "string" && decisionMetadata.client_comment.trim()
      ? decisionMetadata.client_comment.trim()
      : ((latestDecision as any)?.reason ?? null);

    return json({
      script: {
        id: (scriptRow as any).id,
        title: (scriptRow as any).title,
        status: (scriptRow as any).status,
      },
      decision: {
        status: "rejected",
        decidedAt: (latestDecision as any)?.changed_at ?? null,
        adminComment,
        sharedReportsCount: sharedReports.length,
      },
      sharedReports,
      // Keep legacy fields to avoid breaking older clients.
      report: primaryShared?.report ?? null,
      findings: primaryShared?.findings ?? [],
    });
  }

  return json({ error: "Not Found" }, 404);
});
