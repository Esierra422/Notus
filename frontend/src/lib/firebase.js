/**
 * Client Firebase init (auth, Firestore, functions, optional messaging).
 * One `initializeApp` for the SPA; details in Documentation/ARCHITECTURE.md.
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

/** Analytics: gated on measurementId + cookie consent; lazy-loaded when allowed. */
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

// Legacy name; analytics stays null until initAnalyticsIfAllowed runs.
export const analytics = null

export const auth = getAuth(app)

// Persist auth session in the browser until sign-out
setPersistence(auth, browserLocalPersistence).catch(() => {});
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()

/** Callable functions client (`us-central1` — match deployed region). */
export function getFunctionsApp() {
  return getFunctions(app, 'us-central1')
}

/** FCM when the browser supports it; lazy init (no SSR). */
let _messaging = null;
export async function getMessagingOrNull() {
  if (typeof window === 'undefined') return null;
  const supported = await isSupported();
  if (!supported) return null;
  if (!_messaging) _messaging = getMessaging(app);
  return _messaging;
}

/** Safari: prefer redirect flow for Google (popup/cookies). */
export const isSafari = typeof navigator !== 'undefined' &&
  /Safari/.test(navigator.userAgent) &&
  !/Chrome|Chromium|CriOS/.test(navigator.userAgent);

export default app;
