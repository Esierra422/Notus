/**
 * Time zone and locale-aware date formatting.
 * Uses user preferences (timeZone, language) when available.
 */

/** Map of IANA time zone IDs to display labels */
export const TIMEZONE_OPTIONS = [
  { value: '', label: 'Use browser default' },
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'UTC', label: 'UTC' },
]

/** Map of language codes to BCP 47 locale strings */
export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English', locale: 'en-US' },
  { value: 'es', label: 'Spanish', locale: 'es' },
  { value: 'fr', label: 'French', locale: 'fr' },
  { value: 'de', label: 'German', locale: 'de' },
]

/**
 * Get effective time zone from user doc. Returns IANA string or undefined for browser default.
 */
export function getTimeZone(userDoc) {
  const tz = userDoc?.timeZone?.trim()
  return tz || undefined
}

/**
 * Get effective locale from user doc for Intl formatting. Returns BCP 47 string.
 */
export function getLocale(userDoc) {
  const code = userDoc?.language?.trim() || 'en'
  const opt = LANGUAGE_OPTIONS.find((o) => o.value === code)
  return opt?.locale || (code === 'en' ? 'en-US' : code)
}

/**
 * Format a date for display. Uses user time zone and locale when provided.
 * @param {Date|string|number} date - Date to format
 * @param {Object} options - { timeZone?, locale?, year?, month?, day?, weekday?, ... }
 */
export function formatDate(date, options = {}) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return 'N/A'
  const { timeZone, locale, ...intlOpts } = options
  const base = { year: 'numeric', month: 'short', day: 'numeric', ...intlOpts }
  return d.toLocaleDateString(locale || undefined, {
    ...base,
    ...(timeZone && { timeZone }),
  })
}

/**
 * Format date and time.
 */
export function formatDateTime(date, options = {}) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return 'N/A'
  const { timeZone, locale, ...intlOpts } = options
  const base = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...intlOpts,
  }
  return d.toLocaleString(locale || undefined, {
    ...base,
    ...(timeZone && { timeZone }),
  })
}

/** Firestore Timestamp or ms: compact row label for meeting lists. */
export function formatMeetingRowWhen(startAt, userDoc) {
  if (!startAt) return ''
  const ms = typeof startAt?.toMillis === 'function' ? startAt.toMillis() : startAt
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  const tz = getTimeZone(userDoc)
  const locale = getLocale(userDoc)
  return d.toLocaleString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(tz && { timeZone: tz }),
  })
}

/**
 * Format relative date (e.g. "Today", "Yesterday", "Jan 5").
 */
export function formatRelativeDate(date, options = {}) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return 'N/A'
  const { timeZone, locale } = options
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((dateOnly - today) / (24 * 60 * 60 * 1000))
  const intlOpts = { timeZone, locale }
  if (diffDays === 0) return 'Today'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays > -7 && diffDays < 7) {
    return d.toLocaleDateString(locale || undefined, { weekday: 'long', ...intlOpts })
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric', ...intlOpts })
  }
  return d.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric', year: 'numeric', ...intlOpts })
}

/**
 * Calendar `?date=` query string: local date as YYYY-MM-DD (month 1–12).
 */
export function formatCalendarDateQueryParam(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

/**
 * Parse `?date=` from calendar deep links.
 * Prefers `YYYY-MM-DD` (1-based month). Accepts legacy unpadded `Y-M-D` with JS month index 0–11.
 */
export function parseCalendarDateQueryParam(dateParam) {
  if (!dateParam || typeof dateParam !== 'string') return null
  const s = dateParam.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (iso) {
    const y = Number(iso[1])
    const mo = Number(iso[2])
    const d = Number(iso[3])
    if (y >= 1970 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return { year: y, monthIndex: mo - 1, selectedDate: new Date(y, mo - 1, d) }
    }
    return null
  }
  const parts = s.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  const [y, m, d] = parts
  if (y < 1970 || y > 2100 || m < 0 || m > 11 || d < 1 || d > 31) return null
  return { year: y, monthIndex: m, selectedDate: new Date(y, m, d) }
}
