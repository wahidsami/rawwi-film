/**
 * Single source for env-derived URLs. Use this instead of duplicating
 * VITE_API_BASE_URL fallback across api/, services/, and pages/.
 */
const isProd = import.meta.env.PROD;
const envUrl = import.meta.env.VITE_API_BASE_URL;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const enableQuickAnalysisRaw = import.meta.env.VITE_ENABLE_QUICK_ANALYSIS;

if (isProd) {
  if (!envUrl) throw new Error("VITE_API_BASE_URL is required in production");
  if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL is required in production");
}

export const API_BASE_URL =
  envUrl || (import.meta.env.DEV ? "http://localhost:54321/functions/v1" : "");

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === "") return defaultValue;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

// Kill-switch capable; enabled by default unless explicitly disabled.
export const ENABLE_QUICK_ANALYSIS = parseBooleanEnv(enableQuickAnalysisRaw, true);
