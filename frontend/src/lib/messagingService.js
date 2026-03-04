/**
 * Push notifications via Firebase Cloud Messaging (FCM).
 * - Request permission, get token, store in Firestore at users/{uid}/fcmTokens/current
 * - Foreground: onMessage() shows in-app or uses browser Notification
 * - Background: handled by public/firebase-messaging-sw.js
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

/**
 * Request browser permission for notifications. Resolves to 'granted' | 'denied' | 'default'.
 */
export async function requestNotificationPermission() {
  if (!isPushSupported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  return permission
}

/**
 * Get current FCM token. Requires permission granted and VAPID key in env.
 * Registers service worker at /firebase-messaging-sw.js if not already.
 */
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

/**
 * Save FCM token to Firestore for the current user. Call after login.
 * Path: users/{uid}/fcmTokens/current
 */
export async function saveTokenToFirestore(uid, token) {
  if (!uid || !token) return
  const ref = doc(db, 'users', uid, FCM_TOKENS_COLLECTION, CURRENT_TOKEN_ID)
  await setDoc(ref, {
    token,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * Remove FCM token from Firestore (e.g. on logout or when user disables notifications).
 */
export async function removeTokenFromFirestore(uid) {
  if (!uid) return
  const { deleteDoc } = await import('firebase/firestore')
  const ref = doc(db, 'users', uid, FCM_TOKENS_COLLECTION, CURRENT_TOKEN_ID)
  await deleteDoc(ref)
}

/**
 * Register for push: request permission, get token, save to Firestore.
 * Returns { granted: boolean, token: string | null }.
 */
export async function registerForPush(uid) {
  if (!uid || !isPushSupported()) return { granted: false, token: null }
  const permission = await requestNotificationPermission()
  if (permission !== 'granted') return { granted: false, token: null }
  const token = await getFCMToken()
  if (token) await saveTokenToFirestore(uid, token)
  return { granted: true, token }
}

/**
 * Subscribe to foreground messages (app in focus). Use for in-app toast or to update UI.
 */
export function onForegroundMessage(callback) {
  getMessagingOrNull().then((messaging) => {
    if (!messaging) return
    onMessage(messaging, (payload) => {
      callback(payload)
    })
  }).catch(() => {})
}
