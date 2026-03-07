import { format as dateFnsFormat } from 'date-fns';

/**
 * Maps settings-style format string (DD/MM/YYYY) to date-fns tokens.
 * date-fns uses: yyyy, MM, dd
 */
function toDateFnsFormat(settingsFormat: string): string {
  return settingsFormat
    .replace(/YYYY/g, 'yyyy')
    .replace(/DD/g, 'dd')
    .replace(/D(?!\d)/g, 'd');
}

/**
 * Format a date using an optional format string (from settings) and locale.
 * If format is missing or invalid, falls back to Intl toLocaleDateString.
 */
export function formatDate(
  date: Date,
  options?: { lang?: 'ar' | 'en'; format?: string }
): string {
  const lang = options?.lang ?? 'en';
  const locale = lang === 'ar' ? 'ar-SA' : 'en-GB';
  const formatStr = options?.format?.trim();

  if (formatStr) {
    try {
      const tokens = toDateFnsFormat(formatStr);
      return dateFnsFormat(date, tokens);
    } catch {
      // fall through to locale fallback
    }
  }

  return date.toLocaleDateString(locale);
}

/**
 * Format a date with long style (e.g. for report headers).
 */
export function formatDateLong(
  date: Date,
  options?: { lang?: 'ar' | 'en' }
): string {
  const lang = options?.lang ?? 'en';
  const locale = lang === 'ar' ? 'ar-SA' : 'en-GB';
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
