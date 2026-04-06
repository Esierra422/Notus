/**
 * In-app notifications (Firestore: users/{uid}/notifications).
 */
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'

export const NOTIFICATION_TYPES = {
  meetingInvite: 'meeting_invite',
  instantMeetingInvite: 'instant_meeting_invite',
  /** Scheduled calendar-only event — invite adds the event to the recipient’s calendar view. */
  calendarEventInvite: 'calendar_event_invite',
}

function notifCol(uid) {
  return collection(db, 'users', uid, 'notifications')
}

export async function createMeetingInviteNotifications({
  fromUid,
  recipientUids,
  orgId,
  meetingId,
  title,
  body,
  isInstant = false,
  /** When not instant: calendar-only events vs video / lobby meetings. */
  inviteKind = 'video_meeting',
}) {
  const type = isInstant
    ? NOTIFICATION_TYPES.instantMeetingInvite
    : inviteKind === 'calendar_event'
      ? NOTIFICATION_TYPES.calendarEventInvite
      : NOTIFICATION_TYPES.meetingInvite
  const ids = [...new Set((recipientUids || []).filter(Boolean))].filter((id) => id !== fromUid)
  await Promise.all(
    ids.map((toUid) =>
      addDoc(notifCol(toUid), {
        type,
        read: false,
        createdAt: serverTimestamp(),
        createdBy: fromUid,
        orgId,
        meetingId,
        title: title || 'Meeting',
        body: body || 'You were invited to a meeting.',
      })
    )
  )
}

export function subscribeUnreadNotificationCount(userId, callback) {
  if (!userId) return () => {}
  const q = query(notifCol(userId), where('read', '==', false), limit(200))
  return onSnapshot(
    q,
    (snap) => callback(snap.size),
    (err) => {
      console.warn('Notification count listener failed', err)
      callback(0)
    }
  )
}

export function subscribeNotifications(userId, maxCount, callback) {
  if (!userId) return () => {}
  const q = query(notifCol(userId), orderBy('createdAt', 'desc'), limit(maxCount))
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    (err) => {
      console.warn('Notifications listener failed (add Firestore index on users/{uid}/notifications createdAt if needed)', err)
      callback([])
    }
  )
}

export async function markNotificationRead(userId, notificationId) {
  await updateDoc(doc(db, 'users', userId, 'notifications', notificationId), { read: true })
}

export async function markAllNotificationsRead(userId, items) {
  await Promise.all((items || []).filter((n) => !n.read).map((n) => markNotificationRead(userId, n.id)))
}
