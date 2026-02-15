/**
 * Phase 1A: Secure signed upload URL.
 * POST /upload body: { fileName: string }
 * Response: { url: string, path?: string }
 * Rewrites signed URL origin to PUBLIC_SUPABASE_URL (default http://localhost:54321) so the browser can resolve it.
 * Set PUBLIC_SUPABASE_URL in project root .env when running supabase functions serve.
 */
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sanitizeFileName, getCorrelationId } from "../_shared/utils.ts";

const BUCKET = "uploads";
const SIGNED_URL_EXPIRY_SEC = 60 * 5; // 5 minutes

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const correlationId = getCorrelationId(req);

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { fileName?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const rawName = body?.fileName;
  if (rawName == null || typeof rawName !== "string") {
    return json({ error: "fileName is required" }, 400);
  }

  let safeName: string;
  try {
    safeName = sanitizeFileName(rawName);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Invalid fileName" }, 400);
  }

  const userId = auth.userId;
  const scriptId = "unscoped";
  const timestamp = Date.now();
  const objectPath = `${userId}/${scriptId}/${timestamp}_${safeName}`;

  const supabase = createSupabaseAdmin();
  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(objectPath, { upsert: false });

  if (error) {
    console.error(`[upload] correlationId=${correlationId} error=`, error.message);
    return json({ error: error.message || "Failed to create upload URL" }, 500);
  }

  let url = (signed as { signedUrl?: string })?.signedUrl;
  if (!url) {
    return json({ error: "No signed URL in response" }, 500);
  }
  // Rewrite origin so browser can resolve (Supabase returns kong:8000 internally)
  const envUrl = Deno.env.get("PUBLIC_SUPABASE_URL");
  const isCloud = !!Deno.env.get("DENO_REGION");

  if (isCloud && !envUrl) {
    throw new Error("PUBLIC_SUPABASE_URL is required in production");
  }

  const publicOrigin = (envUrl || "http://localhost:54321").replace(/\/$/, "");
  try {
    const u = new URL(url);
    url = publicOrigin + u.pathname + u.search;
  } catch {
    // leave url as-is if parse fails
  }
  return json({ url, path: objectPath });
});
