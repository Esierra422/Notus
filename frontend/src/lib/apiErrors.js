export function normalizeApiError(input, options = {}) {
  const status = options.status ?? input?.status
  const code = String(options.code ?? input?.code ?? '').toLowerCase()
  const fallback = options.fallback || 'Request failed. Please try again.'
  const action = options.actionHint || ''

  const raw = typeof input === 'string'
    ? input
    : input?.message || input?.error || input?.details || ''
  const msg = String(raw || '').trim()
  const lower = msg.toLowerCase()

  let friendly = fallback
  if (status === 401 || status === 403 || code.includes('permission')) {
    friendly = 'You do not have permission to perform this action.'
  } else if (status === 404) {
    friendly = 'The requested resource was not found.'
  } else if (status === 408 || code.includes('timeout') || lower.includes('timed out')) {
    friendly = 'The request timed out. Please retry in a moment.'
  } else if (status === 429 || lower.includes('too many requests')) {
    friendly = 'Too many requests were sent. Wait a moment and try again.'
  } else if (status >= 500 || lower.includes('internal') || lower.includes('server error')) {
    friendly = 'A server error occurred. Please try again shortly.'
  } else if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('cors') ||
    lower.includes('load failed')
  ) {
    friendly = 'Network request failed. Check your connection and try again.'
  } else if (msg) {
    friendly = msg
  }

  return action ? `${friendly} ${action}`.trim() : friendly
}
