import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { isUserAdmin } from "../_shared/roleCheck.ts";

type AnalysisMemoryMode = "memory1" | "memory2";

const ANALYSIS_MEMORY_KEY = "analysis_memory_mode";
const DEFAULT_ANALYSIS_MEMORY_MODE: AnalysisMemoryMode = "memory1";

function pathAfter(base: string, url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(new RegExp(`/${base}/?(.*)$`));
  return (match?.[1] ?? "").replace(/^\/+/, "").trim();
}

function normalizeMode(raw: unknown): AnalysisMemoryMode {
  const mode = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return mode === "memory2" ? "memory2" : "memory1";
}

async function getMode(supabase: ReturnType<typeof createSupabaseAdmin>): Promise<AnalysisMemoryMode> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", ANALYSIS_MEMORY_KEY)
    .maybeSingle();
  const value = (data as { value?: { mode?: string } } | null)?.value;
  return normalizeMode(value?.mode);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const userId = auth.userId;

  const supabase = createSupabaseAdmin();
  const rest = pathAfter("settings", req.url);

  if (rest !== "analysis-memory") return json({ error: "Not Found" }, 404);

  if (req.method === "GET") {
    const mode = await getMode(supabase);
    return json({ mode });
  }

  if (req.method === "PUT") {
    const isAdmin = await isUserAdmin(supabase, userId);
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    let body: { mode?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const mode = normalizeMode(body.mode);

    const { error } = await supabase
      .from("app_settings")
      .upsert(
        {
          key: ANALYSIS_MEMORY_KEY,
          value: { mode },
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: "key" },
      );

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, mode });
  }

  return json({ error: "Method not allowed" }, 405);
});

