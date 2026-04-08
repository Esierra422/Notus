/**
 * Block service — user blocks another user.
 * Stored at users/{userId}/blocked/{blockedUserId}
 */
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

function blockedRef(userId, blockedUserId) {
  return doc(db, 'users', userId, 'blocked', blockedUserId)
}

function blockedCollection(userId) {
  return collection(db, 'users', userId, 'blocked')
}

/**
 * Block a user.
 */
export async function blockUser(userId, blockedUserId) {
  if (!userId || !blockedUserId || userId === blockedUserId) return
  await setDoc(blockedRef(userId, blockedUserId), {
    blockedUserId,
    createdAt: serverTimestamp(),
  })
}

/**
 * Unblock a user.
 */
export async function unblockUser(userId, blockedUserId) {
  if (!userId || !blockedUserId) return
  await deleteDoc(blockedRef(userId, blockedUserId))
}

/**
 * Check if userId has blocked blockedUserId.
 */
export async function isBlocked(userId, blockedUserId) {
  if (!userId || !blockedUserId) return false
  const snap = await getDoc(blockedRef(userId, blockedUserId))
  return snap.exists()
}

/**
 * Get list of user IDs that userId has blocked.
 */
export async function getBlockedUserIds(userId) {
  if (!userId) return []
  const snap = await getDocs(blockedCollection(userId))
  return snap.docs.map((d) => d.data().blockedUserId || d.id)
}
