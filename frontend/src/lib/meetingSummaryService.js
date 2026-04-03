import { collection, query, where, getDocs, getDoc, doc, orderBy } from 'firebase/firestore'
import { db } from './firebase'

/**
 * Trigger summary generation on the ai-backend.
 * @param {string} aiBaseUrl - The ai-backend base URL (effectiveAiBase)
 * @param {string} channel - Video channel name
 * @param {string} uid - Current user's Firebase UID
 * @param {string} orgId - Active organization ID
 * @param {string[]} participants - Display names of meeting participants
 * @returns {Promise<{success?: boolean, summaryId?: string, error?: string}>}
 */
export async function generateMeetingSummary(aiBaseUrl, channel, uid, orgId, participants) {
  const res = await fetch(`${aiBaseUrl}/api/generate-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, uid, orgId, participants }),
  })
  return res.json()
}

/**
 * Get all meeting summaries for a user, ordered by creation date (newest first).
 * @param {string} uid - User's Firebase UID
 * @returns {Promise<Array<{id: string, ...}>>}
 */
export async function getUserSummaries(uid) {
  const q = query(
    collection(db, 'meetingSummaries'),
    where('generatedBy', '==', uid),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
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
