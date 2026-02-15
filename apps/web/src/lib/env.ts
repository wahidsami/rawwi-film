/**
 * Single source for env-derived URLs. Use this instead of duplicating
 * VITE_API_BASE_URL fallback across api/, services/, and pages/.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:54321/functions/v1";
