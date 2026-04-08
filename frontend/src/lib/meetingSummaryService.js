import { collection, query, where, getDocs, getDoc, doc, orderBy, limit } from 'firebase/firestore'
import { db } from './firebase'
import { getAiRestHttpBase } from './apiConfig.js'
import { normalizeApiError } from './apiErrors.js'
import { getMeetingsForUserInOrg, getMeetingsForUser, getMeetingTranscriptSessionId } from './meetingService.js'

/**
 * Ask the AI backend about a past or live meeting (same /api/ask RAG as in-call Ask AI).
 * @param {{ channel?: string, sessionId?: string, uid?: string, orgId?: string, question?: string }} opts
 * @returns {Promise<{ answer?: string, error?: string }>}
 */
export async function askMeetingRecap({ channel = '', sessionId = '', uid = '', orgId = '', question = '' } = {}) {
  const q = String(question || '').trim()
  if (!q) return { error: 'Enter a question before sending.' }
  let base = getAiRestHttpBase()
  if (!base) return { error: 'AI service is not configured. Set VITE_AI_HTTP_URL or VITE_AI_WS_URL and redeploy.' }
  if (base.startsWith('wss://')) base = `https://${base.slice(6)}`
  else if (base.startsWith('ws://')) base = `http://${base.slice(5)}`
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: String(channel || '').trim(),
        sessionId: String(sessionId || '').trim(),
        question: q,
        uid: String(uid || '').trim(),
        orgId: String(orgId || '').trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      }),
    })
    const data = await res.json().catch(() => ({}))
    const answer = data.answer ?? data.error
    if (!res.ok) {
      return {
        error: normalizeApiError(typeof answer === 'string' ? answer : '', {
          status: res.status,
          fallback: 'AI request failed.',
          actionHint: 'Try again in a few seconds.',
        }),
      }
    }
    return { answer: typeof answer === 'string' ? answer : 'No answer returned.' }
  } catch (e) {
    return {
      error: normalizeApiError(e, {
        fallback: 'Could not reach the AI service.',
        actionHint: 'Check your network connection and API configuration.',
      }),
    }
  }
}

/**
 * Trigger summary generation on the ai-backend.
 * @param {string} aiBaseUrl - The ai-backend base URL (effectiveAiBase)
 * @param {object} opts
 * @param {string} opts.channel - Agora / video room id (for display in summary)
 * @param {string} opts.sessionId - Firestore transcript doc id (shared per calendar meeting)
 * @param {string} opts.uid - Current user's Firebase UID
 * @param {string} opts.orgId - Active organization ID
 * @param {string[]} opts.participants - Display names of meeting participants
 * @returns {Promise<{success?: boolean, summaryId?: string, error?: string}>}
 */
const SUMMARY_FETCH_TIMEOUT_MS = 120_000

