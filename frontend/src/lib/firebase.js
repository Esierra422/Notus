/**
 * NOTUS FIREBASE INIT — SINGLE SOURCE OF TRUTH
 *
 * Architecture rules (see Documentation/ARCHITECTURE.md):
 * - This is the ONLY Firebase client init. Do not create another.
 * - Firebase Auth = identity provider (uid is canonical)
 * - Firestore = application data
 * - User profiles: users/{uid} only. No googleUsers, emailUsers, profiles, usersByEmail.
 * - Passwords NEVER in Firestore (Firebase Auth only).
 */
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getMessaging, isSupported } from 'firebase/messaging';
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const analytics =
  typeof window !== 'undefined' && firebaseConfig.measurementId
    ? getAnalytics(app)
    : null;
export const auth = getAuth(app);

// Keep users logged in until they explicitly sign out
setPersistence(auth, browserLocalPersistence).catch(() => {});
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

/** Cloud Functions (e.g. getAgoraToken for video call). Use region matching your deployed functions. */
export function getFunctionsApp() {
  return getFunctions(app, 'us-central1');
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

/** Safari blocks popups/third-party cookies — use redirect instead of popup for Google sign-in */
export const isSafari = typeof navigator !== 'undefined' &&
  /Safari/.test(navigator.userAgent) &&
  !/Chrome|Chromium|CriOS/.test(navigator.userAgent);

export default app;
