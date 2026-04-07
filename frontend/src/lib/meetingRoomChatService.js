/**
 * In-meeting chat under videoChannels/{channelId}/messages (Firestore).
 * Supports everyone / direct messages, optional attachments (file, poll).
 *
 * Uses three listeners instead of a single OR query so we avoid brittle composite
 * index requirements and empty snapshots when one branch fails.
 */
import {
  addDoc,
  collection,
  doc,
  deleteField,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase.js'

const MAX_FILE_BYTES = 750_000 // ~750KB base64 in doc  -  keep small for Firestore

function messageCreatedMs(data) {
  const t = data?.createdAt
  if (t && typeof t.toMillis === 'function') return t.toMillis()
  if (typeof t?.seconds === 'number') return t.seconds * 1000
  return 0
}

export function subscribeMeetingChatMessages(channelName, userId, onData, onError) {
  if (!channelName || !userId) {
    onData([])
    return () => {}
  }
  const col = collection(db, 'videoChannels', channelName, 'messages')
  let everyoneDocs = []
  let directToMe = []
  let directFromMe = []

  const mergeAndEmit = () => {
    const byId = new Map()
    for (const m of [...everyoneDocs, ...directToMe, ...directFromMe]) {
      byId.set(m.id, m)
    }
    const merged = Array.from(byId.values()).sort((a, b) => messageCreatedMs(a) - messageCreatedMs(b))
    onData(merged.slice(-300))
  }

  const unsubEveryone = onSnapshot(
    query(col, where('audienceType', '==', 'everyone'), orderBy('createdAt', 'asc'), limit(250)),
    (snap) => {
      everyoneDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      mergeAndEmit()
    },
    onError
  )
  const unsubDirectIn = onSnapshot(
    query(
      col,
      where('audienceType', '==', 'direct'),
      where('recipientId', '==', userId),
      orderBy('createdAt', 'asc'),
      limit(150)
    ),
    (snap) => {
      directToMe = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      mergeAndEmit()
    },
    onError
  )
  const unsubDirectOut = onSnapshot(
    query(
      col,
      where('audienceType', '==', 'direct'),
      where('senderId', '==', userId),
      orderBy('createdAt', 'asc'),
      limit(150)
    ),
    (snap) => {
      directFromMe = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      mergeAndEmit()
    },
    onError
  )

  return () => {
    unsubEveryone()
    unsubDirectIn()
    unsubDirectOut()
  }
}

/**
 * Document attachments from in-meeting chat that the signed-in user is allowed to read
 * (everyone channel + direct threads they are part of).
 */
export async function fetchMeetingSharedDocuments(channelName, userId) {
  const ch = String(channelName || '').trim()
  const uid = String(userId || '').trim()
  if (!ch || !uid) return []

  const col = collection(db, 'videoChannels', ch, 'messages')
  let snap
  try {
    snap = await getDocs(query(col, orderBy('createdAt', 'asc'), limit(500)))
  } catch (e) {
    console.warn('[fetchMeetingSharedDocuments] ordered read failed, retrying without order:', e?.message || e)
    snap = await getDocs(query(col, limit(500)))
  }

  const out = []
  snap.forEach((d) => {
    const m = d.data() || {}
    const att = m.attachment
    if (!att || att.type !== 'document' || typeof att.data !== 'string' || !att.data.trim()) return

    const aud = m.audienceType === 'direct' ? 'direct' : 'everyone'
    if (aud === 'direct' && m.senderId !== uid && m.recipientId !== uid) return

    out.push({
      id: d.id,
      fileName: att.fileName || 'download',
      mimeType: att.mimeType || 'application/octet-stream',
      data: att.data,
      senderName: m.senderName || 'Member',
      createdAt: m.createdAt,
    })
  })
  out.sort((a, b) => messageCreatedMs({ createdAt: a.createdAt }) - messageCreatedMs({ createdAt: b.createdAt }))
  return out
}

export async function sendMeetingChatMessage(channelName, user, { text, audienceType, recipientId, attachment, replyTo }) {
  const uid = user?.uid
  if (!uid) throw new Error('Not signed in.')
  const t = (text || '').trim()
  if (!t && !attachment) throw new Error('Message is empty.')
  const aud = audienceType === 'direct' ? 'direct' : 'everyone'
  if (aud === 'direct' && (!recipientId || recipientId === uid)) {
    throw new Error('Pick someone to message.')
  }
  const payload = {
    senderId: uid,
    senderName: user.displayName || user.email || 'Member',
    text: t,
    audienceType: aud,
    createdAt: serverTimestamp(),
  }
  if (aud === 'direct') payload.recipientId = recipientId
  if (replyTo && typeof replyTo === 'object') {
    payload.replyTo = {
      msgId: String(replyTo.msgId || ''),
      senderId: String(replyTo.senderId || ''),
      senderName: String(replyTo.senderName || ''),
      text: String(replyTo.text || ''),
      attachmentType: replyTo.attachmentType ? String(replyTo.attachmentType) : '',
      attachmentName: replyTo.attachmentName ? String(replyTo.attachmentName) : '',
    }
  }
  if (attachment) {
    if (attachment.type === 'poll' && attachment.question && Array.isArray(attachment.options)) {
      payload.attachment = {
        type: 'poll',
        question: attachment.question,
        options: attachment.options.map((o) => ({
          text: typeof o === 'string' ? o : (o.text || ''),
          votes: [],
        })),
        ended: false,
      }
    } else if (attachment.type === 'document') {
      if (attachment.size != null && attachment.size > MAX_FILE_BYTES) {
        throw new Error('File is too large for in-meeting chat (max ~750KB).')
      }
      payload.attachment = {
        type: 'document',
        fileName: attachment.fileName || 'file',
        mimeType: attachment.mimeType || 'application/octet-stream',
        data: attachment.data,
      }
    } else {
      payload.attachment = attachment
    }
  }
  await addDoc(collection(db, 'videoChannels', channelName, 'messages'), payload)
}

export async function toggleMeetingChatReaction(channelName, messageId, userId, emoji) {
  const ch = String(channelName || '').trim()
  const msgId = String(messageId || '').trim()
  const uid = String(userId || '').trim()
  const em = String(emoji || '').trim()
  if (!ch || !msgId || !uid || !em) throw new Error('Missing reaction fields.')

  const ref = doc(db, 'videoChannels', ch, 'messages', msgId)
  const msgDoc = await getDoc(ref)
  const data = msgDoc.data() || {}
  const reactions = { ...(data.reactions || {}) }
  const list = Array.isArray(reactions[em]) ? [...reactions[em]] : []
  const has = list.includes(uid)
  const next = has ? list.filter((x) => x !== uid) : [...list, uid]
  if (next.length === 0) delete reactions[em]
  else reactions[em] = next

  await updateDoc(ref, {
    reactions: Object.keys(reactions).length ? reactions : deleteField(),
  })
}

export async function voteMeetingPoll(channelName, messageId, userId, optionIndex) {
  const ref = doc(db, 'videoChannels', channelName, 'messages', messageId)
  const msgDoc = await getDoc(ref)
  const data = msgDoc.data()
  if (!data || data.attachment?.type !== 'poll') throw new Error('Not a poll.')
  if (data.attachment.ended) throw new Error('Poll ended.')
  const options = [...(data.attachment.options || [])]
  if (optionIndex < 0 || optionIndex >= options.length) throw new Error('Invalid option.')
  const normalized = options.map((o) => ({
    text: typeof o === 'string' ? o : (o.text || ''),
    votes: Array.isArray(o?.votes) ? [...o.votes] : [],
  }))
  normalized.forEach((o) => {
    o.votes = o.votes.filter((id) => id !== userId)
  })
  normalized[optionIndex].votes.push(userId)
  await updateDoc(ref, {
    attachment: { ...data.attachment, options: normalized },
  })
}

export async function endMeetingPoll(channelName, messageId, actingUserId, meetingHostUid) {
  const ref = doc(db, 'videoChannels', channelName, 'messages', messageId)
  const msgDoc = await getDoc(ref)
  const data = msgDoc.data()
  if (!data || data.attachment?.type !== 'poll') throw new Error('Not a poll.')
  if (!meetingHostUid || actingUserId !== meetingHostUid) throw new Error('Only the meeting host can end this poll.')
  if (data.attachment.ended) return
  await updateDoc(ref, {
    attachment: { ...data.attachment, ended: true },
  })
}

export { MAX_FILE_BYTES }
