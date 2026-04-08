/**
 * FCM: token → users/{uid}/fcmTokens/current; foreground onMessage; background in firebase-messaging-sw.js
 */
import { getToken, onMessage } from 'firebase/messaging'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { getMessagingOrNull } from './firebase'
import { db } from './firebase'

const FCM_TOKENS_COLLECTION = 'fcmTokens'
const CURRENT_TOKEN_ID = 'current'
const VAPID_KEY = import.meta.env.VITE_VAPID_KEY

export function isPushSupported() {
  return typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
}

/** Notification.requestPermission → granted | denied | default | unsupported */
export async function requestNotificationPermission() {
  if (!isPushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  return permission
}

/** Token after grant + VAPID; wires SW at /firebase-messaging-sw.js */
export async function getFCMToken() {
  if (!VAPID_KEY) {
    console.warn('Push: VITE_VAPID_KEY not set. Add Web Push key from Firebase Console → Project Settings → Cloud Messaging.')
    return null
  }
  const messaging = await getMessagingOrNull()
  if (!messaging) return null
  const permission = Notification.permission
  if (permission !== 'granted') return null
  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY })
    return token || null
  } catch (err) {
    console.warn('Push: getToken failed', err)
    return null
  }
}

/** Persist token under users/{uid}/fcmTokens/current */
export async function saveTokenToFirestore(uid, token) {
  if (!uid || !token) return
  const ref = doc(db, 'users', uid, FCM_TOKENS_COLLECTION, CURRENT_TOKEN_ID)
  await setDoc(ref, {
    token,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/** Drop stored token (logout / push off) */
export async function removeTokenFromFirestore(uid) {
  if (!uid) return
  const { deleteDoc } = await import('firebase/firestore')
  const ref = doc(db, 'users', uid, FCM_TOKENS_COLLECTION, CURRENT_TOKEN_ID)
  await deleteDoc(ref)
}

/** Permission + getToken + save; { granted, token } */
export async function registerForPush(uid) {
  if (!uid || !isPushSupported()) return { granted: false, token: null }
  const permission = await requestNotificationPermission()
  if (permission !== 'granted') return { granted: false, token: null }
  const token = await getFCMToken()
  if (token) await saveTokenToFirestore(uid, token)
  return { granted: true, token }
}

/** Foreground payload listener (toast / UI) */
export function onForegroundMessage(callback) {
  getMessagingOrNull().then((messaging) => {
    if (!messaging) return
    onMessage(messaging, (payload) => {
      callback(payload)
    })
  }).catch(() => {})
}
