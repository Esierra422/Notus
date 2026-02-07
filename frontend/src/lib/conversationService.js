/**
 * WhatsApp-style conversations: DM, Group, Team chats.
 * Path: organizations/{orgId}/conversations/{convId}
 * Messages: organizations/{orgId}/conversations/{convId}/messages/{msgId}
 */
import {
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  increment,
} from 'firebase/firestore'
import { db } from './firebase'
import { getMembership, getOrgMembers, MEMBERSHIP_STATES } from './orgService'
import { getTeamMembers, getTeam, getTeamMembership, TEAM_STATES } from './teamService'

const CONVERSATIONS_SUB = 'conversations'
const MESSAGES_SUB = 'messages'
const TYPING_SUB = 'typing'

export const CONV_TYPES = { dm: 'dm', group: 'group', team: 'team' }
export const MESSAGE_STATUS = { sent: 'sent', delivered: 'delivered', read: 'read' }

function dmKey(uidA, uidB) {
  return [uidA, uidB].sort().join('_')
}

function convRef(orgId, convId) {
  return doc(db, 'organizations', orgId, CONVERSATIONS_SUB, convId)
}

function messagesRef(orgId, convId) {
  return collection(db, 'organizations', orgId, CONVERSATIONS_SUB, convId, MESSAGES_SUB)
}

function typingRef(orgId, convId) {
  return collection(db, 'organizations', orgId, CONVERSATIONS_SUB, convId, TYPING_SUB)
}

async function ensureOrgMember(orgId, userId) {
  const mem = await getMembership(orgId, userId)
  if (!mem || mem.state !== MEMBERSHIP_STATES.active) {
    throw new Error('Must be org member.')
  }
  return mem
}

/**
 * Get or create a DM between two users. Returns existing if found.
 */
export async function getOrCreateDM(orgId, userId, otherUserId) {
  await ensureOrgMember(orgId, userId)
  await ensureOrgMember(orgId, otherUserId)
  const key = dmKey(userId, otherUserId)
  const convsRef = collection(db, 'organizations', orgId, CONVERSATIONS_SUB)
  // Must filter by members so Firestore rules can verify user has read access
  const q = query(
    convsRef,
    where('members', 'array-contains', userId),
    where('type', '==', CONV_TYPES.dm),
    where('dmKey', '==', key)
  )
  const snap = await getDocs(q)
  if (snap.docs.length > 0) {
    return { id: snap.docs[0].id, ...snap.docs[0].data() }
  }
  const convRef = doc(convsRef)
  await setDoc(convRef, {
    type: CONV_TYPES.dm,
    dmKey: key,
    members: [userId, otherUserId],
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: '',
    createdBy: userId,
    createdAt: serverTimestamp(),
  })
  return { id: convRef.id, type: CONV_TYPES.dm, dmKey: key, members: [userId, otherUserId] }
}

/**
 * Create a group chat. 3+ members, name required.
 */
export async function createGroupChat(orgId, userId, name, memberIds) {
  await ensureOrgMember(orgId, userId)
  const members = [...new Set([userId, ...memberIds])]
  if (members.length < 3) throw new Error('Group chat needs at least 3 members.')
  for (const uid of members) {
    await ensureOrgMember(orgId, uid)
  }
  const convsRef = collection(db, 'organizations', orgId, CONVERSATIONS_SUB)
  const ref = doc(convsRef)
  await setDoc(ref, {
    type: CONV_TYPES.group,
    name: (name || 'Group').trim(),
    members,
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: '',
    createdBy: userId,
    createdAt: serverTimestamp(),
  })
  return { id: ref.id, type: CONV_TYPES.group, name: (name || 'Group').trim(), members }
}

/**
 * Get or create team chat. One per team.
 */
export async function getOrCreateTeamChat(orgId, userId, teamId) {
  await ensureOrgMember(orgId, userId)
  const team = await getTeam(orgId, teamId)
  if (!team) throw new Error('Team not found.')
  const convsRef = collection(db, 'organizations', orgId, CONVERSATIONS_SUB)
  // Must filter by members so Firestore rules can verify user has read access
  const q = query(
    convsRef,
    where('members', 'array-contains', userId),
    where('type', '==', CONV_TYPES.team),
    where('teamId', '==', teamId)
  )
  const snap = await getDocs(q)
  if (snap.docs.length > 0) {
    const conv = { id: snap.docs[0].id, ...snap.docs[0].data() }
    const canAccess = await canAccessConversation(orgId, conv.id, userId)
    if (!canAccess) throw new Error('You must be a team member to access this chat.')
    return conv
  }
  const teamMembers = await getTeamMembers(orgId, teamId)
  const activeMembers = teamMembers.filter((m) => m.state === TEAM_STATES.active).map((m) => m.userId)
  if (!activeMembers.includes(userId)) throw new Error('You must be a team member to create the team chat.')
  const ref = doc(convsRef)
  await setDoc(ref, {
    type: CONV_TYPES.team,
    teamId,
    name: team.name,
    members: activeMembers,
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: '',
    createdBy: userId,
    createdAt: serverTimestamp(),
  })
  return { id: ref.id, type: CONV_TYPES.team, teamId, name: team.name, members: activeMembers }
}

