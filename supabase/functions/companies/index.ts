/**
 * Edge Function: companies (clients)
 * GET /companies → list all clients
 * POST /companies → create client
 * PUT /companies/:id → update client
 * DELETE /companies/:id → delete client (cascades to scripts per DB)
 * Requires Authorization: Bearer <token>. Audits create/update/delete to audit_events.
 */
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { logAuditCanonical } from "../_shared/audit.ts";
import { isRegulatorOnly, isSuperAdminOrAdmin } from "../_shared/roleCheck.ts";

const LOGO_BUCKET = "company-logos";
const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const LOGO_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const HTML_TAG_LIKE = /<|>/;

type ClientRow = {
  id: string;
  name_ar: string;
  name_en: string;
  representative_name: string | null;
  representative_title: string | null;
  mobile: string | null;
  email: string | null;
  created_at: string;
  created_by?: string | null; // NEW
  logo_url?: string | null;
  logo_updated_at?: string | null;
};

type FrontendClient = {
  companyId: string;
  nameAr: string;
  nameEn: string;
  representativeName: string | null;
  representativeTitle: string | null;
  mobile: string | null;
  email: string | null;
  createdAt: string;
  created_by?: string | null; // NEW: Maintain snake_case to match frontend model
  logoUrl?: string | null;
  scriptsCount: number;
};

function toFrontend(row: ClientRow, scriptsCount = 0): FrontendClient {
  return {
    companyId: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    representativeName: row.representative_name ?? null,
    representativeTitle: row.representative_title ?? null,
    mobile: row.mobile ?? null,
    email: row.email ?? null,
    createdAt: row.created_at,
    created_by: row.created_by ?? null, // NEW
    logoUrl: row.logo_url ?? null,
    scriptsCount,
  };
}

function getPathAfterCompanies(url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\/companies\/?(.*)$/);
  const rest = match?.[1] ?? "";
  return rest.replace(/^\/+/, "").trim();
}

function hasHtmlLikeContent(value: string): boolean {
  return HTML_TAG_LIKE.test(value);
}

function validateSafeClientText(
  fieldLabel: string,
  value: string,
): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (hasHtmlLikeContent(trimmed)) {
    return `${fieldLabel} contains disallowed characters`;
  }
  return null;
}

function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function normalizeMobile(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = toAsciiDigits(value).trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits || null;
}

function validateMobile(value: string | null): string | null {
  if (!value) return "mobile is required";
  if (!/^05\d{8}$/.test(value)) {
    return "mobile must match Saudi format 05XXXXXXXX";
  }
  return null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = toAsciiDigits(value).trim().toLowerCase();
  return trimmed || null;
}

