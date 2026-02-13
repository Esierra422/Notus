/**
 * Starred messages per user. Path: users/{userId}/starred/{starredId}
 * starredId = orgId_convId_msgId for uniqueness.
 */
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
} from 'firebase/firestore'
import { db } from './firebase'

const STARRED_COLL = 'starred'

function starredId(orgId, convId, msgId) {
  return `${orgId}_${convId}_${msgId}`
}

function starredRef(userId, orgId, convId, msgId) {
  return doc(db, 'users', userId, STARRED_COLL, starredId(orgId, convId, msgId))
}

/**
 * Star a message.
 */
export async function starMessage(userId, orgId, convId, msgId, textSnippet = '') {
  await setDoc(starredRef(userId, orgId, convId, msgId), {
    orgId,
    conversationId: convId,
    messageId: msgId,
    textSnippet: (textSnippet || '').slice(0, 200),
    createdAt: new Date().toISOString(),
  })
}

/**
 * Unstar a message.
 */
export async function unstarMessage(userId, orgId, convId, msgId) {
  await deleteDoc(starredRef(userId, orgId, convId, msgId))
}

/**
 * Subscribe to starred messages for a given conversation.
 * Calls cb with Map<msgId, true> for starred message IDs.
 */
export function subscribeStarredForConversation(userId, orgId, convId, cb) {
  if (!userId || !orgId || !convId) return () => {}
  const coll = collection(db, 'users', userId, STARRED_COLL)
  const q = query(
    coll,
    where('orgId', '==', orgId),
    where('conversationId', '==', convId),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, (snap) => {
    const map = new Map()
    snap.docs.forEach((d) => {
      const { messageId } = d.data()
      if (messageId) map.set(messageId, d.data())
    })
    cb(map)
  })
}

/**
 * Subscribe to all starred messages for a user (any org/conv).
 */
export function subscribeAllStarred(userId, cb) {
  if (!userId) return () => {}
  const coll = collection(db, 'users', userId, STARRED_COLL)
  const q = query(coll, orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    cb(list)
  })
}
