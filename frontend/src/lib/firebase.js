/**
 * NOTUS FIREBASE INIT  -  SINGLE SOURCE OF TRUTH
 *
 * Architecture rules (see Documentation/ARCHITECTURE.md):
 * - This is the ONLY Firebase client init. Do not create another.
 * - Firebase Auth = identity provider (uid is canonical)
 * - Firestore = application data
 * - User profiles: users/{uid} only. No googleUsers, emailUsers, profiles, usersByEmail.
 * - Passwords NEVER in Firestore (Firebase Auth only).
 */
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'
import { getMessaging, isSupported } from 'firebase/messaging'
import { cookieConsent } from './cookieConsent'
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig)

let _analytics = null
let _analyticsInitPromise = null

export function getAnalyticsOrNull() {
  return _analytics
}

/**
 * Analytics is optional and consent-gated.
 * - If there is no measurementId, analytics stays disabled.
 * - If user has not consented to analytics cookies, analytics stays disabled.
 * - When consent flips to allow, we initialize analytics lazily.
 */
export async function initAnalyticsIfAllowed() {
  if (typeof window === 'undefined') return null
  if (!firebaseConfig.measurementId) return null
  if (!cookieConsent.get().analytics) return null
  if (_analytics) return _analytics

  if (!_analyticsInitPromise) {
    _analyticsInitPromise = import('firebase/analytics')
      .then(({ getAnalytics }) => {
        _analytics = getAnalytics(app)
        return _analytics
      })
      .catch(() => null)
  }
  return _analyticsInitPromise
}

// Keep legacy export name available, but do not eagerly initialize.
export const analytics = null

export const auth = getAuth(app)

// Keep users logged in until they explicitly sign out
setPersistence(auth, browserLocalPersistence).catch(() => {});
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()

/** Cloud Functions (e.g. getAgoraToken for video call). Use region matching your deployed functions. */
export function getFunctionsApp() {
  return getFunctions(app, 'us-central1')
}

/** FCM: only in browser and if supported (HTTPS, Push API). Lazy-init to avoid SSR errors. */
let _messaging = null;
export async function getMessagingOrNull() {
  if (typeof window === 'undefined') return null;
  const supported = await isSupported();
  if (!supported) return null;
  if (!_messaging) _messaging = getMessaging(app);
  return _messaging;
}

/** Safari blocks popups/third-party cookies  -  use redirect instead of popup for Google sign-in */
export const isSafari = typeof navigator !== 'undefined' &&
  /Safari/.test(navigator.userAgent) &&
  !/Chrome|Chromium|CriOS/.test(navigator.userAgent);

export default app;
