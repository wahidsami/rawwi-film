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
const PDF_MIMES = new Set(["application/pdf"]);
const RESEND_API = "https://api.resend.com/emails";
const FROM_EMAIL = "Raawi Film <no-reply@unifinitylab.com>";
const OTP_TTL_MINUTES = 10;
const OTP_VERIFICATION_TOKEN_TTL_MINUTES = 30;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(digest);
}

function generateOtpCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  const n = Number(bytes[0] % 1_000_000);
  return n.toString().padStart(6, "0");
}

function generateVerificationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

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
  logoUrl?: string;
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
        <img src="${htmlEscape(params.logoUrl ?? "https://raawifilm.com/fclogo.png")}" alt="Film Commission" style="height:56px;object-fit:contain;" />
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
  if (error) console.error("[client-portal] notify admins:", error.message);
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

function normalizeShareReportFormats(value: unknown): Array<"pdf" | "docx"> {
  if (!Array.isArray(value)) return [];
  const result = new Set<"pdf" | "docx">();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const v = item.trim().toLowerCase();
    if (v === "pdf" || v === "docx") result.add(v);
  }
  return [...result];
}

async function loadReportPayload(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  reportRow: any,
) {
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
}

async function loadClientRegulations(supabase: ReturnType<typeof createSupabaseAdmin>): Promise<{ ar: string; en: string }> {
  const fallback = {
    ar: `1. المحظورات العامة لمحتوى الأفلام والمسلسلات

1.1 الإساءة لأصول الشريعة الإسلامية المنصوص عليها علميًا في القرآن الكريم والأحاديث النبوية الشريفة المتواترة.

1.2 المساس بالدولة السعودية أو ملوك المملكة العربية السعودية أو ولي العهد، سواء بالأقوال أو الأفعال أو السياق الداعي لذلك، تلميحًا أو صراحة.

1.3 المحتوى الذي يمس الأمن الوطني للمملكة، أو المحتوى الداعي له أو المروج لذلك، ويندرج تحت ذلك:
- الدعوة للعصيان المدني أو الاضطرابات أو مخالفة الأوامر الملكية والسامية.
- المحتوى المتضمن تعليم صنع الأسلحة أو المتفجرات ويقلل من مخاطرها.
- التشكيك بجهود المملكة في خدمة الإسلام والمواقع المقدسة.
- الإساءة لرجال أو سيدات الأمن كافة بصفة التعميم أو التشكيك بهم كافة.

1.4 المحتوى الوثائقي الذي لم يعتمد على المصادر التاريخية الموثقة والمعتمدة في المملكة، خاصة عند تناول تاريخ الدولة السعودية أو الشخصيات التاريخية الإسلامية.

1.5 الإساءة إلى المملكة العربية السعودية في سياق جمعي أو التعميم على المجتمع أو فئة كبيرة منه، بما في ذلك:
- إظهار شخصية سعودية في محتوى غير محلي بشكل مسيء دون سبب مبرر.
- ذكر أسماء القبائل أو العوائل مباشرة في سياق سلبي تعميمي.
- إظهار عناصر تراثية أو ثقافية غير سعودية وتصويرها كثقافة وتراث سعودي أصيل.
- الدعوة للتفكك الأسري والطلاق وقطع صلة الرحم بشكل مباشر.

1.6 المحتوى الموجه للأطفال المتعلق بمواضيع الجرائم والأمن، بما في ذلك:
- تناول الجرائم الموجهة للتوقيف كالسطو والقتل والخطف.
- تناول المؤثرات العقلية في سياق إيجابي يدعو لها.
- تجميل صورة التنظيمات العصابية أو السياسية في سياق إيجابي يروج لها أو يدعو للانضمام إليها.

2. المجتمع والأخلاق

2.1 المحتوى المتضمن تعليم آلية صناعة المخدرات أو المسكرات بكافة أشكالها، بشكل مباشر أو غير مباشر.

2.2 المحتوى المخالف لنظام حماية الطفل، بما في ذلك الدعوة للعنف أو التحرش أو تقييد الحرية أو الإيذاء أو الإهمال للطفل أو ذوي الإعاقة، أو تجميل ذلك أو التهوين منه، وكذلك السخرية من الإعاقة.

2.3 الدعوة للشذوذ الجنسي أو المثلية الجنسية في المحتوى الموجه للعامة وغير الراشدين، أو تقديم ما يشير إليهما بشكل إيجابي يدعو أو يجمل ذلك صراحة أو تلميحًا.

2.4 إظهار مشاهد الممارسات الجنسية الصريحة بشكل مباشر أو غير مباشر قولًا أو فعلًا أو كتابة.

2.5 الألفاظ النابية بكافة لغاتها، بشكل مباشر أو غير مباشر قولًا أو فعلًا أو كتابة.`,
    en: `1. General Prohibited Content for Films and Series

1.1 Any offense to the established fundamentals of Islamic Sharia as stated in the Holy Quran and mutawatir Prophetic hadith.

1.2 Any offense to the Saudi state, the Kings of Saudi Arabia, or the Crown Prince, whether by words, actions, or encouraging context, explicitly or implicitly.

1.3 Content that harms national security or encourages/promotes such harm, including:
- Calls for civil disobedience, unrest, or disobeying royal directives.
- Instructional content for manufacturing weapons or explosives while downplaying risks.
- Undermining Saudi efforts in serving Islam and holy sites.
- Generalized abuse of all security men/women or casting collective doubt on them.

1.4 Documentary content that is not based on reliable and officially accepted historical sources in Saudi Arabia, especially regarding Saudi history or Islamic historical figures.

1.5 Content that insults Saudi Arabia collectively, or broadly generalizes against society or a large segment, including:
- Offensive portrayal of a Saudi character in non-local content without justified realism.
- Naming tribes/families directly in generalized negative framing.
- Presenting non-Saudi cultural elements as authentic Saudi heritage.
- Direct calls for family disintegration, divorce, or severing kinship ties.

1.6 Children-oriented content involving crime/security topics, including:
- Crime themes such as robbery, murder, and kidnapping in harmful framing.
- Positive framing that encourages psychoactive substance use.
- Positive glamorization of gang/political organizations or calls to join them.

2. Society and Ethics

2.1 Content that teaches how to produce drugs or intoxicants in any form, directly or indirectly.

2.2 Content violating child protection principles, including promoting violence, harassment, restriction of freedom, harm, or neglect toward children or persons with disabilities, or normalizing/mockingly portraying such harm.

2.3 Advocacy or positive promotion of homosexuality in content directed to the general public and non-adults, whether explicit or implied.

2.4 Explicit sexual practice scenes, direct or indirect, in speech, action, or writing.

2.5 Profanity in all languages, direct or indirect, in speech, action, or writing.`,
  };
  const { data } = await supabase.from("app_settings").select("value").eq("key", "client_regulations").maybeSingle();
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
  if (script === "draft") return "draft";
  if (script === "approved") return "approved";
  if (script === "rejected") return "rejected";
  return "in_review";
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
  if (method === "GET" && rest === "regulations") {
    return json(await loadClientRegulations(supabase));
  }

  // POST /client-portal/register/send-otp
  if (method === "POST" && rest === "register/send-otp") {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const rawType = typeof body.beneficiaryType === "string" ? body.beneficiaryType.trim().toLowerCase() : "company";
    const beneficiaryType = rawType === "individual" ? "individual" : "company";
    if (!email || !isValidEmail(email)) return json({ error: "Valid email is required" }, 400);

    const { data: recentOtp } = await supabase
      .from("registration_email_otps")
      .select("id, created_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentOtp?.created_at) {
      const createdAt = Date.parse(recentOtp.created_at);
      if (Number.isFinite(createdAt)) {
        const diffSeconds = Math.floor((Date.now() - createdAt) / 1000);
        if (diffSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
          return json({
            error: "Please wait before requesting a new code",
            retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS - diffSeconds,
          }, 429);
        }
      }
    }

    const { data: usersList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailTaken = (usersList?.users ?? []).some((u) => (u.email ?? "").toLowerCase() === email);
    if (emailTaken) return json({ error: "Email already registered" }, 409);

    const otpCode = generateOtpCode();
    const otpHash = await sha256Hex(`${email}:${otpCode}`);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

    const { error: insertErr } = await supabase.from("registration_email_otps").insert({
      email,
      beneficiary_type: beneficiaryType,
      otp_hash: otpHash,
      expires_at: expiresAt,
    });
    if (insertErr) return json({ error: insertErr.message }, 500);

    const subject = "Raawi Registration OTP";
    const html = buildBilingualClientEmail({
      titleEn: "Verify your email",
      titleAr: "تأكيد البريد الإلكتروني",
      bodyEn: `Your verification code is: ${otpCode}\nThis code expires in ${OTP_TTL_MINUTES} minutes.`,
      bodyAr: `رمز التحقق الخاص بك هو: ${otpCode}\nتنتهي صلاحية الرمز خلال ${OTP_TTL_MINUTES} دقائق.`,
    });
    await sendClientEmail({ to: email, subject, html });

    return json({ ok: true, expiresInSeconds: OTP_TTL_MINUTES * 60, resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS });
  }

  // POST /client-portal/register/verify-otp
  if (method === "POST" && rest === "register/verify-otp") {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";
    if (!email || !isValidEmail(email)) return json({ error: "Valid email is required" }, 400);
    if (!/^\d{6}$/.test(otp)) return json({ error: "OTP must be 6 digits" }, 400);

    const { data: otpRow } = await supabase
      .from("registration_email_otps")
      .select("id, otp_hash, attempts, max_attempts, expires_at, consumed_at")
      .eq("email", email)
      .is("verified_at", null)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!otpRow?.id) return json({ error: "No OTP request found for this email" }, 404);
    if (otpRow.consumed_at) return json({ error: "OTP already used" }, 409);
    if (new Date(otpRow.expires_at).getTime() < Date.now()) return json({ error: "OTP expired" }, 410);
    if ((otpRow.attempts ?? 0) >= (otpRow.max_attempts ?? 5)) return json({ error: "Too many attempts" }, 429);

    const otpHash = await sha256Hex(`${email}:${otp}`);
    if (otpHash !== otpRow.otp_hash) {
      await supabase
        .from("registration_email_otps")
        .update({ attempts: (otpRow.attempts ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", otpRow.id);
      return json({ error: "Invalid OTP" }, 400);
    }

    const verificationToken = generateVerificationToken();
    const verificationTokenHash = await sha256Hex(verificationToken);
    const tokenExpiresAt = new Date(Date.now() + OTP_VERIFICATION_TOKEN_TTL_MINUTES * 60_000).toISOString();
    const nowIso = new Date().toISOString();
    const { error: verifyErr } = await supabase
      .from("registration_email_otps")
      .update({
        verified_at: nowIso,
        verification_token_hash: verificationTokenHash,
        verification_token_expires_at: tokenExpiresAt,
        updated_at: nowIso,
      })
      .eq("id", otpRow.id);
    if (verifyErr) return json({ error: verifyErr.message }, 500);

    return json({ ok: true, verificationToken, verificationTokenExpiresAt: tokenExpiresAt });
  }

  // POST /client-portal/register (public, free registration)
  if (method === "POST" && rest === "register") {
    const contentType = req.headers.get("content-type") ?? "";
    let body: Record<string, unknown> = {};
    let companyLogoFile: File | null = null;
    const legalFiles: Array<{ key: string; type: string; file: File }> = [];
    let individualCvFile: File | null = null;
    let individualIdDocumentFile: File | null = null;

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
        companyEmail: formData.get("companyEmail"),
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
        acceptedRegulations: formData.get("acceptedRegulations"),
        beneficiaryType: formData.get("beneficiaryType"),
        individualFullName: formData.get("individualFullName"),
        individualDateOfBirth: formData.get("individualDateOfBirth"),
        individualNationality: formData.get("individualNationality"),
        individualNationalIdOrIqama: formData.get("individualNationalIdOrIqama"),
        individualMobile: formData.get("individualMobile"),
      };
      const logoCandidate = formData.get("companyLogoFile") ?? formData.get("companyLogo") ?? formData.get("logo");
      if (logoCandidate instanceof File && logoCandidate.size > 0) {
        companyLogoFile = logoCandidate;
      }
      for (const item of [
        { key: "crDocument", type: "cr" },
        { key: "licenseDocument", type: "license" },
        { key: "nationalAddressDocument", type: "national_address" },
        { key: "mediaContentProductionLicenseDocument", type: "media_content_production_license" },
      ]) {
        const candidate = formData.get(item.key);
        if (candidate instanceof File && candidate.size > 0) {
          legalFiles.push({ ...item, file: candidate });
        }
      }
      const cvCandidate = formData.get("individualCvFile");
      if (cvCandidate instanceof File && cvCandidate.size > 0) individualCvFile = cvCandidate;
      const idCandidate = formData.get("individualIdDocumentFile");
      if (idCandidate instanceof File && idCandidate.size > 0) individualIdDocumentFile = idCandidate;
    } else {
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const companyEmail = typeof body.companyEmail === "string" ? body.companyEmail.trim().toLowerCase() : "";
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
    const acceptedRegulations = body.acceptedRegulations === true || body.acceptedRegulations === "true";
    const otpVerificationToken = typeof body.otpVerificationToken === "string" ? body.otpVerificationToken.trim() : "";
    const beneficiaryTypeRaw = typeof body.beneficiaryType === "string" ? body.beneficiaryType.trim().toLowerCase() : "";
    const individualSignals =
      Boolean(field(body, "individualFullName")) ||
      Boolean(field(body, "individualDateOfBirth")) ||
      Boolean(field(body, "individualNationality")) ||
      Boolean(field(body, "individualNationalIdOrIqama")) ||
      Boolean(field(body, "individualMobile")) ||
      Boolean(individualCvFile) ||
      Boolean(individualIdDocumentFile);
    const beneficiaryType = beneficiaryTypeRaw === "individual" || (beneficiaryTypeRaw === "" && individualSignals)
      ? "individual"
      : "company";
    const individualFullName = field(body, "individualFullName");
    const individualDateOfBirth = field(body, "individualDateOfBirth");
    const individualNationality = field(body, "individualNationality");
    const individualNationalIdOrIqama = field(body, "individualNationalIdOrIqama");
    const individualMobile = normalizePhone(body.individualMobile);
    const isSaudiIndividual = (individualNationality ?? "").toLowerCase() === "saudi arabia";
    const effectiveCompanyEmail = companyEmail || email;

    if (!email || !isValidEmail(email)) return json({ error: "Valid email is required" }, 400);
    if (!otpVerificationToken) return json({ error: "Email verification is required before registration" }, 400);
    if (beneficiaryType === "company" && (!effectiveCompanyEmail || !isValidEmail(effectiveCompanyEmail))) return json({ error: "Valid company email is required" }, 400);
    if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
    if (!name) return json({ error: "Name is required" }, 400);
    if (!companyNameAr || !companyNameEn) return json({ error: "companyNameAr and companyNameEn are required" }, 400);
    if (beneficiaryType === "company" && !mobile) return json({ error: "Company phone/mobile is required" }, 400);
    if (contactEmail && !isValidEmail(contactEmail)) return json({ error: "Valid contact email is required" }, 400);
    if (!acceptedTerms) return json({ error: "Terms must be accepted" }, 400);
    if (!acceptedRegulations) return json({ error: "Regulations must be accepted" }, 400);

    const tokenHash = await sha256Hex(otpVerificationToken);
    const { data: verifiedOtp } = await supabase
      .from("registration_email_otps")
      .select("id, email, verification_token_expires_at, consumed_at")
      .eq("email", email)
      .eq("verification_token_hash", tokenHash)
      .not("verified_at", "is", null)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!verifiedOtp?.id) return json({ error: "Invalid or missing email verification token" }, 401);
    if (verifiedOtp.consumed_at) return json({ error: "Verification token already used" }, 409);
    if (!verifiedOtp.verification_token_expires_at || new Date(verifiedOtp.verification_token_expires_at).getTime() < Date.now()) {
      return json({ error: "Email verification token expired" }, 410);
    }
    if (beneficiaryType === "company") {
      const hasRequiredDocs = ["cr", "license", "national_address"].every((requiredType) =>
        legalFiles.some((doc) => doc.type === requiredType)
      );
      if (!hasRequiredDocs) return json({ error: "CR, license, and national address documents are required" }, 400);
    } else {
      if (!individualFullName || !individualDateOfBirth || !individualNationality || !individualNationalIdOrIqama || !individualMobile) {
        return json({ error: "Individual profile fields are required" }, 400);
      }
      if (isSaudiIndividual && !/^1\d{9}$/.test(individualNationalIdOrIqama)) return json({ error: "Saudi National ID must be 10 digits and start with 1" }, 400);
      if (!isSaudiIndividual && !/^2\d{9}$/.test(individualNationalIdOrIqama)) return json({ error: "Iqama must be 10 digits and start with 2" }, 400);
      if (!individualCvFile || !PDF_MIMES.has(individualCvFile.type)) return json({ error: "CV PDF is required" }, 400);
      if (!individualIdDocumentFile || !DOC_MIMES.has(individualIdDocumentFile.type)) return json({ error: "National ID / Iqama document is required" }, 400);
    }
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
          mobile: beneficiaryType === "individual" ? individualMobile : mobile,
          phone,
          email: beneficiaryType === "individual" ? email : effectiveCompanyEmail,
          website,
          address_line1: addressLine1,
          address_line2: addressLine2,
          city: beneficiaryType === "individual" ? null : city,
          postal_code: postalCode,
          country: "Saudi Arabia",
          contact_email: contactEmail ?? email,
          contact_mobile: beneficiaryType === "individual" ? individualMobile : contactMobile,
          about,
          years_of_experience: Number.isFinite(yearsOfExperience) ? yearsOfExperience : null,
          source: "portal",
          beneficiary_type: beneficiaryType,
          individual_full_name: beneficiaryType === "individual" ? individualFullName : null,
          individual_date_of_birth: beneficiaryType === "individual" ? individualDateOfBirth : null,
          individual_nationality: beneficiaryType === "individual" ? individualNationality : null,
          individual_national_id_or_iqama: beneficiaryType === "individual" ? individualNationalIdOrIqama : null,
          approval_status: "pending",
          terms_accepted_at: new Date().toISOString(),
          regulations_accepted_at: new Date().toISOString(),
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
      if (beneficiaryType === "individual" && individualCvFile && individualIdDocumentFile) {
        for (const doc of [
          { type: "cv", file: individualCvFile },
          { type: "national_id_or_iqama", file: individualIdDocumentFile },
        ]) {
          const rawExt = doc.file.name.split(".").pop()?.toLowerCase();
          const ext = rawExt && /^[a-z0-9]+$/.test(rawExt) ? rawExt : (doc.file.type === "application/pdf" ? "pdf" : "bin");
          const objectName = `${company.id}/${doc.type}-${crypto.randomUUID()}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from(LEGAL_DOC_BUCKET)
            .upload(objectName, doc.file, { contentType: doc.file.type, upsert: true });
          if (uploadErr) throw new Error(uploadErr.message || "Failed to upload legal document");
          legalDocuments.push({ type: doc.type, name: doc.file.name, path: `${LEGAL_DOC_BUCKET}/${objectName}`, size: doc.file.size, mimeType: doc.file.type });
        }
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
          logoUrl: `${(Deno.env.get("APP_PUBLIC_URL") ?? "https://raawifilm.com").replace(/\/$/, "")}/fclogo.png`,
        }),
      });

      await notifyAdmins(supabase, {
        type: "client_registration_arrived",
        title: `New client registration: ${companyNameEn}`,
        body: `A new registration request was submitted by ${companyNameAr} (${email}).`,
        metadata: {
          company_id: company.id,
          company_name_ar: companyNameAr,
          company_name_en: companyNameEn,
          requester_email: email,
          requester_name: name,
        },
      });

      await supabase
        .from("registration_email_otps")
        .update({ consumed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", verifiedOtp.id);

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
  if (method === "PUT" && rest === "admin/regulations") {
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    let body: { ar?: string; en?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const ar = (body.ar ?? "").trim();
    const en = (body.en ?? "").trim();
    if (!ar || !en) return json({ error: "Arabic and English regulations are required" }, 400);
    const value = { ar, en };
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "client_regulations", value, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "key" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, regulations: value });
  }

  // GET /client-portal/me
  if (method === "GET" && rest === "me") {
    if (!account) return json({ error: "Beneficiary portal account not found" }, 403);
    if (account.subscription_status !== "active") return json({ error: "Beneficiary portal account is not active" }, 403);
    const [{ data: userResult }, { data: company }] = await Promise.all([
      supabase.auth.admin.getUserById(userId),
      supabase
        .from("clients")
        .select("id, beneficiary_type, name_ar, name_en, representative_name, representative_title, email, mobile, website, phone, city, country, contact_email, contact_mobile, about, years_of_experience, individual_full_name, individual_date_of_birth, individual_nationality, individual_national_id_or_iqama, created_at")
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
            beneficiaryType: (company as any).beneficiary_type ?? "company",
            nameAr: (company as any).name_ar,
            nameEn: (company as any).name_en,
            representativeName: (company as any).representative_name,
            representativeTitle: (company as any).representative_title,
            email: (company as any).email,
            mobile: (company as any).mobile,
            website: (company as any).website,
            phone: (company as any).phone,
            city: (company as any).city,
            country: (company as any).country,
            contactEmail: (company as any).contact_email,
            contactMobile: (company as any).contact_mobile,
            about: (company as any).about,
            yearsOfExperience: (company as any).years_of_experience,
            createdAt: (company as any).created_at,
            individualProfile: {
              fullName: (company as any).individual_full_name ?? null,
              dateOfBirth: (company as any).individual_date_of_birth ?? null,
              nationality: (company as any).individual_nationality ?? null,
              nationalIdOrIqama: (company as any).individual_national_id_or_iqama ?? null,
              city: (company as any).city ?? null,
              mobile: (company as any).mobile ?? null,
            },
          }
        : null,
    });
  }

  if (method === "PUT" && rest === "me") {
    if (!account) return json({ error: "Beneficiary portal account not found" }, 403);
    if (account.subscription_status !== "active") return json({ error: "Beneficiary portal account is not active" }, 403);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const text = (value: unknown, max = 400): string | null => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      return trimmed.slice(0, max);
    };

    const yearsRaw = body.yearsOfExperience;
    const years =
      typeof yearsRaw === "number"
        ? yearsRaw
        : typeof yearsRaw === "string" && yearsRaw.trim()
          ? Number.parseInt(yearsRaw.trim(), 10)
          : null;
    const normalizedYears = Number.isFinite(years as number) ? Math.max(0, Math.min(200, Number(years))) : null;

    const companyUpdates: Record<string, unknown> = {
      name_ar: text(body.companyNameAr, 200),
      name_en: text(body.companyNameEn, 200),
      representative_name: text(body.representativeName, 200),
      representative_title: text(body.representativeTitle, 200),
      email: text(body.companyEmail, 320),
      mobile: text(body.companyMobile, 64),
      website: text(body.website, 320),
      phone: text(body.phone, 64),
      city: text(body.city, 120),
      country: text(body.country, 120),
      contact_mobile: text(body.contactMobile, 64),
      about: text(body.about, 4000),
      years_of_experience: normalizedYears,
      individual_full_name: text((body.individualProfile as Record<string, unknown> | undefined)?.fullName, 200),
      individual_date_of_birth: text((body.individualProfile as Record<string, unknown> | undefined)?.dateOfBirth, 64),
      individual_nationality: text((body.individualProfile as Record<string, unknown> | undefined)?.nationality, 120),
      individual_national_id_or_iqama: text((body.individualProfile as Record<string, unknown> | undefined)?.nationalIdOrIqama, 64),
    };

    const { error: updateErr } = await supabase
      .from("clients")
      .update(companyUpdates)
      .eq("id", account.company_id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    const userName = text(body.userName, 200);
    if (userName) {
      await supabase.auth.admin.updateUserById(userId, { user_metadata: { name: userName } }).catch(() => {});
      await supabase.from("profiles").update({ name: userName }).eq("user_id", userId).catch(() => {});
    }

    const [{ data: userResult }, { data: company }] = await Promise.all([
      supabase.auth.admin.getUserById(userId),
      supabase
        .from("clients")
        .select("id, beneficiary_type, name_ar, name_en, representative_name, representative_title, email, mobile, website, phone, city, country, contact_email, contact_mobile, about, years_of_experience, individual_full_name, individual_date_of_birth, individual_nationality, individual_national_id_or_iqama, created_at")
        .eq("id", account.company_id)
        .maybeSingle(),
    ]);

    const appUser = userResult.user;
    return json({
      ok: true,
      profile: {
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
              beneficiaryType: (company as any).beneficiary_type ?? "company",
              nameAr: (company as any).name_ar,
              nameEn: (company as any).name_en,
              representativeName: (company as any).representative_name,
              representativeTitle: (company as any).representative_title,
              email: (company as any).email,
              mobile: (company as any).mobile,
              website: (company as any).website,
              phone: (company as any).phone,
              city: (company as any).city,
              country: (company as any).country,
              contactEmail: (company as any).contact_email,
              contactMobile: (company as any).contact_mobile,
              about: (company as any).about,
              yearsOfExperience: (company as any).years_of_experience,
              createdAt: (company as any).created_at,
              individualProfile: {
                fullName: (company as any).individual_full_name ?? null,
                dateOfBirth: (company as any).individual_date_of_birth ?? null,
                nationality: (company as any).individual_nationality ?? null,
                nationalIdOrIqama: (company as any).individual_national_id_or_iqama ?? null,
                city: (company as any).city ?? null,
                mobile: (company as any).mobile ?? null,
              },
            }
          : null,
      },
    });
  }

  // GET /client-portal/submissions
  if (method === "GET" && rest === "submissions") {
    if (!account) return json({ error: "Beneficiary portal account not found" }, 403);
    const { data: scripts, error: scriptsErr } = await supabase
      .from("scripts")
      .select("id, title, type, status, created_at, expected_rank, received_at, current_version_id, company_id, client_id, work_classification, synopsis, story_summary, script_summary_pdf_url, has_security_scenes, security_content_attachment_url, file_url")
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
        expectedRank: row.expected_rank ?? null,
        receivedAt: row.received_at,
        currentVersionId: row.current_version_id,
        workClassification: row.work_classification ?? null,
        synopsis: row.synopsis ?? null,
        storySummary: row.story_summary ?? null,
        scriptSummaryPdfUrl: row.script_summary_pdf_url ?? null,
        hasSecurityScenes: row.has_security_scenes === true,
        securityContentAttachmentUrl: row.security_content_attachment_url ?? null,
        fileUrl: row.file_url ?? null,
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
      .select("id, title, type, status, created_at, expected_rank, received_at, current_version_id, created_by, assignee_id, company_id, client_id, synopsis")
      .eq("is_quick_analysis", false)
      .order("created_at", { ascending: false })
      .limit(500);
    if (scriptErr) return json({ error: scriptErr.message }, 500);

    const submissions = (scriptRows ?? []).filter((row: any) => {
      const scriptCompanyId = (row.company_id ?? row.client_id ?? "").toString();
      const status = String(row.status ?? "").toLowerCase();
      if (status === "draft") return false;
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
        expectedRank: row.expected_rank ?? null,
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

  // GET /client-portal/scripts/:scriptId/revision-cycles
  const cyclesMatch = rest.match(/^scripts\/([^/]+)\/revision-cycles$/);
  if (method === "GET" && cyclesMatch) {
    if (!account) return json({ error: "Beneficiary portal account not found" }, 403);
    const scriptId = cyclesMatch[1].trim();
    if (!scriptId) return json({ error: "scriptId is required" }, 400);

    const { data: scriptRow } = await supabase
      .from("scripts")
      .select("id, title, status, company_id, client_id, file_url")
      .eq("id", scriptId)
      .maybeSingle();
    if (!scriptRow) return json({ error: "Script not found" }, 404);
    const scriptCompanyId = ((scriptRow as any).company_id ?? (scriptRow as any).client_id ?? "").toString();
    if (scriptCompanyId !== account.company_id) return json({ error: "Forbidden" }, 403);

    const { data: cycles, error: cyclesErr } = await supabase
      .from("script_revision_cycles")
      .select("id, cycle_number, source_report_id, source_job_id, sent_by, sent_at, returned_at, status, admin_note, beneficiary_returned_version_id, reanalyzed_report_id, created_at, updated_at")
      .eq("script_id", scriptId)
      .order("cycle_number", { ascending: false });
    if (cyclesErr) return json({ error: cyclesErr.message }, 500);

    const cycleIds = (cycles ?? []).map((row: any) => row.id);
    const [{ data: events }, { data: snapshots }, { data: profiles }, { data: comparisons }] = await Promise.all([
      cycleIds.length > 0
        ? supabase
            .from("script_revision_cycle_events")
            .select("id, cycle_id, script_id, event_type, actor_user_id, payload, created_at")
            .in("cycle_id", cycleIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      cycleIds.length > 0
        ? supabase
            .from("script_revision_cycle_snapshots")
            .select("id, cycle_id, findings_total, findings_approved, findings_violation, severity_counts, type_counts, created_at")
            .in("cycle_id", cycleIds)
        : Promise.resolve({ data: [] as any[] }),
      (() => {
        const ids = [...new Set((cycles ?? []).map((row: any) => row.sent_by).filter(Boolean))];
        return ids.length > 0
          ? supabase.from("profiles").select("user_id, name").in("user_id", ids)
          : Promise.resolve({ data: [] as any[] });
      })(),
      cycleIds.length > 0
        ? supabase
            .from("script_revision_cycle_comparisons")
            .select("id, cycle_id, old_report_id, new_report_id, comparison_summary, created_at")
            .in("cycle_id", cycleIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const eventsByCycle = new Map<string, any[]>();
    for (const row of events ?? []) {
      const bucket = eventsByCycle.get(row.cycle_id) ?? [];
      bucket.push(row);
      eventsByCycle.set(row.cycle_id, bucket);
    }
    const snapshotsByCycle = new Map<string, any[]>();
    for (const row of snapshots ?? []) {
      const bucket = snapshotsByCycle.get(row.cycle_id) ?? [];
      bucket.push(row);
      snapshotsByCycle.set(row.cycle_id, bucket);
    }
    const profileNameById = new Map((profiles ?? []).map((row: any) => [row.user_id, row.name ?? null]));
    const comparisonByCycle = new Map<string, any>();
    for (const row of comparisons ?? []) {
      if (!comparisonByCycle.has(row.cycle_id)) comparisonByCycle.set(row.cycle_id, row);
    }

    const sharedReportIdsByCycle = new Map<string, string[]>();
    const sharedReportFormatsByCycle = new Map<string, Array<"pdf" | "docx">>();
    for (const [cycleId, cycleEvents] of eventsByCycle.entries()) {
      const ids = new Set<string>();
      let formats: Array<"pdf" | "docx"> = ["pdf", "docx"];
      for (const event of cycleEvents) {
        const payload = (event?.payload ?? {}) as Record<string, unknown>;
        const sharedIds = Array.isArray(payload.shared_report_ids)
          ? payload.shared_report_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
          : [];
        for (const rid of sharedIds) ids.add(rid.trim());
        if (typeof payload.source_report_id === "string" && payload.source_report_id.trim()) ids.add(payload.source_report_id.trim());
        const normalizedFormats = normalizeShareReportFormats(payload.shared_report_formats);
        if (normalizedFormats.length > 0) formats = normalizedFormats;
      }
      sharedReportIdsByCycle.set(cycleId, [...ids]);
      sharedReportFormatsByCycle.set(cycleId, formats);
    }

    const reportIds = new Set<string>();
    for (const cycle of cycles ?? []) {
      if (typeof cycle.source_report_id === "string" && cycle.source_report_id.trim()) reportIds.add(cycle.source_report_id.trim());
      if (typeof cycle.reanalyzed_report_id === "string" && cycle.reanalyzed_report_id.trim()) reportIds.add(cycle.reanalyzed_report_id.trim());
      for (const rid of sharedReportIdsByCycle.get(cycle.id) ?? []) reportIds.add(rid);
    }
    for (const comparison of comparisons ?? []) {
      if (typeof comparison.old_report_id === "string" && comparison.old_report_id.trim()) reportIds.add(comparison.old_report_id.trim());
      if (typeof comparison.new_report_id === "string" && comparison.new_report_id.trim()) reportIds.add(comparison.new_report_id.trim());
    }

    const { data: reportRows } = reportIds.size > 0
      ? await supabase
          .from("analysis_reports")
          .select("id, job_id, review_status, review_notes, findings_count, severity_counts, created_at")
          .in("id", [...reportIds])
      : { data: [] as any[] };
    const reportById = new Map((reportRows ?? []).map((row: any) => [row.id, row]));

    return json({
      script: {
        id: (scriptRow as any).id,
        title: (scriptRow as any).title,
        status: (scriptRow as any).status,
        fileUrl: (scriptRow as any).file_url ?? null,
      },
      cycles: (cycles ?? []).map((cycle: any) => ({
        id: cycle.id,
        cycleNumber: cycle.cycle_number,
        sourceReportId: cycle.source_report_id ?? null,
        sourceJobId: cycle.source_job_id ?? null,
        sentBy: cycle.sent_by,
        sentByName: profileNameById.get(cycle.sent_by) ?? null,
        sentAt: cycle.sent_at,
        returnedAt: cycle.returned_at ?? null,
        status: cycle.status,
        adminNote: cycle.admin_note ?? null,
        beneficiaryReturnedVersionId: cycle.beneficiary_returned_version_id ?? null,
        createdAt: cycle.created_at,
        updatedAt: cycle.updated_at,
        snapshots: (snapshotsByCycle.get(cycle.id) ?? []).map((snapshot: any) => ({
          id: snapshot.id,
          findingsTotal: snapshot.findings_total ?? 0,
          findingsApproved: snapshot.findings_approved ?? 0,
          findingsViolation: snapshot.findings_violation ?? 0,
          severityCounts: snapshot.severity_counts ?? {},
          typeCounts: snapshot.type_counts ?? {},
          createdAt: snapshot.created_at,
        })),
        events: (eventsByCycle.get(cycle.id) ?? []).map((event: any) => ({
          id: event.id,
          eventType: event.event_type,
          actorUserId: event.actor_user_id ?? null,
          payload: event.payload ?? {},
          createdAt: event.created_at,
        })),
        sharedReports: (sharedReportIdsByCycle.get(cycle.id) ?? [])
          .map((reportId) => {
            const report = reportById.get(reportId);
            if (!report) return null;
            return {
              id: report.id,
              jobId: report.job_id,
              reviewStatus: report.review_status ?? "under_review",
              reviewNotes: report.review_notes ?? null,
              findingsCount: Number(report.findings_count ?? 0) || 0,
              severityCounts: report.severity_counts ?? {},
              createdAt: report.created_at,
              sharedFormats: sharedReportFormatsByCycle.get(cycle.id) ?? ["pdf", "docx"],
            };
          })
          .filter(Boolean),
        sourceReport: cycle.source_report_id && reportById.get(cycle.source_report_id)
          ? (() => {
              const report = reportById.get(cycle.source_report_id);
              return {
                id: report.id,
                jobId: report.job_id,
                reviewStatus: report.review_status ?? "under_review",
                reviewNotes: report.review_notes ?? null,
                findingsCount: Number(report.findings_count ?? 0) || 0,
                severityCounts: report.severity_counts ?? {},
                createdAt: report.created_at,
              };
            })()
          : null,
        reanalyzedReport: cycle.reanalyzed_report_id && reportById.get(cycle.reanalyzed_report_id)
          ? (() => {
              const report = reportById.get(cycle.reanalyzed_report_id);
              return {
                id: report.id,
                jobId: report.job_id,
                reviewStatus: report.review_status ?? "under_review",
                reviewNotes: report.review_notes ?? null,
                findingsCount: Number(report.findings_count ?? 0) || 0,
                severityCounts: report.severity_counts ?? {},
                createdAt: report.created_at,
              };
            })()
          : null,
        comparisonSummary: comparisonByCycle.get(cycle.id)?.comparison_summary ?? null,
      })),
    });
  }

  // GET /client-portal/scripts/:scriptId/revision-cycles/:cycleId/reports/:reportId
  const cycleReportMatch = rest.match(/^scripts\/([^/]+)\/revision-cycles\/([^/]+)\/reports\/([^/]+)$/);
  if (method === "GET" && cycleReportMatch) {
    if (!account) return json({ error: "Beneficiary portal account not found" }, 403);
    const scriptId = cycleReportMatch[1].trim();
    const cycleId = cycleReportMatch[2].trim();
    const reportId = cycleReportMatch[3].trim();
    if (!scriptId || !cycleId || !reportId) return json({ error: "scriptId, cycleId and reportId are required" }, 400);

    const { data: scriptRow } = await supabase
      .from("scripts")
      .select("id, company_id, client_id, title, status")
      .eq("id", scriptId)
      .maybeSingle();
    if (!scriptRow) return json({ error: "Script not found" }, 404);
    const scriptCompanyId = ((scriptRow as any).company_id ?? (scriptRow as any).client_id ?? "").toString();
    if (scriptCompanyId !== account.company_id) return json({ error: "Forbidden" }, 403);

    const { data: cycleRow } = await supabase
      .from("script_revision_cycles")
      .select("id, script_id, cycle_number")
      .eq("id", cycleId)
      .eq("script_id", scriptId)
      .maybeSingle();
    if (!cycleRow) return json({ error: "Revision cycle not found" }, 404);

    const { data: cycleEvents } = await supabase
      .from("script_revision_cycle_events")
      .select("payload")
      .eq("cycle_id", cycleId)
      .order("created_at", { ascending: true });
    const allowedReportIds = new Set<string>();
    for (const row of cycleEvents ?? []) {
      const payload = ((row as any)?.payload ?? {}) as Record<string, unknown>;
      const sharedIds = Array.isArray(payload.shared_report_ids)
        ? payload.shared_report_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      for (const rid of sharedIds) allowedReportIds.add(rid.trim());
      if (typeof payload.source_report_id === "string" && payload.source_report_id.trim()) {
        allowedReportIds.add(payload.source_report_id.trim());
      }
    }
    if (!allowedReportIds.has(reportId)) return json({ error: "Report is not shared in this revision cycle" }, 403);

    const { data: reportRow } = await supabase
      .from("analysis_reports")
      .select("id, job_id, review_status, review_notes, findings_count, severity_counts, summary_json, created_at")
      .eq("id", reportId)
      .eq("script_id", scriptId)
      .maybeSingle();
    if (!reportRow) return json({ error: "Report not found" }, 404);

    const payload = await loadReportPayload(supabase, reportRow);
    return json({
      script: {
        id: (scriptRow as any).id,
        title: (scriptRow as any).title,
        status: (scriptRow as any).status,
      },
      cycle: {
        id: (cycleRow as any).id,
        cycleNumber: (cycleRow as any).cycle_number,
      },
      report: payload.report,
      findings: payload.findings,
    });
  }

  // POST /client-portal/scripts/:scriptId/revision-cycles/:cycleId/resubmit
  const cycleResubmitMatch = rest.match(/^scripts\/([^/]+)\/revision-cycles\/([^/]+)\/resubmit$/);
  if (method === "POST" && cycleResubmitMatch) {
    if (!account) return json({ error: "Beneficiary portal account not found" }, 403);
    const scriptId = cycleResubmitMatch[1].trim();
    const cycleId = cycleResubmitMatch[2].trim();
    if (!scriptId || !cycleId) return json({ error: "scriptId and cycleId are required" }, 400);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const revisedFileUrl = typeof body.revisedFileUrl === "string" ? body.revisedFileUrl.trim() : "";
    const revisedFileName = typeof body.revisedFileName === "string" ? body.revisedFileName.trim().normalize("NFC") : null;
    const revisedFileType = typeof body.revisedFileType === "string" ? body.revisedFileType.trim() : null;
    const revisedFileSize = typeof body.revisedFileSize === "number" && Number.isFinite(body.revisedFileSize) ? Number(body.revisedFileSize) : null;
    const beneficiaryComment = typeof body.beneficiaryComment === "string" ? body.beneficiaryComment.trim() : "";
    if (!revisedFileUrl) return json({ error: "revisedFileUrl is required" }, 400);

    const { data: scriptRow } = await supabase
      .from("scripts")
      .select("id, title, status, company_id, client_id, file_url")
      .eq("id", scriptId)
      .maybeSingle();
    if (!scriptRow) return json({ error: "Script not found" }, 404);
    const scriptCompanyId = ((scriptRow as any).company_id ?? (scriptRow as any).client_id ?? "").toString();
    if (scriptCompanyId !== account.company_id) return json({ error: "Forbidden" }, 403);

    const { data: cycleRow, error: cycleErr } = await supabase
      .from("script_revision_cycles")
      .select("id, script_id, cycle_number, status")
      .eq("id", cycleId)
      .eq("script_id", scriptId)
      .maybeSingle();
    if (cycleErr) return json({ error: cycleErr.message }, 500);
    if (!cycleRow) return json({ error: "Revision cycle not found" }, 404);
    if ((cycleRow as any).status !== "sent") {
      return json({ error: "This revision cycle was already submitted or is no longer active." }, 409);
    }

    const nowIso = new Date().toISOString();
    const { data: maxVersion } = await supabase
      .from("script_versions")
      .select("version_number")
      .eq("script_id", scriptId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersionNumber = Number((maxVersion as any)?.version_number ?? 0) + 1;

    const { data: newVersion, error: versionErr } = await supabase
      .from("script_versions")
      .insert({
        script_id: scriptId,
        version_number: nextVersionNumber,
        source_file_name: revisedFileName,
        source_file_type: revisedFileType,
        source_file_size: revisedFileSize,
        source_file_path: revisedFileUrl,
        source_file_url: revisedFileUrl,
        extraction_status: "pending",
      })
      .select("id")
      .single();
    if (versionErr || !newVersion?.id) {
      return json({ error: versionErr?.message || "Failed to create revision version" }, 500);
    }

    const { error: updateScriptErr } = await supabase
      .from("scripts")
      .update({
        status: "resubmitted",
        file_url: revisedFileUrl,
        current_version_id: newVersion.id,
        updated_at: nowIso,
      })
      .eq("id", scriptId);
    if (updateScriptErr) return json({ error: updateScriptErr.message }, 500);

    const { error: cycleUpdateErr } = await supabase
      .from("script_revision_cycles")
      .update({
        status: "returned",
        returned_at: nowIso,
        beneficiary_returned_version_id: newVersion.id,
        updated_at: nowIso,
      })
      .eq("id", cycleId);
    if (cycleUpdateErr) return json({ error: cycleUpdateErr.message }, 500);

    const { error: eventErr } = await supabase
      .from("script_revision_cycle_events")
      .insert({
        cycle_id: cycleId,
        script_id: scriptId,
        event_type: "beneficiary_resubmitted",
        actor_user_id: userId,
        payload: {
          revised_file_url: revisedFileUrl,
          revised_version_id: newVersion.id,
          beneficiary_comment: beneficiaryComment || null,
          previous_file_url: (scriptRow as any).file_url ?? null,
        },
      });

    if (eventErr) return json({ error: eventErr.message }, 500);

    await notifyAdmins(supabase, {
      type: "script_revision_resubmitted",
      title: "Beneficiary resubmitted revised script",
      body: `A revised script was submitted for "${(scriptRow as any).title}" (cycle ${(cycleRow as any).cycle_number}).`,
      metadata: {
        script_id: scriptId,
        cycle_id: cycleId,
        cycle_number: (cycleRow as any).cycle_number,
        company_id: scriptCompanyId,
      },
    });

    return json({
      ok: true,
      scriptId,
      cycleId,
      newVersionId: newVersion.id,
      cycleNumber: (cycleRow as any).cycle_number,
      scriptStatus: "resubmitted",
      cycleStatus: "returned",
    });
  }

  // GET /client-portal/rejections/:scriptId
  const rejectionMatch = rest.match(/^rejections\/([^/]+)$/);
  if (method === "GET" && rejectionMatch) {
    if (!account) return json({ error: "Beneficiary portal account not found" }, 403);
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
