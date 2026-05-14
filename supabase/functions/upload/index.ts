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
import { getCorrelationId } from "../_shared/utils.ts";

/** Must match extract + raawi-script-upload: script files live in `scripts`, not `uploads`. */
const BUCKET = "scripts";
const SIGNED_URL_EXPIRY_SEC = 60 * 5; // 5 minutes

function buildSafeStorageFileName(originalName: string, fallbackExt: string): string {
  const normalized = (originalName || "").normalize("NFC").trim();
  const lastDot = normalized.lastIndexOf(".");
  const rawBase = lastDot > 0 ? normalized.slice(0, lastDot) : normalized;
  const rawExt = lastDot > 0 ? normalized.slice(lastDot + 1) : fallbackExt;

  const safeBase = rawBase
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const safeExt = (rawExt || fallbackExt || "bin")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const base = safeBase || "file";
  const ext = safeExt || "bin";
  return `${base}.${ext}`;
}

function extractExtFromName(fileName: string): string {
  const normalized = (fileName || "").normalize("NFC").trim();
  const idx = normalized.lastIndexOf(".");
  if (idx <= 0 || idx >= normalized.length - 1) return "bin";
  const ext = normalized.slice(idx + 1).toLowerCase();
  const safeExt = ext.replace(/[^a-z0-9]/g, "");
  return safeExt || "bin";
}

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
  const normalizedName = rawName.normalize("NFC").trim();
  if (!normalizedName) return json({ error: "fileName is required" }, 400);

  const userId = auth.userId;
  const scriptId = "unscoped";
  const timestamp = Date.now();
  const ext = extractExtFromName(normalizedName);
  // Accept any user-visible file name (any language/special chars) while
  // storing with a robust ASCII-only object key to avoid storage path failures.
  const safeStorageName = buildSafeStorageFileName(`file_${crypto.randomUUID()}.${ext}`, ext);
  const objectPath = `${userId}/${scriptId}/${timestamp}_${safeStorageName}`;

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
