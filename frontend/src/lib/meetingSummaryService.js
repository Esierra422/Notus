import { collection, query, where, getDocs, getDoc, doc, orderBy } from 'firebase/firestore'
import { db } from './firebase'
import { getAiRestHttpBase } from './apiConfig.js'
import { getMeetingsForUserInOrg, getMeetingsForUser, getMeetingTranscriptSessionId } from './meetingService.js'

/**
 * Ask the AI backend about a past or live meeting (same /api/ask RAG as in-call Ask AI).
 * @param {{ channel?: string, sessionId?: string, uid?: string, orgId?: string, question?: string }} opts
 * @returns {Promise<{ answer?: string, error?: string }>}
 */
export async function askMeetingRecap({ channel = '', sessionId = '', uid = '', orgId = '', question = '' } = {}) {
  const q = String(question || '').trim()
  if (!q) return { error: 'Enter a question.' }
  let base = getAiRestHttpBase()
  if (!base) return { error: 'AI service URL is not configured (set VITE_AI_HTTP_URL or VITE_AI_WS_URL).' }
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
      return { error: typeof answer === 'string' ? answer : `Request failed (${res.status})` }
    }
    return { answer: typeof answer === 'string' ? answer : 'No answer returned.' }
  } catch (e) {
    return { error: e?.message || 'Could not reach the AI service.' }
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
  if (!base) return { success: false, error: 'AI backend URL not configured.' }
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
        error: data.error || `Request failed (${res.status})`,
        wordCount: data.wordCount,
      }
    }
    return data
  } catch (e) {
    if (e?.name === 'AbortError') {
      return {
        success: false,
        error:
          'Summary request timed out. The AI service may be waking from sleep — wait a minute and try “Previous meetings” or end again.',
      }
    }
    return {
      success: false,
      error: e?.message || 'Could not reach the AI server (network or CORS).',
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Get all meeting summaries for a user, ordered by creation date (newest first).
 * @param {string} uid - User's Firebase UID
 * @returns {Promise<Array<{id: string, ...}>>}
 */
function summarySortDesc(a, b) {
  const ta = a.createdAt?.toMillis?.() ?? (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0)
  const tb = b.createdAt?.toMillis?.() ?? (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0)
  return tb - ta
}

export async function getUserSummaries(uid) {
  try {
    const q = query(
      collection(db, 'meetingSummaries'),
      where('generatedBy', '==', uid),
      orderBy('createdAt', 'desc')
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.warn('[getUserSummaries] ordered query failed, falling back:', e?.code || e?.message)
    const q2 = query(collection(db, 'meetingSummaries'), where('generatedBy', '==', uid))
    const snap = await getDocs(q2)
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    list.sort(summarySortDesc)
    return list
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
  const [summaries, meetings] = await Promise.all([
    getUserSummaries(uid),
    routeOrgId ? getMeetingsForUserInOrg(uid, routeOrgId, 400) : getMeetingsForUser(uid, 400),
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
