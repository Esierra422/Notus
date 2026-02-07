/**
 * Firebase Admin SDK — server-side auth & Firestore.
 * Initialize only when credentials are present.
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { config } from '../config/index.js'

const { projectId, clientEmail, privateKey } = config.firebase || {}

if (getApps().length === 0 && projectId && clientEmail && privateKey) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
      privateKeyId: config.firebase?.privateKeyId,
    }),
  })
}
