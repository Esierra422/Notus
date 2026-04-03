import { collection, query, where, getDocs, getDoc, doc, orderBy } from 'firebase/firestore'
import { db } from './firebase'

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
export async function generateMeetingSummary(aiBaseUrl, { channel, sessionId, uid, orgId, participants }) {
  const res = await fetch(`${aiBaseUrl}/api/generate-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, sessionId, uid, orgId, participants }),
  })
  return res.json()
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
