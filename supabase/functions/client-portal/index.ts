import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { isUserAdmin } from "../_shared/roleCheck.ts";

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

  // POST /client-portal/register (public, free registration)
  if (method === "POST" && rest === "register") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const companyNameAr = typeof body.companyNameAr === "string" ? body.companyNameAr.trim() : "";
    const companyNameEn = typeof body.companyNameEn === "string" ? body.companyNameEn.trim() : "";
    const representativeName = typeof body.representativeName === "string" ? body.representativeName.trim() : null;
    const representativeTitle = typeof body.representativeTitle === "string" ? body.representativeTitle.trim() : null;
    const mobile = normalizePhone(body.mobile);

    if (!email || !isValidEmail(email)) return json({ error: "Valid email is required" }, 400);
    if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
    if (!name) return json({ error: "Name is required" }, 400);
    if (!companyNameAr || !companyNameEn) return json({ error: "companyNameAr and companyNameEn are required" }, 400);

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
    try {
      const { data: userData, error: createUserErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          role: "Client",
          allowedSections: ["client_portal"],
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
          email,
          created_by: createdUserId,
        })
        .select("id, created_at")
        .single();
      if (companyErr || !company?.id) throw new Error(companyErr?.message || "Failed to create company profile");

      const { error: accountErr } = await supabase
        .from("client_portal_accounts")
        .insert({
          user_id: createdUserId,
          company_id: company.id,
          subscription_plan: "free",
          subscription_status: "active",
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
          subscriptionStatus: "active",
        },
      });
      if (metaErr) throw new Error(metaErr.message);

      return json({
        ok: true,
        registration: "free",
        userId: createdUserId,
        companyId: company.id,
      }, 201);
    } catch (error) {
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

  // GET /client-portal/me
  if (method === "GET" && rest === "me") {
    if (!account) return json({ error: "Client portal account not found" }, 403);
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
      return {
        scriptId: row.id,
        title: row.title,
        type: row.type,
        status: row.status,
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

      return {
        scriptId: row.id,
        title: row.title,
        type: row.type,
        status: row.status,
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

    const { data: report } = await supabase
      .from("analysis_reports")
      .select("id, job_id, script_id, review_status, review_notes, findings_count, severity_counts, summary_json, created_at")
      .eq("script_id", scriptId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!report) return json({ error: "No report found for this script" }, 404);

    const { data: reviewFindings } = await supabase
      .from("analysis_review_findings")
      .select("id, source_kind, primary_article_id, primary_atom_id, severity, title_ar, description_ar, rationale_ar, evidence_snippet, review_status, include_in_report, page_number, created_at")
      .eq("report_id", (report as any).id)
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
            .eq("job_id", (report as any).job_id)
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

    return json({
      script: {
        id: (scriptRow as any).id,
        title: (scriptRow as any).title,
        status: (scriptRow as any).status,
      },
      report: {
        id: (report as any).id,
        jobId: (report as any).job_id,
        reviewStatus: (report as any).review_status,
        reviewNotes: (report as any).review_notes,
        findingsCount: (report as any).findings_count,
        severityCounts: (report as any).severity_counts,
        summaryJson: (report as any).summary_json,
        createdAt: (report as any).created_at,
      },
      findings,
    });
  }

  return json({ error: "Not Found" }, 404);
});
