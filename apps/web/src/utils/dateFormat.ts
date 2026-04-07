export const APP_TIME_ZONE = 'Asia/Riyadh';

function getLocale(lang: 'ar' | 'en'): string {
  return lang === 'ar' ? 'ar-SA' : 'en-GB';
}

function isValidDate(date: Date): boolean {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function getDateParts(date: Date, lang: 'ar' | 'en'): Record<string, string> {
  const locale = getLocale(lang);
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month2 = parts.find((p) => p.type === 'month')?.value ?? '';
  const day2 = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = month2.replace(/^0+/, '') || month2;
  const day = day2.replace(/^0+/, '') || day2;
  return { YYYY: year, MM: month2, M: month, DD: day2, D: day };
}

/**
 * Format a date using an optional format string (from settings) and locale.
 * If format is missing or invalid, falls back to Intl toLocaleDateString.
 */
export function formatDate(
  date: Date,
  options?: { lang?: 'ar' | 'en'; format?: string }
): string {
  if (!isValidDate(date)) return '—';
  const lang = options?.lang ?? 'en';
  const locale = getLocale(lang);
  const formatStr = options?.format?.trim();

  if (formatStr) {
    try {
      const p = getDateParts(date, lang);
      return formatStr.replace(/YYYY|DD|MM|D|M/g, (token) => p[token] ?? token);
    } catch {
      // fall through to locale fallback
    }
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Format a date with long style (e.g. for report headers).
 */
export function formatDateLong(
  date: Date,
  options?: { lang?: 'ar' | 'en' }
): string {
  if (!isValidDate(date)) return '—';
  const lang = options?.lang ?? 'en';
  const locale = getLocale(lang);
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(
  date: Date,
  options?: { lang?: 'ar' | 'en' }
): string {
  if (!isValidDate(date)) return '—';
  const lang = options?.lang ?? 'en';
  const locale = getLocale(lang);
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

export function formatTime(
  date: Date,
  options?: { lang?: 'ar' | 'en' }
): string {
  if (!isValidDate(date)) return '—';
  const lang = options?.lang ?? 'en';
  const locale = getLocale(lang);
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    timeStyle: 'medium',
  }).format(date);
}
