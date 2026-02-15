/**
 * Single source for env-derived URLs. Use this instead of duplicating
 * VITE_API_BASE_URL fallback across api/, services/, and pages/.
 */
const isProd = import.meta.env.PROD;
const envUrl = import.meta.env.VITE_API_BASE_URL;

if (isProd && !envUrl) {
  throw new Error("VITE_API_BASE_URL is required in production");
}

export const API_BASE_URL =
  envUrl ?? "http://localhost:54321/functions/v1";
