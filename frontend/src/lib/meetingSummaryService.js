import { collection, query, where, getDocs, getDoc, doc, orderBy } from 'firebase/firestore'
import { db } from './firebase'
import { getAiRestHttpBase } from './apiConfig.js'

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
