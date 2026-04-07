const STORAGE_KEY = 'notus.cookieConsent.v1'

function safeJsonParse(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

function nowIso() {
  return new Date().toISOString()
}

function normalize(raw) {
  const base = {
    // Necessary is always on (auth/session/security storage).
    necessary: true,
    // Optional categories.
    preferences: false,
    analytics: false,
    // Metadata for auditability.
    updatedAt: null,
    version: 1,
  }

  if (!raw || typeof raw !== 'object') return base
  return {
    ...base,
    necessary: true,
    preferences: raw.preferences === true,
    analytics: raw.analytics === true,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
    version: 1,
  }
}

function load() {
  if (typeof window === 'undefined') return normalize(null)
  const raw = safeJsonParse(window.localStorage.getItem(STORAGE_KEY) || '')
  return normalize(raw)
}

let _state = load()
const _subs = new Set()

function persist(next) {
  _state = normalize({ ...next, updatedAt: nowIso() })
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(_state))
  }
  for (const fn of _subs) {
    try {
      fn(_state)
    } catch {
      // ignore subscriber errors
    }
  }
  return _state
}

export const cookieConsent = {
  /** Returns current consent state. */
  get() {
    return _state
  },

  /** True if user has made an explicit choice (banner can be dismissed). */
  hasUserChoice() {
    return Boolean(_state.updatedAt)
  },

  /** Subscribe to consent changes. Returns unsubscribe function. */
  subscribe(fn) {
    _subs.add(fn)
    return () => _subs.delete(fn)
  },

  /** Accept all optional categories. */
  acceptAll() {
    return persist({ ..._state, preferences: true, analytics: true })
  },

  /** Reject all optional categories. */
  rejectAll() {
    return persist({ ..._state, preferences: false, analytics: false })
  },

  /** Set granular preferences. */
  set(next) {
    return persist({ ..._state, ...next })
  },

  /** Remove stored choice (for testing/reset). */
  reset() {
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY)
    return persist({ necessary: true, preferences: false, analytics: false, updatedAt: null })
  },
}