function containsArabicLetters(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function containsEnglishLetters(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function validateEmail(value: string | null): string | null {
  if (!value) return "email is required";
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) {
    return "email must be a valid address";
  }
  return null;
}

async function ensureUniqueClientNames(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  nameAr: string | null,
  nameEn: string | null,
  excludeId?: string,
): Promise<string | null> {
  const checks: Promise<{ field: "nameAr" | "nameEn"; rowId: string | null }>[] = [];

  if (nameAr) {
    checks.push(
      supabase
        .from("clients")
        .select("id")
        .ilike("name_ar", nameAr)
        .limit(1)
        .maybeSingle()
        .then(({ data }) => ({ field: "nameAr" as const, rowId: data?.id ?? null })),
    );
  }
  if (nameEn) {
    checks.push(
      supabase
        .from("clients")
        .select("id")
        .ilike("name_en", nameEn)
        .limit(1)
        .maybeSingle()
        .then(({ data }) => ({ field: "nameEn" as const, rowId: data?.id ?? null })),
    );
  }

  const results = await Promise.all(checks);
  for (const result of results) {
    if (result.rowId && result.rowId !== excludeId) {
      return result.field === "nameAr"
        ? "nameAr already exists"
        : "nameEn already exists";
    }
  }
  return null;
}

async function getActorUserId(req: Request, supabase: ReturnType<typeof createSupabaseAdmin>): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return optionsResponse(req);
  }

  const supabase = createSupabaseAdmin();
  const actorUserId = await getActorUserId(req, supabase);
  if (actorUserId == null) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const pathAfter = getPathAfterCompanies(req.url);
  const method = req.method;
  const route = pathAfter ? `/companies/${pathAfter}` : "/companies";
  const meta = { route, method };

  const pathParts = pathAfter.split("/").filter(Boolean);
  const companyId = pathParts[0] ?? "";
  const subPath = pathParts[1] ?? "";

  try {
    // GET /companies → list all clients with script counts
    // Only Super Admin and Admin see all companies. Everyone else (regulators, no-roles) sees only companies with scripts assigned to them.
    if (method === "GET" && !pathAfter) {
      const seeAll = await isSuperAdminOrAdmin(supabase, actorUserId);

      let rows: ClientRow[] | null = null;
      let scriptRows: { client_id?: string | null; company_id?: string | null; assignee_id?: string | null }[] = [];

      if (!seeAll) {
        // Not super admin/admin: return only companies that have at least one script assigned to this user
        const { data: assignedScripts, error: scriptsErr } = await supabase
          .from("scripts")
          .select("client_id, company_id, assignee_id")
          .eq("assignee_id", actorUserId);
        if (scriptsErr) {
          return jsonResponse({ error: scriptsErr.message }, 500);
        }
        scriptRows = assignedScripts ?? [];
        const clientIds = [...new Set((scriptRows ?? []).map((s) => (s.client_id ?? s.company_id ?? "").toString().trim()).filter(Boolean))];
        if (clientIds.length === 0) {
          return jsonResponse([]);
        }
        const { data: clientRows, error } = await supabase
          .from("clients")
          .select("id, name_ar, name_en, representative_name, representative_title, mobile, email, created_at, created_by, logo_url, logo_updated_at")
          .in("id", clientIds)
          .order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: error.message }, 500);
        rows = clientRows as ClientRow[];
      } else {
        const { data: clientRows, error } = await supabase
          .from("clients")
          .select("id, name_ar, name_en, representative_name, representative_title, mobile, email, created_at, created_by, logo_url, logo_updated_at")
          .order("created_at", { ascending: false });
        if (error) return jsonResponse({ error: error.message }, 500);
        rows = clientRows as ClientRow[];
        const { data: allScripts } = await supabase
          .from("scripts")
          .select("client_id, company_id");
        scriptRows = allScripts ?? [];
      }

      // Count scripts per client (for non-seeAll: only scripts assigned to this user)
      const countByClient: Record<string, number> = {};
      for (const s of scriptRows) {
        const id = (s.client_id ?? s.company_id ?? "").toString().trim();
        if (!id) continue;
        if (!seeAll && s.assignee_id !== actorUserId) continue;
        countByClient[id] = (countByClient[id] ?? 0) + 1;
      }

      const list = (rows ?? []).map((r) => {
        const client = r as ClientRow;
        return toFrontend(client, countByClient[client.id] ?? 0);
      });
      return jsonResponse(list);
    }

    // POST /companies → create client
    if (method === "POST" && !pathAfter) {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }
      const nameAr = typeof body.nameAr === "string" ? body.nameAr.trim() : "";
      const nameEn = typeof body.nameEn === "string" ? body.nameEn.trim() : "";
      if (!nameAr || !nameEn) {
        return jsonResponse({ error: "nameAr and nameEn are required" }, 400);
      }
      const nameArErr = validateSafeClientText("nameAr", nameAr);
      if (nameArErr) return jsonResponse({ error: nameArErr }, 400);
      if (containsEnglishLetters(nameAr)) return jsonResponse({ error: "nameAr must use Arabic letters" }, 400);
      const nameEnErr = validateSafeClientText("nameEn", nameEn);
      if (nameEnErr) return jsonResponse({ error: nameEnErr }, 400);
      if (containsArabicLetters(nameEn)) return jsonResponse({ error: "nameEn must use English letters" }, 400);
      const repName = typeof body.representativeName === "string" ? body.representativeName.trim() : "";
      if (repName) {
        const repErr = validateSafeClientText("representativeName", repName);
        if (repErr) return jsonResponse({ error: repErr }, 400);
      }
      const repTitle = typeof body.representativeTitle === "string" ? body.representativeTitle.trim() : "";
      if (repTitle) {
        const repTitleErr = validateSafeClientText("representativeTitle", repTitle);
        if (repTitleErr) return jsonResponse({ error: repTitleErr }, 400);
      }
      const mobile = normalizeMobile(typeof body.mobile === "string" ? body.mobile : null);
      const mobileErr = validateMobile(mobile);
      if (mobileErr) return jsonResponse({ error: mobileErr }, 400);
      const email = normalizeEmail(typeof body.email === "string" ? body.email : null);
      const emailErr = validateEmail(email);
      if (emailErr) return jsonResponse({ error: emailErr }, 400);
      const duplicateErr = await ensureUniqueClientNames(supabase, nameAr, nameEn);
      if (duplicateErr) return jsonResponse({ error: duplicateErr }, 409);

      const insert: Record<string, unknown> = {
        name_ar: nameAr,
        name_en: nameEn,
        representative_name: typeof body.representativeName === "string" ? body.representativeName.trim() || null : null,
        representative_title: typeof body.representativeTitle === "string" ? body.representativeTitle.trim() || null : null,
        mobile,
        email,
      };

      if (body.logoUrl !== undefined) (insert as Record<string, unknown>).logo_url = typeof body.logoUrl === "string" ? body.logoUrl.trim() || null : null;
      if (insert.logo_url) (insert as Record<string, unknown>).logo_updated_at = new Date().toISOString();

      const { data: row, error } = await supabase.from("clients").insert(insert).select("id, name_ar, name_en, representative_name, representative_title, mobile, email, created_at, created_by, logo_url, logo_updated_at").single();

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }
      const after = row as ClientRow;
      await logAuditCanonical(supabase, {
        event_type: "CLIENT_CREATED",
        actor_user_id: actorUserId,
        target_type: "client",
        target_id: after.id,
        target_label: after.name_ar || after.name_en,
        result_status: "success",
        metadata: { after: toFrontend(after) },
      }).catch((e) => console.warn("[companies] audit:", e));
      return jsonResponse(toFrontend(after));
    }

    // POST /companies/:id/logo → upload logo (multipart)
    if (method === "POST" && companyId && subPath === "logo") {
      const { data: clientRow, error: fetchErr } = await supabase.from("clients").select("id, logo_url").eq("id", companyId).single();
      if (fetchErr || !clientRow) return jsonResponse({ error: "Client not found" }, 404);

      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return jsonResponse({ error: "Invalid form data" }, 400);
      }
      const file = formData.get("file") ?? formData.get("logo");
      if (!file || !(file instanceof File)) {
        return jsonResponse({ error: "file is required" }, 400);
      }
      if (!LOGO_MIMES.has(file.type)) {
        return jsonResponse({ error: "Only image/png, image/jpeg, image/webp allowed" }, 400);
      }
      if (file.size > LOGO_MAX_BYTES) {
        return jsonResponse({ error: "File too large (max 2MB)" }, 400);
      }

      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const objectName = `${companyId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage.from(LOGO_BUCKET).upload(objectName, file, { contentType: file.type, upsert: true });
      if (uploadErr) {
        console.error("[companies] logo upload:", uploadErr.message);
        return jsonResponse({ error: uploadErr.message }, 500);
      }

      const logoUrl = `${LOGO_BUCKET}/${objectName}`;

      const oldLogoUrl = (clientRow as { logo_url?: string | null }).logo_url;
      if (oldLogoUrl && oldLogoUrl.includes(LOGO_BUCKET)) {
        try {
          const oldPath = oldLogoUrl.split(`/object/public/${LOGO_BUCKET}/`)[1] ?? oldLogoUrl.split(`${LOGO_BUCKET}/`)[1];
          if (oldPath) await supabase.storage.from(LOGO_BUCKET).remove([oldPath]);
        } catch (_) { /* ignore */ }
      }

      const { data: updated, error: updateErr } = await supabase
        .from("clients")
        .update({ logo_url: logoUrl, logo_updated_at: new Date().toISOString() })
        .eq("id", companyId)
        .select("id, name_ar, name_en, representative_name, representative_title, mobile, email, created_at, logo_url, logo_updated_at")
        .single();
      if (updateErr) return jsonResponse({ error: updateErr.message }, 500);
      return jsonResponse(toFrontend(updated as ClientRow));
    }

    // DELETE /companies/:id/logo → remove logo
    if (method === "DELETE" && companyId && subPath === "logo") {
      const { data: clientRow, error: fetchErr } = await supabase.from("clients").select("id, logo_url").eq("id", companyId).single();
      if (fetchErr || !clientRow) return jsonResponse({ error: "Client not found" }, 404);
      const logoUrl = (clientRow as { logo_url?: string | null }).logo_url;
      if (logoUrl && logoUrl.includes(LOGO_BUCKET)) {
        try {
          const oldPath = logoUrl.split(`/object/public/${LOGO_BUCKET}/`)[1] ?? logoUrl.split(`${LOGO_BUCKET}/`)[1];
          if (oldPath) await supabase.storage.from(LOGO_BUCKET).remove([oldPath]);
        } catch (_) { /* ignore */ }
      }
      const { data: updated, error: updateErr } = await supabase
        .from("clients")
        .update({ logo_url: null, logo_updated_at: new Date().toISOString() })
        .eq("id", companyId)
        .select("id, name_ar, name_en, representative_name, representative_title, mobile, email, created_at, logo_url, logo_updated_at")
        .single();
      if (updateErr) return jsonResponse({ error: updateErr.message }, 500);
      return jsonResponse(toFrontend(updated as ClientRow));
    }

    // PUT /companies/:id → update client
    if (method === "PUT" && pathAfter && !subPath) {
      const id = companyId;
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const { data: beforeRow, error: fetchErr } = await supabase
        .from("clients")
        .select("id, name_ar, name_en, representative_name, representative_title, mobile, email, created_at, logo_url, logo_updated_at")
        .eq("id", id)
        .single();

      if (fetchErr || !beforeRow) {
        return jsonResponse({ error: "Client not found" }, 404);
      }
      const before = beforeRow as ClientRow;

      const updates: Record<string, unknown> = {};
      if (body.nameAr !== undefined) {
        const v = typeof body.nameAr === "string" ? body.nameAr.trim() : "";
        if (v === "") {
          return jsonResponse({ error: "nameAr cannot be empty when provided" }, 400);
        }
        const err = validateSafeClientText("nameAr", v);
        if (err) return jsonResponse({ error: err }, 400);
        if (containsEnglishLetters(v)) return jsonResponse({ error: "nameAr must use Arabic letters" }, 400);
        updates.name_ar = v;
      }
      if (body.nameEn !== undefined) {
        const v = typeof body.nameEn === "string" ? body.nameEn.trim() : "";
        if (v === "") {
          return jsonResponse({ error: "nameEn cannot be empty when provided" }, 400);
        }
        const err = validateSafeClientText("nameEn", v);
        if (err) return jsonResponse({ error: err }, 400);
        if (containsArabicLetters(v)) return jsonResponse({ error: "nameEn must use English letters" }, 400);
        updates.name_en = v;
      }
      if (body.representativeName !== undefined) {
        const rep = typeof body.representativeName === "string" ? body.representativeName.trim() : "";
        if (rep) {
          const err = validateSafeClientText("representativeName", rep);
          if (err) return jsonResponse({ error: err }, 400);
        }
        updates.representative_name = rep || null;
      }
      if (body.representativeTitle !== undefined) {
        const repTitle = typeof body.representativeTitle === "string" ? body.representativeTitle.trim() : "";
        if (repTitle) {
          const err = validateSafeClientText("representativeTitle", repTitle);
          if (err) return jsonResponse({ error: err }, 400);
        }
        updates.representative_title = repTitle || null;
      }
      if (body.mobile !== undefined) {
        const mobile = normalizeMobile(typeof body.mobile === "string" ? body.mobile : null);
        const mobileErr = validateMobile(mobile);
        if (mobileErr) return jsonResponse({ error: mobileErr }, 400);
        updates.mobile = mobile;
      }
      if (body.email !== undefined) {
        const email = normalizeEmail(typeof body.email === "string" ? body.email : null);
        const emailErr = validateEmail(email);
        if (emailErr) return jsonResponse({ error: emailErr }, 400);
        updates.email = email;
      }
      if (body.logoUrl !== undefined) {
        updates.logo_url = typeof body.logoUrl === "string" ? body.logoUrl.trim() || null : null;
        updates.logo_updated_at = new Date().toISOString();
      }

      const candidateNameAr = (updates.name_ar as string | undefined) ?? before.name_ar;
      const candidateNameEn = (updates.name_en as string | undefined) ?? before.name_en;
      const duplicateErr = await ensureUniqueClientNames(supabase, candidateNameAr, candidateNameEn, id);
      if (duplicateErr) return jsonResponse({ error: duplicateErr }, 409);

      if (Object.keys(updates).length === 0) {
        return jsonResponse(toFrontend(before));
      }

      const { data: afterRow, error: updateErr } = await supabase
        .from("clients")
        .update(updates)
        .eq("id", id)
        .select("id, name_ar, name_en, representative_name, representative_title, mobile, email, created_at, logo_url, logo_updated_at")
        .single();

      if (updateErr) {
        return jsonResponse({ error: updateErr.message }, 500);
      }
      const after = afterRow as ClientRow;

      await logAuditCanonical(supabase, {
        event_type: "CLIENT_UPDATED",
        actor_user_id: actorUserId,
        target_type: "client",
        target_id: id,
        target_label: after.name_ar || after.name_en,
        result_status: "success",
        metadata: { before: toFrontend(before), after: toFrontend(after) },
      }).catch((e) => console.warn("[companies] audit:", e));
      return jsonResponse(toFrontend(after));
    }

    // DELETE /companies/:id → delete client (DB cascades to scripts)
    if (method === "DELETE" && companyId && !subPath) {
      const { data: clientRow, error: fetchErr } = await supabase
        .from("clients")
        .select("id, name_ar, name_en")
        .eq("id", companyId)
        .single();
      if (fetchErr || !clientRow) {
        return jsonResponse({ error: "Client not found" }, 404);
      }
      const label = (clientRow as ClientRow).name_ar || (clientRow as ClientRow).name_en;
      const { error: deleteErr } = await supabase.from("clients").delete().eq("id", companyId);
      if (deleteErr) {
        return jsonResponse({ error: deleteErr.message }, 500);
      }
      await logAuditCanonical(supabase, {
        event_type: "CLIENT_DELETED",
        actor_user_id: actorUserId,
        target_type: "client",
        target_id: companyId,
        target_label: label,
        result_status: "success",
      }).catch((e) => console.warn("[companies] audit:", e));
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Not Found" }, 404);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
