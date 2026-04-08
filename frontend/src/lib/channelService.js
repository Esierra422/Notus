/**
 * Text channels — org-level async chat.
 * Path: organizations/{orgId}/channels/{channelId}
 * Messages: organizations/{orgId}/channels/{channelId}/messages/{messageId}
 */
import {
  collection,
  doc,
  setDoc,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { getMembership, MEMBERSHIP_STATES } from './orgService'

const CHANNELS_SUB = 'channels'
const MESSAGES_SUB = 'messages'

/**
 * Create a channel. Caller must be active org member.
 */
export async function createChannel(orgId, name, userId) {
  const mem = await getMembership(orgId, userId)
  if (!mem || mem.state !== MEMBERSHIP_STATES.active) {
    throw new Error('Must be org member to create channels.')
  }
  const channelsRef = collection(db, 'organizations', orgId, CHANNELS_SUB)
  const channelRef = doc(channelsRef)
  await setDoc(channelRef, {
    name: (name || 'general').trim(),
    createdBy: userId,
    createdAt: serverTimestamp(),
  })
  return { id: channelRef.id, name: (name || 'general').trim(), createdBy: userId }
}

/**
 * Get all channels for an org.
 */
export async function getOrgChannels(orgId) {
  const channelsRef = collection(db, 'organizations', orgId, CHANNELS_SUB)
  const q = query(channelsRef, orderBy('createdAt', 'asc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Send a message to a channel.
 */
export async function sendMessage(orgId, channelId, text, userId) {
  const mem = await getMembership(orgId, userId)
  if (!mem || mem.state !== MEMBERSHIP_STATES.active) {
    throw new Error('Must be org member to send messages.')
  }
  const messagesRef = collection(db, 'organizations', orgId, CHANNELS_SUB, channelId, MESSAGES_SUB)
  const ref = await addDoc(messagesRef, {
    text: (text || '').trim(),
    userId,
    createdAt: serverTimestamp(),
  })
  return { id: ref.id, text: (text || '').trim(), userId, createdAt: new Date() }
}

/**
 * Get recent messages for a channel (latest first, then reverse for display).
 */
export async function getChannelMessages(orgId, channelId, limitCount = 100) {
  const messagesRef = collection(db, 'organizations', orgId, CHANNELS_SUB, channelId, MESSAGES_SUB)
  const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(limitCount))
  const snapshot = await getDocs(q)
  const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
  return messages.reverse()
}
