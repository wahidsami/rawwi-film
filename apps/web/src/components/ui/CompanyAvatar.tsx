import { useState, useMemo } from 'react';
import { cn } from '@/utils/cn';

/** Rewrite storage URL to use public Supabase origin (fixes kong:8000 / internal host in Docker). */
function toPublicStorageUrl(url: string): string {
  try {
    const u = new URL(url);
    const publicOrigin = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
    if (!publicOrigin) return url;
    if (u.hostname === 'kong' || u.port === '8000') return publicOrigin + u.pathname + (u.search || '');
    return url;
  } catch {
    return url;
  }
}

/**
 * Derive 1–2 letter initials from company name.
 * - Trim, split by spaces, first letter of first two words; if one word, first 2 letters; uppercase.
 * - Empty name → "?"
 */
export function getCompanyInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const a = words[0].charAt(0);
    const b = words[1].charAt(0);
    return (a + b).toUpperCase();
  }
  return (trimmed.slice(0, 2) || trimmed).toUpperCase();
}

/** Deterministic background color from name (optional). */
function getAvatarBg(name: string | null | undefined): string {
  const s = (name ?? '').trim() || '?';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 45%, 35%)`;
}

export interface CompanyAvatarProps {
  /** Company display name (e.g. nameEn or nameAr). */
  name: string;
  /** Logo URL from API (optional). If missing or image fails to load, initials are shown. */
  logoUrl?: string | null;
  size?: number;
  className?: string;
}

export function CompanyAvatar({ name, logoUrl, size = 48, className }: CompanyAvatarProps) {
  const [useFallback, setUseFallback] = useState(false);
  const initials = useMemo(() => getCompanyInitials(name), [name]);
  const bg = useMemo(() => getAvatarBg(name), [name]);

  const resolvedLogoUrl = useMemo(() => (logoUrl ? toPublicStorageUrl(logoUrl) : ''), [logoUrl]);
  const hasValidLogo = resolvedLogoUrl && (resolvedLogoUrl.startsWith('http') || resolvedLogoUrl.startsWith('blob:')) && !useFallback;

  return (
    <div
      className={cn('flex items-center justify-center rounded-[var(--radius)] overflow-hidden flex-shrink-0 bg-background border border-border', className)}
      style={{ width: size, height: size }}
    >
      {hasValidLogo ? (
        <img
          src={resolvedLogoUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setUseFallback(true)}
        />
      ) : (
        <span
          className="text-white font-semibold select-none"
          style={{
            fontSize: size * 0.4,
            backgroundColor: bg,
            width: size,
            height: size,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
