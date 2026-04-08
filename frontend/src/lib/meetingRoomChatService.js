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

/** Normalize one poll option from Firestore (string, object, or bad data). */
function normalizePollOptionEntry(o) {
  if (typeof o === 'string') return { text: o.trim(), votes: [] }
  if (o != null && typeof o === 'object') {
    return {
      text: String(o.text ?? '').trim(),
      votes: Array.isArray(o.votes) ? o.votes.filter((id) => typeof id === 'string' && id) : [],
    }
  }
  return { text: '', votes: [] }
}

/**
 * Firestore (or bad clients) can store maps / non-strings in poll fields. That used to crash React
 * ("Objects are not valid as a React child"), tripping the app ErrorBoundary and unmounting the whole
 * video page — which runs leaveChannel() and disconnects everyone.
 */
function coerceOptionsArray(raw) {
  if (Array.isArray(raw)) return raw
  if (raw != null && typeof raw === 'object') {
    return Object.keys(raw)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => raw[k])
      .filter((x) => x != null)
  }
  return []
}

function sanitizeMeetingChatDoc(id, data) {
  const raw = data && typeof data === 'object' ? data : {}
  const m = { id, ...raw }
  m.text = typeof m.text === 'string' ? m.text : m.text == null ? '' : String(m.text)
  m.senderId = typeof m.senderId === 'string' ? m.senderId : String(m.senderId || '')
  m.senderName =
    typeof m.senderName === 'string' ? m.senderName : m.senderName == null ? 'Member' : String(m.senderName)
  if (m.recipientId != null && m.recipientId !== '') {
    m.recipientId = typeof m.recipientId === 'string' ? m.recipientId : String(m.recipientId)
  }

  const att = m.attachment
  if (att && att.type === 'poll') {
    const qRaw = att.question
    const question =
      typeof qRaw === 'string' ? qRaw.trim() || 'Poll' : qRaw == null ? 'Poll' : String(qRaw).trim() || 'Poll'
    const optsIn = coerceOptionsArray(att.options)
    const opts = optsIn
      .map((o) => normalizePollOptionEntry(o))
      .filter((row) => row.text.length > 0)
      .map((row) => ({
        text: row.text,
        votes: Array.isArray(row.votes) ? row.votes.filter((id) => typeof id === 'string' && id) : [],
      }))
    m.attachment = {
      type: 'poll',
      question,
      options: opts,
      ended: !!att.ended,
    }
  } else if (att && att.type === 'document') {
    m.attachment = {
      type: 'document',
      fileName: typeof att.fileName === 'string' ? att.fileName : String(att.fileName || 'file'),
      mimeType:
        typeof att.mimeType === 'string' ? att.mimeType : String(att.mimeType || 'application/octet-stream'),
      data: typeof att.data === 'string' ? att.data : '',
    }
  }

  const rt = m.replyTo
  if (rt && typeof rt === 'object' && !Array.isArray(rt)) {
    m.replyTo = {
      msgId: String(rt.msgId || ''),
      senderId: String(rt.senderId || ''),
      senderName:
        typeof rt.senderName === 'string' ? rt.senderName : rt.senderName == null ? '' : String(rt.senderName),
      text: typeof rt.text === 'string' ? rt.text : rt.text == null ? '' : String(rt.text),
      attachmentType: String(rt.attachmentType || ''),
      attachmentName:
        typeof rt.attachmentName === 'string'
          ? rt.attachmentName
          : rt.attachmentName == null
            ? ''
            : String(rt.attachmentName),
    }
  } else {
    delete m.replyTo
  }

  if (m.reactions != null && typeof m.reactions === 'object' && !Array.isArray(m.reactions)) {
    const out = {}
    for (const [k, v] of Object.entries(m.reactions)) {
      const emoji = String(k || '').trim()
      if (!emoji) continue
      const ids = Array.isArray(v) ? v.filter((id) => typeof id === 'string' && id) : []
      if (ids.length) out[emoji] = ids
    }
    if (Object.keys(out).length) m.reactions = out
    else delete m.reactions
  } else if (m.reactions != null) {
    delete m.reactions
  }

  return m
}

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
    try {
      const byId = new Map()
      for (const m of [...everyoneDocs, ...directToMe, ...directFromMe]) {
        byId.set(m.id, m)
      }
      const merged = Array.from(byId.values()).sort((a, b) => messageCreatedMs(a) - messageCreatedMs(b))
      onData(merged.slice(-300))
    } catch (e) {
      console.error('[meeting chat] merge failed:', e)
      onError?.(e instanceof Error ? e : new Error(String(e)))
    }
  }

  const unsubEveryone = onSnapshot(
    query(col, where('audienceType', '==', 'everyone'), orderBy('createdAt', 'asc'), limit(250)),
    (snap) => {
      everyoneDocs = snap.docs.map((d) => sanitizeMeetingChatDoc(d.id, d.data()))
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
      directToMe = snap.docs.map((d) => sanitizeMeetingChatDoc(d.id, d.data()))
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
      directFromMe = snap.docs.map((d) => sanitizeMeetingChatDoc(d.id, d.data()))
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
      const opts = attachment.options
        .map((o) => normalizePollOptionEntry(o))
        .filter((row) => row.text.length > 0)
      if (opts.length < 2) {
        throw new Error('A poll needs at least two options.')
      }
      payload.attachment = {
        type: 'poll',
        question: String(attachment.question).trim() || 'Poll',
        options: opts.map((row) => ({ text: row.text, votes: [] })),
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
  const raw = data.attachment.options
  const options = coerceOptionsArray(raw).map((o) => normalizePollOptionEntry(o))
  if (optionIndex < 0 || optionIndex >= options.length) throw new Error('Invalid option.')
  options.forEach((o) => {
    o.votes = o.votes.filter((id) => id !== userId)
  })
  options[optionIndex].votes.push(userId)
  const nextAttachment = { ...data.attachment, options }
  await updateDoc(ref, {
    attachment: nextAttachment,
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
