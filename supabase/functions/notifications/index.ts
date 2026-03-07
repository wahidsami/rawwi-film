/**
 * Notifications API: in-app notifications (e.g. script_assigned).
 * GET /notifications → { data, unreadCount }
 * GET /notifications/count → { unreadCount }
 * PATCH /notifications/:id/read → mark one read
 * POST /notifications/read-all → mark all read for current user
 */
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function pathAfter(base: string, url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(new RegExp(`/${base}/?(.*)$`));
  return (match?.[1] ?? "").replace(/^\/+/, "").trim();
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { userId: uid, supabase } = auth;

  const rest = pathAfter("notifications", req.url);
  const parts = rest.split("/").filter(Boolean);

  // GET /notifications/count
  if (req.method === "GET" && rest === "count") {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .is("read_at", null);
    if (error) return json({ error: error.message }, 500);
    return json({ unreadCount: count ?? 0 });
  }

  // GET /notifications — list unread first, limit 50
  if (req.method === "GET" && (rest === "" || rest === "list")) {
    const { data: rows, error } = await supabase
      .from("notifications")
      .select("id, type, title, body, metadata, read_at, created_at")
      .eq("user_id", uid)
      .order("read_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return json({ error: error.message }, 500);
    const list = (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body ?? undefined,
      metadata: r.metadata ?? {},
      readAt: (r.read_at as string) ?? undefined,
      createdAt: r.created_at,
    }));
    const unreadCount = (rows ?? []).filter((r: Record<string, unknown>) => r.read_at == null).length;
    return json({ data: list, unreadCount });
  }

  // PATCH /notifications/:id/read
  if (req.method === "PATCH" && parts.length === 2 && parts[1] === "read") {
    const id = parts[0];
    const { data: row, error: fetchErr } = await supabase
      .from("notifications")
      .select("id, user_id")
      .eq("id", id)
      .single();
    if (fetchErr || !row) return json({ error: "Not found" }, 404);
    if ((row as { user_id: string }).user_id !== uid) return json({ error: "Forbidden" }, 403);
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (updateErr) return json({ error: updateErr.message }, 500);
    return json({ ok: true });
  }

  // POST /notifications/read-all
  if (req.method === "POST" && rest === "read-all") {
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", uid)
      .is("read_at", null);
    if (updateErr) return json({ error: updateErr.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Not Found" }, 404);
});
