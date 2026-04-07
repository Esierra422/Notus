/**
 * In-meeting chat under videoChannels/{channelId}/messages (Firestore).
 * Supports everyone / direct messages, optional attachments (file, poll).
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  or,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase.js'

const MAX_FILE_BYTES = 750_000 // ~750KB base64 in doc — keep small for Firestore

export function subscribeMeetingChatMessages(channelName, userId, onData, onError) {
  const col = collection(db, 'videoChannels', channelName, 'messages')
  const q = query(
    col,
    or(
      where('audienceType', '==', 'everyone'),
      where('recipientId', '==', userId),
      where('senderId', '==', userId)
    ),
    orderBy('createdAt', 'asc'),
    limit(250)
  )
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    onError
  )
}

export async function sendMeetingChatMessage(channelName, user, { text, audienceType, recipientId, attachment }) {
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