export async function generateMeetingSummary(aiBaseUrl, { channel, sessionId, uid, orgId, participants }) {
  let base = typeof aiBaseUrl === 'string' ? aiBaseUrl.replace(/\/$/, '') : ''
  if (base.startsWith('wss://')) base = `https://${base.slice(6)}`
  else if (base.startsWith('ws://')) base = `http://${base.slice(5)}`
  if (!base) base = getAiRestHttpBase()
  if (!base) return { success: false, error: 'AI backend URL is not configured. Update your environment variables and redeploy.' }
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SUMMARY_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/api/generate-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, sessionId, uid, orgId, participants }),
      signal: controller.signal,
    })
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (!ct.includes('application/json')) {
      return {
        success: false,
        error: res.ok
          ? 'AI server returned a non-JSON response.'
          : `AI server returned HTTP ${res.status}. If this URL is your Express API, set VITE_AI_WS_URL to your FastAPI (ai-backend) URL and redeploy the frontend.`,
      }
    }
    const data = await res.json()
    if (!res.ok) {
      return {
        success: false,
        error: normalizeApiError(data.error || '', {
          status: res.status,
          fallback: 'Summary request failed.',
          actionHint: 'Verify AI backend availability and try again.',
        }),
        wordCount: data.wordCount,
      }
    }
    return data
  } catch (e) {
    if (e?.name === 'AbortError') {
      return {
        success: false,
        error:
          'Summary request timed out. The AI service may be waking from sleep. Wait a minute, then try “Previous meetings” or end the meeting again.',
      }
    }
    return {
      success: false,
      error: normalizeApiError(e, {
        fallback: 'Could not reach the AI server.',
        actionHint: 'Check network access and CORS configuration.',
      }),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Get meeting summaries for a user, ordered by creation date (newest first).
 * @param {string} uid - User's Firebase UID
 * @param {{ limit?: number }} [opts] - Omit or leave unset for full list (e.g. Previous meetings page).
 * @returns {Promise<Array<{id: string, ...}>>}
 */
function summarySortDesc(a, b) {
  const ta = a.createdAt?.toMillis?.() ?? (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0)
  const tb = b.createdAt?.toMillis?.() ?? (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0)
  return tb - ta
}

export async function getUserSummaries(uid, opts = {}) {
  const cap = typeof opts.limit === 'number' && opts.limit > 0 ? Math.min(opts.limit, 500) : null
  try {
    const parts = [
      collection(db, 'meetingSummaries'),
      where('generatedBy', '==', uid),
      orderBy('createdAt', 'desc'),
    ]
    if (cap != null) parts.push(limit(cap))
    const q = query(...parts)
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.warn('[getUserSummaries] ordered query failed, falling back:', e?.code || e?.message)
    const q2 = query(collection(db, 'meetingSummaries'), where('generatedBy', '==', uid))
    const snap = await getDocs(q2)
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    list.sort(summarySortDesc)
    return cap != null ? list.slice(0, cap) : list
  }
}

/**
 * Get a single meeting summary by ID.
 * @param {string} summaryId - Firestore document ID
 * @returns {Promise<{id: string, ...} | null>}
 */
export async function getSummary(summaryId) {
  const snap = await getDoc(doc(db, 'meetingSummaries', summaryId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

/**
 * Full transcript text saved during the call (Firestore), keyed by transcript session id.
 * May be empty after a summary run deletes the doc. Requires auth (Firestore rules).
 */
export async function getMeetingTranscriptBySessionId(sessionId) {
  const sid = (sessionId || '').trim()
  if (!sid) return null
  const snap = await getDoc(doc(db, 'meetingTranscripts', sid))
  if (!snap.exists()) return null
  const d = snap.data() || {}
  const chunks = Array.isArray(d.chunks) ? d.chunks : []
  const segments = []
  for (const c of chunks) {
    if (!c || typeof c !== 'object' || !c.text) continue
    const line = String(c.text).trim()
    if (!line) continue
    const uid = c.uid != null ? String(c.uid) : ''
    const speaker = uid ? `Speaker (uid ${uid})` : ''
    let timeLabel = ''
    if (typeof c.timestamp === 'string' && c.timestamp) {
      try {
        const dt = new Date(c.timestamp)
        if (!Number.isNaN(dt.getTime())) {
          timeLabel = dt.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        }
      } catch {
        timeLabel = ''
      }
    }
    segments.push({ text: line, speaker, timeLabel })
  }
  const text = segments.map((s) => s.text).join(' ')
  return {
    sessionId: sid,
    text: text.trim(),
    segments,
    totalWordCount: d.totalWordCount ?? null,
    updatedAt: d.updatedAt ?? null,
  }
}

/** Remove common third-party footers accidentally pasted into transcript text. */
export function stripTranscriptArtifacts(text) {
  return String(text || '')
    .replace(/\s*Transcribed by https?:\/\/[^\s\n]+/gi, '')
    .replace(/\s*Powered by Otter\.ai[^\n]*/gi, '')
    .trim()
}

function chunkPlainTranscriptToParagraphs(plain) {
  const parts = plain.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  if (parts.length > 1) {
    return parts.map((text) => ({ text, uid: '', timestamp: '' }))
  }
  const sents = plain.split(/(?<=[.!?])\s+/).filter(Boolean)
  const out = []
  let buf = []
  let len = 0
  for (const s of sents) {
    buf.push(s)
    len += s.length + 1
    if (len >= 300 && buf.length >= 2) {
      out.push({ text: buf.join(' ').trim(), uid: '', timestamp: '' })
      buf = []
      len = 0
    }
  }
  if (buf.length) out.push({ text: buf.join(' ').trim(), uid: '', timestamp: '' })
  return out.length ? out : [{ text: plain, uid: '', timestamp: '' }]
}

/**
 * Segments for meeting recap UI: prefers Firestore `transcriptSegments` from the AI backend;
 * otherwise splits the flat `transcript` string into readable paragraphs.
 * @param {{ transcript?: string, transcriptSegments?: Array<{ text?: string, uid?: string, timestamp?: string }> }} summary
 */
export function getSummaryTranscriptDisplaySegments(summary) {
  const raw = summary?.transcriptSegments
  if (Array.isArray(raw) && raw.length) {
    const mapped = raw
      .map((s) => ({
        text: stripTranscriptArtifacts(String(s?.text ?? '')),
        uid: String(s?.uid ?? ''),
        timestamp: String(s?.timestamp ?? ''),
      }))
      .filter((s) => s.text.trim())
    if (mapped.length) return mapped
  }
  const plain = stripTranscriptArtifacts(String(summary?.transcript ?? ''))
  if (!plain.trim()) return []
  return chunkPlainTranscriptToParagraphs(plain)
}

export function formatSummarySegmentTime(timestamp) {
  const ts = String(timestamp || '').trim()
  if (!ts) return ''
  if (/^\d{4}-\d{2}-\d{2}T/.test(ts)) {
    try {
      const d = new Date(ts)
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }
    } catch {
      /* ignore */
    }
  }
  return ts
}

export function labelForSummarySegment(segment, uniqueUids, participantNames) {
  const uid = segment.uid
  const names = Array.isArray(participantNames) ? participantNames.filter(Boolean) : []
  if (!uid) {
    if (names.length === 1) return names[0]
    return 'Transcript'
  }
  if (uniqueUids.size <= 1) return names[0] || 'Participant'
  const short = uid.length > 4 ? uid.slice(-4) : uid
  return `Speaker · ${short}`
}

/** Plain text for copy / PDF / Word — one block per segment, “- [Speaker] …” lines. */
export function getSummaryTranscriptCopyText(summary) {
  const segments = getSummaryTranscriptDisplaySegments(summary)
  if (!segments.length) return ''
  const unique = new Set(segments.map((s) => s.uid).filter(Boolean))
  const names = summary?.participants
  return segments
    .map((s) => {
      const label = labelForSummarySegment(s, unique, names)
      const time = formatSummarySegmentTime(s.timestamp)
      const prefix = time ? `${time} ` : ''
      return `${prefix}- [${label}] ${s.text}`
    })
    .join('\n\n')
}

function pastRowStartMs(row) {
  return row.startAt?.toMillis?.() ?? (row.startAt?.seconds ? row.startAt.seconds * 1000 : 0)
}

/**
 * Recent past meetings for the video lobby (newest first). Mirrors PreviousMeetings merge logic.
 * @param {string} uid
 * @param {{ routeOrgId?: string | null, limit?: number }} opts
 */
export async function getPastMeetingLobbyPreview(uid, { routeOrgId = null, limit = 4 } = {}) {
  if (!uid) return []
  const lim = Math.min(Math.max(Number(limit) || 4, 1), 8)
  const meetingPool = Math.min(120, Math.max(lim * 14, 56))
  const summaryCap = Math.min(80, meetingPool + 24)
  const [summaries, meetings] = await Promise.all([
    getUserSummaries(uid, { limit: summaryCap }),
    routeOrgId
      ? getMeetingsForUserInOrg(uid, routeOrgId, meetingPool)
      : getMeetingsForUser(uid, meetingPool),
  ])
  const videoMeetings = meetings.filter((m) => m.isVideoMeeting !== false)
  const summaryBySession = new Map()
  for (const s of summaries) {
    const sid = (s.transcriptSessionId || '').trim()
    if (sid) summaryBySession.set(sid, s)
  }
  const built = []
  const usedSummaryIds = new Set()
  for (const m of videoMeetings) {
    const orgId = m.orgId || m._orgId || routeOrgId || ''
    const sessionId = getMeetingTranscriptSessionId(m, orgId)
    const summary = sessionId ? summaryBySession.get(sessionId) : null
    if (summary) usedSummaryIds.add(summary.id)
    built.push({
      key: `m-${m.id}-${orgId}`,
      meetingId: m.id,
      transcriptSessionId: sessionId || null,
      title: m.title || 'Meeting',
      startAt: m.startAt,
      summary,
      orgName: m._orgName,
    })
  }
  for (const s of summaries) {
    if (usedSummaryIds.has(s.id)) continue
    usedSummaryIds.add(s.id)
    built.push({
      key: `s-${s.id}`,
      meetingId: null,
      transcriptSessionId: (s.transcriptSessionId || '').trim() || null,
      title: s.title || 'Meeting summary',
      startAt: s.createdAt,
      summary: s,
      orgName: null,
    })
  }
  built.sort((a, b) => pastRowStartMs(b) - pastRowStartMs(a))
  return built.slice(0, lim).map((row) => {
    let href = null
    if (row.summary) href = `/app/meeting-summary/${row.summary.id}`
    else if (row.transcriptSessionId) href = `/app/meeting-transcript/${encodeURIComponent(row.transcriptSessionId)}`
    return {
      key: row.key,
      title: row.title,
      startAt: row.startAt,
      href,
      orgName: row.orgName || null,
      hasAiNotes: !!row.summary,
      transcriptOnly: !!row.transcriptSessionId && !row.summary,
    }
  })
}
