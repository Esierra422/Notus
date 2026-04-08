/**
 * Report service — users report other users. Admins can view reports.
 * Stored at organizations/{orgId}/reports/{reportId}
 */
import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'

function reportsRef(orgId) {
  return collection(db, 'organizations', orgId, 'reports')
}

/**
 * Create a report. Reporter must be org member.
 */
export async function createReport(orgId, reporterId, reportedUserId, reportedUserName, reason) {
  if (!orgId || !reporterId || !reportedUserId) {
    throw new Error('Missing required fields for report.')
  }
  const ref = reportsRef(orgId)
  await addDoc(ref, {
    reporterId,
    reportedUserId,
    reportedUserName: reportedUserName || '',
    reason: (reason || '').trim(),
    createdAt: serverTimestamp(),
  })
}

/**
 * Get reports for an org (admin only).
 */
export async function getReportsForOrg(orgId) {
  if (!orgId) return []
  const q = query(
    reportsRef(orgId),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
