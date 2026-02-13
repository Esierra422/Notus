/**
 * Favorite conversations per user. Path: users/{userId}/favorites/{favoriteId}
 * favoriteId = orgId_convId for uniqueness.
 */
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'

const FAVORITES_COLL = 'favorites'

function favoriteId(orgId, convId) {
  return `${orgId}_${convId}`
}

function favoriteRef(userId, orgId, convId) {
  return doc(db, 'users', userId, FAVORITES_COLL, favoriteId(orgId, convId))
}

export async function addToFavorites(userId, orgId, convId) {
  await setDoc(favoriteRef(userId, orgId, convId), {
    orgId,
    conversationId: convId,
    createdAt: new Date().toISOString(),
  })
}

export async function removeFromFavorites(userId, orgId, convId) {
  await deleteDoc(favoriteRef(userId, orgId, convId))
}

export function subscribeFavorites(userId, cb) {
  if (!userId) return () => {}
  const coll = collection(db, 'users', userId, FAVORITES_COLL)
  return onSnapshot(coll, (snap) => {
    const set = new Set()
    snap.docs.forEach((d) => {
      const { orgId, conversationId } = d.data()
      if (orgId && conversationId) set.add(favoriteId(orgId, conversationId))
    })
    cb(set)
  })
}
