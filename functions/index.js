/**
 * Cloud Functions for Notus — push notifications and video call tokens.
 *
 * Prerequisites:
 * - Firebase Blaze plan (required for Cloud Functions)
 * - firebase deploy --only functions (from project root)
 * - For video: set AGORA_APP_ID and AGORA_APP_CERTIFICATE (e.g. in functions/.env or via params)
 *
 * Triggers:
 * - onNewMessage: when a message is created in a conversation, send FCM to other members
 * - getAgoraToken: callable — returns Agora RTC token for video calls (production fallback when no Express backend)
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineString } from 'firebase-functions/params'
import { getMessaging } from 'firebase-admin/messaging'
import { getFirestore } from 'firebase-admin/firestore'
import { initializeApp } from 'firebase-admin/app'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { RtcTokenBuilder, RtcRole } = require('agora-token')

const agoraAppId = defineString('AGORA_APP_ID')
const agoraAppCertificate = defineString('AGORA_APP_CERTIFICATE')

initializeApp()
const db = getFirestore()

async function sendToToken(token, notification, data = {}) {
  if (!token) return
  const messaging = getMessaging()
  try {
    await messaging.send({
      token,
      notification: {
        title: notification.title,
        body: notification.body || '',
      },
      data: { ...data },
      webpush: {
        fcmOptions: { link: data.url || '/app' },
      },
    })
  } catch (err) {
    if (err.code === 'messaging/invalid-registration-token' || err.code === 'messaging/registration-token-not-registered') {
      // Token invalid or unregistered — optional: delete from Firestore
    }
    console.warn('FCM send failed', err.code, err.message)
  }
}

async function getFCMTokenForUser(uid) {
  const snap = await db.doc(`users/${uid}/fcmTokens/current`).get()
  return snap.exists ? snap.data()?.token : null
}

/**
 * When a new message is added to a conversation, notify other members (except sender).
 */
export const onNewMessage = onDocumentCreated(
  {
    document: 'organizations/{orgId}/conversations/{convId}/messages/{messageId}',
    region: 'us-central1',
  },
  async (event) => {
    const snap = event.data
    if (!snap) return
    const msg = snap.data()
    const senderId = msg?.senderId
    const text = (msg?.text || '').slice(0, 100)
    const { orgId, convId } = event.params

    const convSnap = await db.doc(`organizations/${orgId}/conversations/${convId}`).get()
    if (!convSnap.exists) return
    const members = convSnap.data()?.members || []
    const recipientIds = members.filter((id) => id !== senderId)

    const convTitle = convSnap.data()?.title || 'New message'
    const title = convTitle.length > 30 ? `${convTitle.slice(0, 27)}…` : convTitle
    const body = text ? (text.length > 80 ? `${text.slice(0, 77)}…` : text) : 'New message'
    const url = `/app/org/${orgId}/chats/${convId}`

    for (const uid of recipientIds) {
      const token = await getFCMTokenForUser(uid)
      await sendToToken(token, { title, body }, { url, type: 'message', orgId, convId })
    }
  }
)

/**
 * When a new organization invitation is created, notify the invitee.
 * We don't have their uid yet (pending), so we can't send FCM by uid. Skip or use a topic by email.
 * For now we skip org invite push (would require email → uid or topic).
 */
// export const onNewOrgInvitation = onDocumentCreated('organizationInvitations/{invitationId}', async (event) => { ... });

/**
 * When a new team invitation is created, same as org — invitee may not have an account yet. Skip for now.
 */

/**
 * Callable: return Agora RTC token for video calls. Used when the app is deployed (e.g. notusapp.com)
 * and there is no separate Express backend — the frontend falls back to this instead of /api/video/token.
 * Requires Firebase Auth. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE in functions config or .env.
 */
export const getAgoraToken = onCall(
  { region: 'us-central1' },
  (request) => {
    const appId = agoraAppId.value()
    const appCertificate = agoraAppCertificate.value()
    if (!appId || !appCertificate) {
      throw new HttpsError('failed-precondition', 'Agora is not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE for the functions.')
    }
    const { channel, uid: uidParam } = request.data || {}
    if (!channel || typeof channel !== 'string' || channel.length < 1) {
      throw new HttpsError('invalid-argument', 'Missing or invalid channel')
    }
    const uid = typeof uidParam === 'number' && Number.isInteger(uidParam) ? uidParam : parseInt(uidParam, 10) || 0
    const expirationTimeInSeconds = 3600
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds
    const token = RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channel, uid, RtcRole.PUBLISHER, privilegeExpiredTs)
    return { token, appId, uid }
  }
)