/**
 * Get conversations for user, sorted by lastMessageAt desc.
 */
export async function getConversations(orgId, userId) {
  await ensureOrgMember(orgId, userId)
  const convsRef = collection(db, 'organizations', orgId, CONVERSATIONS_SUB)
  const q = query(
    convsRef,
    where('members', 'array-contains', userId),
    orderBy('lastMessageAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Subscribe to conversations list (real-time).
 * @param {Function} [onError] - Called on listener error (e.g. missing index, permissions).
 */
export function subscribeConversations(orgId, userId, callback, onError) {
  const convsRef = collection(db, 'organizations', orgId, CONVERSATIONS_SUB)
  const q = query(
    convsRef,
    where('members', 'array-contains', userId),
    orderBy('lastMessageAt', 'desc')
  )
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    (err) => {
      if (onError) onError(err)
      else console.error('[subscribeConversations]', err)
    }
  )
}

/**
 * Get single conversation.
 */
export async function getConversation(orgId, convId) {
  const ref = convRef(orgId, convId)
  const snap = await getDoc(ref)
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * Check if user can access conversation (in members; for team, also team member).
 */
export async function canAccessConversation(orgId, convId, userId) {
  const conv = await getConversation(orgId, convId)
  if (!conv) return false
  if (!conv.members?.includes(userId)) return false
  if (conv.type === CONV_TYPES.team && conv.teamId) {
    const tm = await getTeamMembership(orgId, conv.teamId, userId)
    if (!tm || tm.state !== TEAM_STATES.active) return false
  }
  return true
}

/**
 * Send a message and update conversation lastMessageAt.
 * Increments unreadCount for all other members.
 * @param {object} [options] - { attachment: { type, data?, fileName? } }
 */
export async function sendMessage(orgId, convId, text, userId, options = {}) {
  const conv = await getConversation(orgId, convId)
  if (!conv) throw new Error('Conversation not found.')
  const canAccess = conv.members?.includes(userId)
  if (!canAccess) throw new Error('Cannot access this conversation.')
  let preview = (text || '').trim().slice(0, 100)
  if (!preview && options.attachment?.type === 'poll' && options.attachment?.question) {
    preview = `Poll: ${options.attachment.question}`.slice(0, 100)
  }
  const msgData = {
    senderId: userId,
    text: (text || '').trim(),
    createdAt: serverTimestamp(),
    status: MESSAGE_STATUS.sent,
  }
  if (options.attachment) {
    const att = options.attachment
    if (att.type === 'poll' && att.question && Array.isArray(att.options)) {
      msgData.attachment = {
        type: 'poll',
        question: att.question,
        options: att.options.map((o) => ({
          text: typeof o === 'string' ? o : (o.text || ''),
          votes: [],
        })),
        ended: false,
      }
    } else {
      msgData.attachment = options.attachment
    }
  }
  const msgRef = await addDoc(messagesRef(orgId, convId), msgData)
  const others = (conv.members || []).filter((id) => id !== userId)
  const updates = {
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: preview,
  }
  others.forEach((uid) => {
    updates[`unreadCount.${uid}`] = increment(1)
  })
  await updateDoc(convRef(orgId, convId), updates)
  return { id: msgRef.id, senderId: userId, text: (text || '').trim(), createdAt: new Date(), attachment: options.attachment }
}

function msgRef(orgId, convId, msgId) {
  return doc(db, 'organizations', orgId, CONVERSATIONS_SUB, convId, MESSAGES_SUB, msgId)
}

/**
 * Vote on a poll. Single-choice: replaces any previous vote.
 */
export async function votePoll(orgId, convId, msgId, userId, optionIndex) {
  const canAccess = await canAccessConversation(orgId, convId, userId)
  if (!canAccess) throw new Error('Cannot access conversation.')
  const msgDoc = await getDoc(msgRef(orgId, convId, msgId))
  const data = msgDoc.data()
  if (!data || data.attachment?.type !== 'poll') throw new Error('Not a poll message.')
  if (data.attachment.ended) throw new Error('Poll has ended.')
  const options = [...(data.attachment.options || [])]
  if (optionIndex < 0 || optionIndex >= options.length) throw new Error('Invalid option.')
  // Ensure each option has { text, votes: string[] }
  const normalized = options.map((o, i) => ({
    text: typeof o === 'string' ? o : (o.text || ''),
    votes: Array.isArray(o?.votes) ? [...o.votes] : [],
  }))
  // Remove userId from any option, add to chosen
  normalized.forEach((o) => {
    o.votes = o.votes.filter((id) => id !== userId)
  })
  normalized[optionIndex].votes.push(userId)
  await updateDoc(msgRef(orgId, convId, msgId), {
    attachment: { ...data.attachment, options: normalized },
  })
}

/**
 * End a poll. Only the sender can end it.
 */
export async function endPoll(orgId, convId, msgId, userId) {
  const canAccess = await canAccessConversation(orgId, convId, userId)
  if (!canAccess) throw new Error('Cannot access conversation.')
  const msgDoc = await getDoc(msgRef(orgId, convId, msgId))
  const data = msgDoc.data()
  if (!data || data.attachment?.type !== 'poll') throw new Error('Not a poll message.')
  if (data.senderId !== userId) throw new Error('Only the poll creator can end the poll.')
  if (data.attachment.ended) return
  await updateDoc(msgRef(orgId, convId, msgId), {
    attachment: { ...data.attachment, ended: true },
  })
}

/**
 * Get messages (one-time).
 */
export async function getMessages(orgId, convId, limitCount = 100) {
  const q = query(
    messagesRef(orgId, convId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  )
  const snap = await getDocs(q)
  const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  return messages.reverse()
}

/**
 * Subscribe to messages (real-time).
 * @param {Function} [onError] - Called on listener error.
 */
export function subscribeMessages(orgId, convId, callback, onError) {
  const q = query(
    messagesRef(orgId, convId),
    orderBy('createdAt', 'desc'),
    limit(200)
  )
  return onSnapshot(
    q,
    (snap) => {
      const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      callback(messages.reverse())
    },
    (err) => {
      if (onError) onError(err)
      else console.error('[subscribeMessages]', err)
    }
  )
}

/**
 * Get org members for New Chat picker (active members only).
 */
export async function getOrgMembersForChat(orgId, userId) {
  await ensureOrgMember(orgId, userId)
  const members = await getOrgMembers(orgId)
  return members
    .filter((m) => m.state === MEMBERSHIP_STATES.active && m.userId !== userId)
    .map((m) => ({ userId: m.userId }))
}

/**
 * Set typing status. Call with isTyping true when user types, false when they stop.
 * Typing doc auto-expires; use debounce (~1.5s) before setting false.
 */
export async function setTyping(orgId, convId, userId, isTyping) {
  const canAccess = await canAccessConversation(orgId, convId, userId)
  if (!canAccess) return
  const ref = doc(typingRef(orgId, convId), userId)
  if (isTyping) {
    await setDoc(ref, { typing: true, updatedAt: serverTimestamp() })
  } else {
    await clearTyping(orgId, convId, userId)
  }
}

export async function clearTyping(orgId, convId, userId) {
  try {
    const ref = doc(typingRef(orgId, convId), userId)
    await updateDoc(ref, { typing: false })
  } catch {
    // Ignore (doc may not exist)
  }
}

/**
 * Subscribe to typing indicators for a conversation.
 */
export function subscribeTyping(orgId, convId, callback, onError) {
  const ref = typingRef(orgId, convId)
  return onSnapshot(
    ref,
    (snap) => {
      const typers = snap.docs
        .filter((d) => d.data().typing === true)
        .map((d) => d.id)
      callback(typers)
    },
    (err) => {
      if (onError) onError(err)
      else console.error('[subscribeTyping]', err)
    }
  )
}

/**
 * Mark conversation as read by user (resets unread count).
 */
export async function markConversationRead(orgId, convId, userId) {
  const canAccess = await canAccessConversation(orgId, convId, userId)
  if (!canAccess) return
  const ref = convRef(orgId, convId)
  await updateDoc(ref, {
    [`lastReadBy.${userId}`]: serverTimestamp(),
    [`unreadCount.${userId}`]: 0,
  })
}

/**
 * Mark messages as delivered (called when recipient receives them).
 */
export async function markMessagesDelivered(orgId, convId, messageIds) {
  if (!messageIds.length) return
  await Promise.all(
    messageIds.map((id) => {
      const msgRef = doc(messagesRef(orgId, convId), id)
      return updateDoc(msgRef, { status: MESSAGE_STATUS.delivered })
    })
  )
}

/**
 * Mark messages as read (called when recipient views the chat).
 */
export async function markMessagesRead(orgId, convId, messageIds) {
  if (!messageIds.length) return
  await Promise.all(
    messageIds.map((id) => {
      const msgRef = doc(messagesRef(orgId, convId), id)
      return updateDoc(msgRef, { status: MESSAGE_STATUS.read })
    })
  )
}
