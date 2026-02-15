/**
 * Storage utility for reconstructing public URLs from Supabase storage paths.
 * Supports both absolute URLs (legacy) and relative paths (env-agnostic).
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const STORAGE_ROOT = `${SUPABASE_URL}/storage/v1/object/public`;

/**
 * Resolves a value from the database (URL or path) to a valid public URL.
 * 
 * Logic:
 * 1. If it's already an absolute http(s) URL:
 *    - If it contains 'localhost' or '127.0.0.1', rewrite origin to VITE_SUPABASE_URL.
 *    - Else return as-is.
 * 2. If it's a relative path (e.g. "company-logos/abc.png"):
 *    - Prefix with Supabase storage root.
 * 3. Fallback: return as-is.
 */
export function resolveStorageUrl(pathOrUrl: string | null | undefined): string {
    if (!pathOrUrl) return '';

    // Handle absolute URLs
    if (pathOrUrl.startsWith('http')) {
        try {
            const url = new URL(pathOrUrl);
            // Rewriting origin for internal Docker hosts or localhost if needed
            if (url.hostname === 'kong' || url.port === '8000' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
                if (!SUPABASE_URL) return pathOrUrl;
                return `${STORAGE_ROOT}${url.pathname.replace('/storage/v1/object/public', '')}${url.search}`;
            }
            return pathOrUrl;
        } catch {
            return pathOrUrl;
        }
    }

    // Handle relative paths (e.g. "company-logos/xyz.png")
    // If it starts with a slash, strip it
    const cleanPath = pathOrUrl.replace(/^\/+/, '');

    if (SUPABASE_URL && cleanPath) {
        return `${STORAGE_ROOT}/${cleanPath}`;
    }

    return pathOrUrl;
}
